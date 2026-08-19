import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Index, Integer
from sqlalchemy.orm import relationship
from app.core.database import Base

def utc_now():
    return datetime.now(timezone.utc)

class Message(Base):
    __tablename__ = "messages"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = Column(String(36), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    content = Column(Text, nullable=True)
    message_type = Column(String(20), default="text")  # 'text', 'image', 'file', 'audio'
    media_url = Column(String(500), nullable=True)
    status = Column(String(20), default="sent")  # 'sent', 'delivered', 'read'
    created_at = Column(DateTime, default=utc_now, index=True)

    __table_args__ = (
        Index("idx_conversation_created", "conversation_id", "created_at"),
    )

    # Relationships
    conversation = relationship("Conversation", back_populates="messages")
    sender = relationship("User", back_populates="sent_messages", lazy="joined")
