import asyncio
import json
import io
import uuid
import pytest
from starlette.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.core.database import init_db, AsyncSessionLocal
from app.models.otp import OTP
from app.models.user import User

@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    asyncio.run(init_db())

def receive_event(ws, target_event, max_tries=5):
    for _ in range(max_tries):
        payload = ws.receive_json()
        if payload.get("event") == target_event:
            return payload
    return None

def test_health_check_and_page_routes():
    with TestClient(app) as client:
        # Health check
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json()["status"] == "healthy"
        assert res.json()["project"] == "Gravity"

        # Part 1: Auth and Registration Pages
        auth_page = client.get("/login")
        assert auth_page.status_code == 200
        assert "Gravity" in auth_page.text

        reg_page = client.get("/register")
        assert reg_page.status_code == 200
        assert "Gravity" in reg_page.text

        # Verify OTP HTML Page
        verify_page = client.get("/verify-otp")
        assert verify_page.status_code == 200
        assert "Verify Your Identity" in verify_page.text

        # Set Password HTML Page
        set_pwd_page = client.get("/set-password")
        assert set_pwd_page.status_code == 200
        assert "Create Password" in set_pwd_page.text

        # Part 2: Main Chat Application Page
        chat_page = client.get("/home")
        assert chat_page.status_code == 200
        assert "Gravity" in chat_page.text or "Chats" in chat_page.text

        app_page = client.get("/app")
        assert app_page.status_code == 200
        assert "Gravity" in app_page.text or "Chats" in app_page.text

def test_full_multistep_registration_with_custom_fields():
    """
    Tests the 4-step Care Portal workflow with custom details:
    Step 1: Full Name, Email, Birth Day, Phone Number -> Generates OTP & redirects to /verify-otp
    Step 2: Check OTP Timer & Resend OTP
    Step 3: Verify 6-digit OTP Code -> Status becomes VERIFIED & redirects to /set-password
    Step 4: Set Password -> Hashes password with bcrypt, marks OTP COMPLETED & issues JWT
    Step 5: Login with newly created credentials
    """
    with TestClient(app) as client:
        uid_suffix = uuid.uuid4().hex[:6]
        test_email = f"patient_{uid_suffix}@careportal.com"
        test_name = f"Patient Test {uid_suffix}"
        test_birthday = "1998-05-15"

        # ----------------------------------------------------
        # Step 1: Registration Form Submission
        # ----------------------------------------------------
        signup_res = client.post(
            "/api/signup",
            json={
                "name": test_name,
                "email": test_email,
                "birthday": test_birthday
            }
        )
        assert signup_res.status_code == 201
        signup_data = signup_res.json()
        assert signup_data["status"] == "success"
        assert signup_data["redirect"] == f"/verify-otp?email={test_email}"

        # ----------------------------------------------------
        # Step 2: OTP Time check & Resend OTP
        # ----------------------------------------------------
        time_res = client.get(f"/api/otp-time?email={test_email}")
        assert time_res.status_code == 200
        assert time_res.json()["remaining_seconds"] > 0

        resend_res = client.post("/api/resend-otp", json={"email": test_email})
        assert resend_res.status_code == 200
        assert resend_res.json()["status"] == "success"

        # Fetch the generated OTP code from the database for verification test
        def fetch_db_otp_sync():
            from app.core.config import settings
            import pymysql
            import sqlite3
            if "mysql" in settings.DATABASE_URL:
                conn = pymysql.connect(
                    host=settings.DB_HOST,
                    port=int(settings.DB_PORT),
                    user=settings.DB_USER,
                    password=settings.DB_PASSWORD,
                    database=settings.DB_NAME
                )
                with conn.cursor() as cur:
                    cur.execute("SELECT otp_number FROM otp WHERE email = %s", (test_email,))
                    row = cur.fetchone()
                    conn.close()
                    return row[0] if row else None
            else:
                conn = sqlite3.connect("backend/gravity.db")
                cur = conn.cursor()
                cur.execute("SELECT otp_number FROM otp WHERE email = ?", (test_email,))
                row = cur.fetchone()
                conn.close()
                return row[0] if row else None

        otp_code = fetch_db_otp_sync()
        assert otp_code is not None and len(otp_code) == 6

        # Test invalid OTP code error handling
        bad_otp_res = client.post("/api/verify-otp", json={"email": test_email, "otp": "000000"})
        assert bad_otp_res.status_code == 400

        # ----------------------------------------------------
        # Step 3: Verify OTP code
        # ----------------------------------------------------
        verify_res = client.post("/api/verify-otp", json={"email": test_email, "otp": otp_code})
        assert verify_res.status_code == 200
        verify_data = verify_res.json()
        assert verify_data["status"] == "success"
        assert verify_data["redirect"] == f"/set-password?email={test_email}"

        # ----------------------------------------------------
        # Step 4: Set Password
        # ----------------------------------------------------
        set_pwd_res = client.post(
            "/api/set-password",
            json={"email": test_email, "password": "securepassword123"}
        )
        assert set_pwd_res.status_code == 200
        set_pwd_data = set_pwd_res.json()
        assert set_pwd_data["status"] == "success"
        assert set_pwd_data["access_token"] is not None
        assert set_pwd_data["user"]["full_name"] == test_name
        assert set_pwd_data["user"]["phone_or_email"] == test_email
        assert set_pwd_data["user"]["birthday"] == test_birthday

        # ----------------------------------------------------
        # Step 5: Log in with newly created credentials
        # ----------------------------------------------------
        login_res = client.post(
            "/api/login",
            json={"email": test_email, "password": "securepassword123"}
        )
        assert login_res.status_code == 200
        login_data = login_res.json()
        assert login_data["access_token"] is not None
        assert login_data["user"]["phone_or_email"] == test_email

        # ----------------------------------------------------
        # Step 6: Test Duplicate Signup Rejection
        # ----------------------------------------------------
        dup_res = client.post(
            "/api/signup",
            json={
                "name": test_name,
                "email": test_email,
                "birthday": test_birthday
            }
        )
        assert dup_res.status_code == 400
        assert "already registered" in dup_res.json()["detail"].lower()

