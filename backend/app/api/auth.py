from datetime import datetime, timezone, timedelta
import uuid
import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, update

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_password_hash, verify_password, create_access_token, decode_access_token
from app.core.email_service import generate_otp_code, send_otp_email_async
from app.models.user import User
from app.models.otp import OTP
from app.schemas.auth import (
    UserRegister, 
    VerifyOtpRequest, 
    ResendOtpRequest, 
    SetPasswordRequest, 
    UserLogin, 
    TokenResponse, 
    StandardResponse, 
    OtpTimeResponse
)
from app.schemas.user import UserOut

router = APIRouter(tags=["Authentication"])
security = HTTPBearer(auto_error=False)

def is_valid_email(email: str) -> bool:
    """Validates email format using regex."""
    email_regex = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
    return re.match(email_regex, email) is not None

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Dependency to retrieve and validate the authenticated user from JWT."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id_raw = payload["sub"]
    user_id = int(user_id_raw) if str(user_id_raw).isdigit() else user_id_raw
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User associated with token does not exist"
        )
    return user

# ==============================================================================
# 1. SIGNUP / REGISTRATION INITIAL STEP
# ==============================================================================
@router.post("/signup", response_model=StandardResponse, status_code=status.HTTP_201_CREATED)
@router.post("/auth/register", response_model=StandardResponse, status_code=status.HTTP_201_CREATED)
@router.post("/register", response_model=StandardResponse, status_code=status.HTTP_201_CREATED)
async def signup_endpoint(data: UserRegister, db: AsyncSession = Depends(get_db)):
    """
    Step 1: Collects user registration details: Full Name, Email, Birthday, Phone Number,
    saves temporary profile, generates a 6-digit OTP and dispatches email.
    """
    name = str(data.name or data.full_name or data.username or '').strip()
    raw_email = str(data.email or data.phone_or_email or '').strip().lower()
    birthday = str(data.birthday or data.dob or '').strip()
    role = str(data.role or 'Member').strip()

    if not name:
        raise HTTPException(status_code=400, detail="Full Name is required.")

    if not raw_email:
        raise HTTPException(status_code=400, detail="Email address is required.")

    if not is_valid_email(raw_email):
        raise HTTPException(status_code=400, detail="Invalid email address format.")

    # Check if user already exists and is fully registered
    user_res = await db.execute(select(User).where(User.phone_or_email == raw_email))
    existing_user = user_res.scalars().first()

    otp_res = await db.execute(select(OTP).where(OTP.email == raw_email))
    otp_entry = otp_res.scalars().first()

    if (existing_user and existing_user.hashed_password) or (otp_entry and otp_entry.status == "COMPLETED"):
        raise HTTPException(status_code=400, detail="An account with this email is already registered. Please log in.")

    # Generate 6-digit OTP
    otp_code = generate_otp_code()
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=10)

    # Sanitize and create valid username
    clean_name = re.sub(r'[^a-zA-Z0-9_]', '', name.replace(" ", "_")).lower()
    if not clean_name:
        clean_name = raw_email.split('@')[0]
    clean_name = re.sub(r'[^a-zA-Z0-9_]', '', clean_name).lower() or f"user_{uuid.uuid4().hex[:6]}"
    username = clean_name[:40]

    if not existing_user:
        # Check username collision
        u_check = await db.execute(select(User).where(User.username == username))
        if u_check.scalars().first():
            username = f"{username[:35]}_{uuid.uuid4().hex[:4]}"

        new_user = User(
            username=username,
            full_name=name,
            phone_or_email=raw_email,
            birthday=birthday,
            hashed_password=get_password_hash(data.password) if data.password else "",
            role=role,
            avatar_url=f"https://api.dicebear.com/7.x/avataaars/svg?seed={username}",
            status_bio="Hey there! I am using Gravity",
            created_at=now
        )
        db.add(new_user)
    else:
        existing_user.full_name = name
        existing_user.birthday = birthday
        existing_user.role = role
        if data.password:
            existing_user.hashed_password = get_password_hash(data.password)

    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=15)

    # Upsert OTP record
    if otp_entry:
        otp_entry.otp_number = otp_code
        otp_entry.status = "ACTIVE"
        otp_entry.attempts = 0
        otp_entry.requested_at = now
        otp_entry.expires_at = expires
    else:
        new_otp = OTP(
            email=raw_email,
            otp_number=otp_code,
            status="ACTIVE",
            attempts=0,
            requested_at=now,
            expires_at=expires
        )
        db.add(new_otp)

    await db.commit()

    # Dispatch OTP email asynchronously via SMTP (or logged in console)
    send_otp_email_async(raw_email, otp_code)

    has_smtp = bool(settings.SENDER_EMAIL and settings.SENDER_APP_PASSWORD)
    msg = "Account validation code generated. Check your email for OTP." if has_smtp else f"Verification code: {otp_code} (Add SENDER_EMAIL in .env for live emails)"

    return StandardResponse(
        status="success",
        message=msg,
        redirect=f"/verify-otp?email={raw_email}"
    )

