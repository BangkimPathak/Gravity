from datetime import datetime
from typing import List, Optional, Union
from pydantic import BaseModel, ConfigDict
from app.schemas.user import UserOut
from app.schemas.message import MessageOut

class ParticipantOut(BaseModel):
    id: int
    conversation_id: str
    user_id: Union[int, str]
    role: str
    joined_at: datetime
    last_read_message_id: Optional[str] = None
    user: Optional[UserOut] = None

    model_config = ConfigDict(from_attributes=True)

class ConversationCreate(BaseModel):
    is_group: bool = False
    title: Optional[str] = None
    avatar_url: Optional[str] = None
    participant_ids: List[Union[int, str]]

class ConversationOut(BaseModel):
    id: str
    is_group: bool
    title: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    participants: List[ParticipantOut] = []
    last_message: Optional[MessageOut] = None
    unread_count: int = 0
    display_title: Optional[str] = None
    display_avatar: Optional[str] = None
    is_online: Optional[bool] = False
    last_seen: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
