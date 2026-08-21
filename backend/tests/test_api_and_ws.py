import sys
from pathlib import Path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

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

        # Reset Password HTML Page
        reset_pwd_page = client.get("/reset-password")
        assert reset_pwd_page.status_code == 200
        assert "Reset Password" in reset_pwd_page.text

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
        test_username = f"patient_{uid_suffix}"
        test_birthday = "1998-05-15"

        # ----------------------------------------------------
        # Step 0: Check Username Availability
        # ----------------------------------------------------
        check_res = client.get(f"/api/check-username?username={test_username}")
        assert check_res.status_code == 200
        assert check_res.json()["available"] is True

        # ----------------------------------------------------
        # Step 1: Registration Form Submission with custom User ID
        # ----------------------------------------------------
        signup_res = client.post(
            "/api/signup",
            json={
                "name": test_name,
                "username": test_username,
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
            from pathlib import Path
            from app.core.config import settings, BASE_DIR
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
                db_path = BASE_DIR / "gravity.db"
                conn = sqlite3.connect(str(db_path))
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
        # Step 6: Test Duplicate Username Rejection & Duplicate Email Rejection
        # ----------------------------------------------------
        dup_username_res = client.post(
            "/api/signup",
            json={
                "name": "Different Person",
                "username": test_username,
                "email": f"different_{uid_suffix}@careportal.com"
            }
        )
        assert dup_username_res.status_code == 400
        assert "already taken" in dup_username_res.json()["detail"].lower()

        dup_res = client.post(
            "/api/signup",
            json={
                "name": test_name,
                "username": f"another_{uid_suffix}",
                "email": test_email,
                "birthday": test_birthday
            }
        )
        assert dup_res.status_code == 400
        assert "already registered" in dup_res.json()["detail"].lower()

def test_forgot_and_reset_password_workflow():
    """
    Tests the VaultSync Forgot Password -> Reset Password lifecycle:
    1. Registers a new test user
    2. Rejects unknown email with 404
    3. Successfully sends 6-digit OTP for registered user
    4. Validates OTP via /api/verify-otp
    5. Sets new password via /api/set-password
    6. Logs in with the new password
    """
    with TestClient(app) as client:
        # Helper to fetch OTP from database
        def fetch_db_otp_sync(email):
            from pathlib import Path
            import sqlite3
            import pymysql
            from app.core.config import settings, BASE_DIR
            if "mysql" in settings.DATABASE_URL:
                conn = pymysql.connect(
                    host=settings.DB_HOST,
                    port=int(settings.DB_PORT),
                    user=settings.DB_USER,
                    password=settings.DB_PASSWORD,
                    database=settings.DB_NAME
                )
                with conn.cursor() as cur:
                    cur.execute("SELECT otp_number FROM otp WHERE email = %s", (email,))
                    row = cur.fetchone()
                    conn.close()
                    return row[0] if row else None
            else:
                db_path = BASE_DIR / "gravity.db"
                conn = sqlite3.connect(str(db_path))
                cur = conn.cursor()
                cur.execute("SELECT otp_number FROM otp WHERE email = ?", (email,))
                row = cur.fetchone()
                conn.close()
                return row[0] if row else None

        # 1. Register a test user
        uid = uuid.uuid4().hex[:6]
        target_email = f"user_forgot_{uid}@gravity.chat"
        client.post("/api/signup", json={"name": f"User {uid}", "username": f"user_{uid}", "email": target_email})
        otp1 = fetch_db_otp_sync(target_email)
        client.post("/api/verify-otp", json={"email": target_email, "otp": otp1})
        client.post("/api/set-password", json={"email": target_email, "password": "originalpassword123"})

        # 2. Non-existent user rejection
        bad_res = client.post("/api/forgot-password", json={"email": "nonexistent_user_999@gravity.chat"})
        assert bad_res.status_code == 404
        assert "no registered account found" in bad_res.json()["detail"].lower()

        # 3. Existing user requests password reset
        forgot_res = client.post("/api/forgot-password", json={"email": target_email})
        assert forgot_res.status_code == 200
        assert forgot_res.json()["status"] == "success"
        assert forgot_res.json()["redirect"] == f"/verify-otp?email={target_email}"

        # 4. Fetch and verify reset OTP
        otp_reset = fetch_db_otp_sync(target_email)
        assert otp_reset is not None and len(otp_reset) == 6

        verify_res = client.post("/api/verify-otp", json={"email": target_email, "otp": otp_reset})
        assert verify_res.status_code == 200
        assert verify_res.json()["status"] == "success"

        # 5. Set new password
        new_password = "newresetpassword2026"
        set_pwd_res = client.post("/api/set-password", json={"email": target_email, "password": new_password})
        assert set_pwd_res.status_code == 200
        assert set_pwd_res.json()["access_token"] is not None

        # 6. Log in with new password
        login_res = client.post("/api/login", json={"email": target_email, "password": new_password})
        assert login_res.status_code == 200
        assert login_res.json()["access_token"] is not None


def test_websocket_realtime_interactions():
    with TestClient(app) as client:
        def fetch_db_otp_sync(email):
            from pathlib import Path
            import sqlite3
            import pymysql
            from app.core.config import settings, BASE_DIR
            if "mysql" in settings.DATABASE_URL:
                conn = pymysql.connect(
                    host=settings.DB_HOST,
                    port=int(settings.DB_PORT),
                    user=settings.DB_USER,
                    password=settings.DB_PASSWORD,
                    database=settings.DB_NAME
                )
                with conn.cursor() as cur:
                    cur.execute("SELECT otp_number FROM otp WHERE email = %s", (email,))
                    row = cur.fetchone()
                    conn.close()
                    return row[0] if row else None
            else:
                db_path = BASE_DIR / "gravity.db"
                conn = sqlite3.connect(str(db_path))
                cur = conn.cursor()
                cur.execute("SELECT otp_number FROM otp WHERE email = ?", (email,))
                row = cur.fetchone()
                conn.close()
                return row[0] if row else None

        # Register User A
        uid_a = uuid.uuid4().hex[:6]
        email_a = f"alice_{uid_a}@gravity.chat"
        client.post("/api/signup", json={"name": f"Alice {uid_a}", "username": f"alice_{uid_a}", "email": email_a})
        otp_a = fetch_db_otp_sync(email_a)
        client.post("/api/verify-otp", json={"email": email_a, "otp": otp_a})
        res_a = client.post("/api/set-password", json={"email": email_a, "password": "password123"})
        token_a = res_a.json()["access_token"]
        user_a_id = res_a.json()["user"]["id"]
        username_a = res_a.json()["user"]["username"]

        # Register User B
        uid_b = uuid.uuid4().hex[:6]
        email_b = f"bob_{uid_b}@gravity.chat"
        client.post("/api/signup", json={"name": f"Bob {uid_b}", "username": f"bob_{uid_b}", "email": email_b})
        otp_b = fetch_db_otp_sync(email_b)
        client.post("/api/verify-otp", json={"email": email_b, "otp": otp_b})
        res_b = client.post("/api/set-password", json={"email": email_b, "password": "password123"})
        token_b = res_b.json()["access_token"]
        user_b_id = res_b.json()["user"]["id"]

        # Create Direct Conversation between User A and User B
        conv_res = client.post(
            "/api/conversations/direct",
            headers={"Authorization": f"Bearer {token_a}"},
            json={"target_user_id": user_b_id}
        )
        assert conv_res.status_code == 201
        conversation_id = conv_res.json()["id"]

        # Open concurrent WebSockets for both User A and User B
        with client.websocket_connect(f"/ws/chat?token={token_a}") as ws_a:
            init_a = receive_event(ws_a, "connected")
            assert init_a is not None

            with client.websocket_connect(f"/ws/chat?token={token_b}") as ws_b:
                init_b = receive_event(ws_b, "connected")
                assert init_b is not None

                # User A sends a message
                ws_a.send_json({
                    "event": "message_send",
                    "data": {
                        "conversation_id": conversation_id,
                        "content": "Testing real-time messaging after Gravity authentication!",
                        "message_type": "text",
                        "client_temp_id": f"temp-{uid_a}"
                    }
                })

                # User A receives ACK
                ack = receive_event(ws_a, "message_ack")
                assert ack is not None
                assert ack["data"]["client_temp_id"] == f"temp-{uid_a}"
                assert ack["data"]["status"] == "delivered"

                # User B receives the message
                b_recv = receive_event(ws_b, "message_receive")
                assert b_recv is not None
                assert b_recv["data"]["content"] == "Testing real-time messaging after Gravity authentication!"
                msg_id = b_recv["data"]["id"]

                # User A sends typing indicator
                ws_a.send_json({
                    "event": "typing_start",
                    "data": {"conversation_id": conversation_id}
                })

                b_typing = receive_event(ws_b, "typing_start")
                assert b_typing is not None
                assert b_typing["data"]["username"] == username_a

                # User B sends read receipt
                ws_b.send_json({
                    "event": "status_update",
                    "data": {
                        "conversation_id": conversation_id,
                        "status": "read",
                        "message_ids": [msg_id]
                    }
                })

                a_status = receive_event(ws_a, "status_update")
                assert a_status is not None
                assert a_status["data"]["status"] == "read"
                assert msg_id in a_status["data"]["message_ids"]

def test_database_user_search_engine():
    """
    Tests database-backed search engine for users:
    1. Search by exact User ID (numeric, e.g. 5)
    2. Search by User ID with prefixes (e.g. id:5, #5, uid:5)
    3. Search by Email address (full and partial)
    4. Search by Username (with and without '@' prefix)
    5. Search by Full Name
    6. Verify include_self parameter behavior
    """
    with TestClient(app) as client:
        def fetch_db_otp_sync(email):
            from pathlib import Path
            import sqlite3
            import pymysql
            from app.core.config import settings, BASE_DIR
            if "mysql" in settings.DATABASE_URL:
                conn = pymysql.connect(
                    host=settings.DB_HOST,
                    port=int(settings.DB_PORT),
                    user=settings.DB_USER,
                    password=settings.DB_PASSWORD,
                    database=settings.DB_NAME
                )
                with conn.cursor() as cur:
                    cur.execute("SELECT otp_number FROM otp WHERE email = %s", (email,))
                    row = cur.fetchone()
                    conn.close()
                    return row[0] if row else None
            else:
                db_path = BASE_DIR / "gravity.db"
                conn = sqlite3.connect(str(db_path))
                cur = conn.cursor()
                cur.execute("SELECT otp_number FROM otp WHERE email = ?", (email,))
                row = cur.fetchone()
                conn.close()
                return row[0] if row else None

        # Create Searcher User
        s_uid = uuid.uuid4().hex[:6]
        searcher_email = f"searcher_{s_uid}@gravity.chat"
        client.post("/api/signup", json={"name": f"Searcher User {s_uid}", "username": f"searcher_{s_uid}", "email": searcher_email})
        otp_s = fetch_db_otp_sync(searcher_email)
        client.post("/api/verify-otp", json={"email": searcher_email, "otp": otp_s})
        res_s = client.post("/api/set-password", json={"email": searcher_email, "password": "password123"})
        token_s = res_s.json()["access_token"]
        searcher_id = res_s.json()["user"]["id"]

        # Create Target User
        t_uid = uuid.uuid4().hex[:6]
        target_name = f"Alexander Mercury {t_uid}"
        target_username = f"alex_{t_uid}"
        target_email = f"alexander_{t_uid}@spacegravity.org"
        client.post("/api/signup", json={"name": target_name, "username": target_username, "email": target_email})
        otp_t = fetch_db_otp_sync(target_email)
        client.post("/api/verify-otp", json={"email": target_email, "otp": otp_t})
        res_t = client.post("/api/set-password", json={"email": target_email, "password": "password123"})
        target_id = res_t.json()["user"]["id"]

        headers = {"Authorization": f"Bearer {token_s}"}

        # 1. Search by exact User ID
        res_id = client.get(f"/api/users/search?q={target_id}", headers=headers)
        assert res_id.status_code == 200
        users_id = res_id.json()
        assert len(users_id) > 0
        assert any(u["id"] == target_id for u in users_id)

        # 2. Search by User ID with prefixes (id:..., #..., uid:...)
        res_prefix_id = client.get(f"/api/users/search?q=id:{target_id}", headers=headers)
        assert res_prefix_id.status_code == 200
        assert any(u["id"] == target_id for u in res_prefix_id.json())

        res_hash_id = client.get(f"/api/users/search?q=%23{target_id}", headers=headers)
        assert res_hash_id.status_code == 200
        assert any(u["id"] == target_id for u in res_hash_id.json())

        # 3. Search by Email address
        res_email = client.get(f"/api/users/search?q={target_email}", headers=headers)
        assert res_email.status_code == 200
        users_email = res_email.json()
        assert len(users_email) > 0
        assert users_email[0]["id"] == target_id
        assert users_email[0]["phone_or_email"] == target_email

        # Partial email search
        res_partial_email = client.get(f"/api/users/search?q=alexander_{t_uid}", headers=headers)
        assert res_partial_email.status_code == 200
        assert any(u["id"] == target_id for u in res_partial_email.json())

        # 4. Search by Username (with and without '@')
        res_user = client.get(f"/api/users/search?q={target_username}", headers=headers)
        assert res_user.status_code == 200
        assert any(u["id"] == target_id for u in res_user.json())

        res_user_at = client.get(f"/api/users/search?q=@{target_username}", headers=headers)
        assert res_user_at.status_code == 200
        assert any(u["id"] == target_id for u in res_user_at.json())

        # 5. Search by Full Name
        res_name = client.get(f"/api/users/search?q=Alexander Mercury", headers=headers)
        assert res_name.status_code == 200
        assert any(u["id"] == target_id for u in res_name.json())

        # 6. Verify caller exclusion by default and inclusion when include_self=True
        res_self_excl = client.get(f"/api/users/search?q={searcher_email}", headers=headers)
        assert res_self_excl.status_code == 200
        assert not any(u["id"] == searcher_id for u in res_self_excl.json())

        res_self_incl = client.get(f"/api/users/search?q={searcher_email}&include_self=true", headers=headers)
        assert res_self_incl.status_code == 200
        assert any(u["id"] == searcher_id for u in res_self_incl.json())