# ==============================================================================
# 2. OTP REMAINING TIME CHECK
# ==============================================================================
@router.get("/otp-time", response_model=OtpTimeResponse)
async def get_otp_time(email: str = Query(..., description="Target email address"), db: AsyncSession = Depends(get_db)):
    """Returns remaining seconds for active OTP countdown timer."""
    email_clean = email.strip().lower()
    res = await db.execute(select(OTP).where(OTP.email == email_clean))
    otp_record = res.scalars().first()

    if not otp_record:
        raise HTTPException(status_code=404, detail="Verification session not found.")

    if otp_record.status in ["COMPLETED", "LOCKED", "VERIFIED"]:
        return OtpTimeResponse(status="success", remaining_seconds=0, otp_status=otp_record.status)

    now = datetime.now(timezone.utc)
    expires = otp_record.expires_at
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)

    remaining = int((expires - now).total_seconds()) if expires else 0
    if remaining <= 0 or otp_record.status == "EXPIRED":
        otp_record.status = "EXPIRED"
        await db.commit()
        return OtpTimeResponse(status="success", remaining_seconds=0, otp_status="EXPIRED")

    return OtpTimeResponse(status="success", remaining_seconds=remaining, otp_status="ACTIVE")

# ==============================================================================
# 3. VERIFY OTP CODE
# ==============================================================================
@router.post("/verify-otp", response_model=StandardResponse)
async def verify_otp(data: VerifyOtpRequest, db: AsyncSession = Depends(get_db)):
    """Validates user 6-digit OTP code."""
    email_clean = (data.email or '').strip().lower()
    otp_input = re.sub(r'\D', '', str(data.otp or '')).strip()

    if not email_clean:
        raise HTTPException(status_code=400, detail="Email address is required for verification.")

    if len(otp_input) != 6:
        raise HTTPException(status_code=400, detail="Please enter a complete 6-digit verification code.")

    res = await db.execute(select(OTP).where(OTP.email == email_clean))
    otp_record = res.scalars().first()

    if not otp_record:
        raise HTTPException(status_code=400, detail="Verification session not found. Please register your profile first.")

    if otp_record.status == "COMPLETED":
        return StandardResponse(
            status="success",
            message="Account registration already completed. Redirecting to login...",
            redirect="/login"
        )

    if otp_record.status == "VERIFIED":
        return StandardResponse(
            status="success",
            message="Email address verified. Please set your password.",
            redirect=f"/set-password?email={email_clean}"
        )

    if otp_record.status == "LOCKED" or otp_record.attempts >= 5:
        otp_record.status = "LOCKED"
        await db.commit()
        raise HTTPException(status_code=400, detail="Too many failed attempts. Please click 'Resend Code' to request a fresh OTP.")

    now = datetime.now(timezone.utc)
    expires = otp_record.expires_at
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)

    if (expires and (expires - now).total_seconds() <= 0) or otp_record.status == "EXPIRED":
        otp_record.status = "EXPIRED"
        await db.commit()
        raise HTTPException(status_code=400, detail="Verification code has expired. Please click 'Resend Code'.")

    # Match OTP code
    if str(otp_record.otp_number).strip() != otp_input:
        otp_record.attempts += 1
        remaining_tries = max(0, 5 - otp_record.attempts)
        await db.commit()
        raise HTTPException(
            status_code=400,
            detail=f"Incorrect 6-digit verification code. ({remaining_tries} attempts remaining)"
        )

    # Success
    otp_record.status = "VERIFIED"
    otp_record.attempts = 0
    await db.commit()

    return StandardResponse(
        status="success",
        message="Email successfully verified! Proceeding to password setup...",
        redirect=f"/set-password?email={email_clean}"
    )