def test_registration_validation_errors():
    with TestClient(app) as client:
        # Missing name
        res1 = client.post("/api/signup", json={"email": "valid@email.com"})
        assert res1.status_code == 400
        assert "name is required" in res1.json()["detail"].lower()

        # Missing email
        res2 = client.post("/api/signup", json={"name": "John Doe"})
        assert res2.status_code == 400
        assert "email address is required" in res2.json()["detail"].lower()

        # Invalid email format
        res3 = client.post("/api/signup", json={"name": "John Doe", "email": "not-an-email"})
        assert res3.status_code == 400
        assert "invalid email" in res3.json()["detail"].lower()


def test_websocket_realtime_interactions():
    with TestClient(app) as client:
        # Login Alex
        alex_login = client.post(
            "/api/login",
            json={"email": "alex@gravity.chat", "password": "password123"}
        )
        alex_token = alex_login.json()["access_token"]

        # Login Sarah
        sarah_login = client.post(
            "/api/login",
            json={"email": "sarah@gravity.chat", "password": "password123"}
        )
        sarah_token = sarah_login.json()["access_token"]

        # Open concurrent WebSockets for both Alex and Sarah
        with client.websocket_connect(f"/ws/chat?token={alex_token}") as ws_alex:
            alex_init = receive_event(ws_alex, "connected")
            assert alex_init is not None

            with client.websocket_connect(f"/ws/chat?token={sarah_token}") as ws_sarah:
                sarah_init = receive_event(ws_sarah, "connected")
                assert sarah_init is not None

                # Alex sends a message to direct chat
                ws_alex.send_json({
                    "event": "message_send",
                    "data": {
                        "conversation_id": "c-alex-sarah",
                        "content": "Testing real-time messaging after Gravity authentication!",
                        "message_type": "text",
                        "client_temp_id": "temp-alex-777"
                    }
                })

                # Alex receives ACK
                ack = receive_event(ws_alex, "message_ack")
                assert ack is not None
                assert ack["data"]["client_temp_id"] == "temp-alex-777"
                assert ack["data"]["status"] == "delivered"

                # Sarah receives the message
                sarah_recv = receive_event(ws_sarah, "message_receive")
                assert sarah_recv is not None
                assert sarah_recv["data"]["content"] == "Testing real-time messaging after Gravity authentication!"
                msg_id = sarah_recv["data"]["id"]

                # Sarah sends typing indicator
                ws_sarah.send_json({
                    "event": "typing_start",
                    "data": {"conversation_id": "c-alex-sarah"}
                })

                alex_typing = receive_event(ws_alex, "typing_start")
                assert alex_typing is not None
                assert alex_typing["data"]["username"] == "sarah_connor"

                # Sarah sends read receipt
                ws_sarah.send_json({
                    "event": "status_update",
                    "data": {
                        "conversation_id": "c-alex-sarah",
                        "status": "read",
                        "message_ids": [msg_id]
                    }
                })

                alex_status = receive_event(ws_alex, "status_update")
                assert alex_status is not None
                assert alex_status["data"]["status"] == "read"
                assert msg_id in alex_status["data"]["message_ids"]
