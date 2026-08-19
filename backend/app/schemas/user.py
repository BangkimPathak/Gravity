from datetime import datetime
from typing import Optional, Union
from pydantic import BaseModel, ConfigDict

class UserBase(BaseModel):
    username: str
    phone_or_email: str
    full_name: Optional[str] = None
    birthday: Optional[str] = None
    region: Optional[str] = "India (Asia/Kolkata)"
    role: Optional[str] = "Member"
    gender: Optional[str] = None
    age: Optional[int] = None
    address: Optional[str] = None
    avatar_url: Optional[str] = None
    status_bio: Optional[str] = "Available"

class UserOut(UserBase):
    id: Union[int, str]
    last_seen: Optional[datetime] = None
    created_at: datetime
    is_online: Optional[bool] = False

    model_config = ConfigDict(from_attributes=True)

class UserUpdate(BaseModel):
    username: Optional[str] = None
    full_name: Optional[str] = None
    birthday: Optional[str] = None
    region: Optional[str] = None
    phone_or_email: Optional[str] = None
    avatar_url: Optional[str] = None
    status_bio: Optional[str] = None
    gender: Optional[str] = None
    age: Optional[int] = None
    address: Optional[str] = None