# ==============================================================================
# 4. RESEND OTP CODE
# ==============================================================================
@router.post("/resend-otp", response_model=StandardResponse)
async def resend_otp(data: ResendOtpRequest, db: AsyncSession = Depends(get_db)):
    """Generates and resends a fresh OTP code."""
    email_clean = (data.email or '').strip().lower()
    if not email_clean:
        raise HTTPException(status_code=400, detail="Email address is required.")

    res = await db.execute(select(OTP).where(OTP.email == email_clean))
    otp_record = res.scalars().first()

    new_otp = generate_otp_code()
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=15)

    if not otp_record:
        otp_record = OTP(
            email=email_clean,
            otp_number=new_otp,
            status="ACTIVE",
            attempts=0,
            requested_at=now,
            expires_at=expires
        )
        db.add(otp_record)
    else:
        otp_record.otp_number = new_otp
        otp_record.status = "ACTIVE"
        otp_record.attempts = 0
        otp_record.requested_at = now
        otp_record.expires_at = expires

    await db.commit()

    send_otp_email_async(email_clean, new_otp)

    has_smtp = bool(settings.SENDER_EMAIL and settings.SENDER_APP_PASSWORD)
    msg = "A fresh verification code has been dispatched to your email." if has_smtp else f"Fresh verification code: {new_otp}"

    return StandardResponse(
        status="success",
        message=msg
    )

# ==============================================================================
# 5. SET PASSWORD & FINALIZE REGISTRATION
# ==============================================================================
@router.post("/set-password", response_model=TokenResponse)
async def set_password(data: SetPasswordRequest, response: Response, db: AsyncSession = Depends(get_db)):
    """Sets user password, completes registration, and issues signed JWT access token."""
    email_clean = data.email.strip().lower()
    password = data.password.strip()

    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long.")

    otp_res = await db.execute(select(OTP).where(OTP.email == email_clean))
    otp_record = otp_res.scalars().first()

    if not otp_record or otp_record.status != "VERIFIED":
        raise HTTPException(status_code=401, detail="Unauthorized password change request or session expired.")

    user_res = await db.execute(select(User).where(User.phone_or_email == email_clean))
    user = user_res.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User profile not found.")

    # Update password and finalize OTP status
    user.hashed_password = get_password_hash(password)
    otp_record.status = "COMPLETED"
    await db.commit()
    await db.refresh(user)

    token = create_access_token(subject=user.id)

    # Set cookie
    response.set_cookie(
        key="auth_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 7,
        path="/"
    )

    return TokenResponse(
        status="success",
        message="Password successfully set. Profile created!",
        access_token=token,
        token_type="bearer",
        redirect="/home",
        user=UserOut.model_validate(user)
    )

# ==============================================================================
# 6. LOGIN AUTHENTICATION
# ==============================================================================
@router.post("/login", response_model=TokenResponse)
@router.post("/auth/login", response_model=TokenResponse)
async def login_endpoint(credentials: UserLogin, response: Response, db: AsyncSession = Depends(get_db)):
    """Authenticates credentials and returns signed JWT token with cookie session."""
    raw_id = credentials.email or credentials.username_or_email
    if not raw_id or not raw_id.strip():
        raise HTTPException(status_code=400, detail="Email or username is required.")
    identifier = raw_id.strip().lower()

    result = await db.execute(
        select(User).where(
            or_(User.username == identifier, User.phone_or_email == identifier)
        )
    )
    user = result.scalars().first()

    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email/username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(subject=user.id)

    response.set_cookie(
        key="auth_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 7,
        path="/"
    )

    return TokenResponse(
        status="success",
        message="Access granted. Welcome to Gravity Portal!",
        access_token=token,
        token_type="bearer",
        redirect="/home",
        user=UserOut.model_validate(user)
    )

# ==============================================================================
# 7. GET CURRENT USER PROFILE & LOGOUT
# ==============================================================================
@router.get("/me", response_model=UserOut)
@router.get("/auth/me", response_model=UserOut)
async def get_me_endpoint(current_user: User = Depends(get_current_user)):
    """Returns profile for currently authenticated user."""
    return UserOut.model_validate(current_user)

@router.post("/logout")
@router.post("/auth/logout")
async def logout_endpoint(response: Response):
    """Clears authentication cookie session."""
    response.delete_cookie("auth_token", path="/")
    return {"status": "success", "message": "Logged out successfully"}
