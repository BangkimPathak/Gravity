import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, Text
from sqlalchemy.orm import relationship
from app.core.database import Base

def utc_now():
    return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    phone_or_email = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    avatar_url = Column(String(500), nullable=True)
    status_bio = Column(String(255), default="Available")
    
    # Registration details collection
    full_name = Column(String(100), nullable=True)
    birthday = Column(String(50), nullable=True)
    region = Column(String(100), nullable=True, default="India (Asia/Kolkata)")
    role = Column(String(50), nullable=True, default="Member")
    gender = Column(String(20), nullable=True)
    age = Column(Integer, nullable=True)
    address = Column(Text, nullable=True)
    
    last_seen = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now)

    # Relationships
    participations = relationship("Participant", back_populates="user", cascade="all, delete-orphan")
    sent_messages = relationship("Message", back_populates="sender", cascade="all, delete-orphan")
