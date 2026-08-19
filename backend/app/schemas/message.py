from datetime import datetime
from typing import Optional, Any, Union
from pydantic import BaseModel, ConfigDict
from app.schemas.user import UserOut

class MessageBase(BaseModel):
    conversation_id: str
    content: Optional[str] = None
    message_type: str = "text"  # text, image, file, audio
    media_url: Optional[str] = None

class MessageCreate(MessageBase):
    pass

class MessageOut(MessageBase):
    id: str
    sender_id: Union[int, str]
    status: str  # sent, delivered, read
    created_at: datetime
    sender: Optional[UserOut] = None

    model_config = ConfigDict(from_attributes=True)

# WebSocket Event Envelopes
class WsEvent(BaseModel):
    event: str
    data: Any
    timestamp: Optional[datetime] = None
