from datetime import datetime, timezone, timedelta
from sqlalchemy import Column, String, Integer, DateTime
from app.core.database import Base

def utc_now():
    return datetime.now(timezone.utc)

def ten_minutes_later():
    return datetime.now(timezone.utc) + timedelta(minutes=10)

class OTP(Base):
    __tablename__ = "otp"

    email = Column(String(100), primary_key=True, index=True)
    otp_number = Column(String(30), nullable=False)
    status = Column(String(20), nullable=False, default="ACTIVE")  # ACTIVE, VERIFIED, COMPLETED, EXPIRED, LOCKED
    attempts = Column(Integer, default=0)
    requested_at = Column(DateTime, default=utc_now)
    expires_at = Column(DateTime, default=ten_minutes_later)
