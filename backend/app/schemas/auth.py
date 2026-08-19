from typing import Optional, Any
from pydantic import BaseModel, ConfigDict

class UserRegister(BaseModel):
    name: Optional[str] = None
    full_name: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    phone_or_email: Optional[str] = None
    birthday: Optional[str] = None
    dob: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = "Member"
    gender: Optional[str] = None
    age: Optional[int] = None
    address: Optional[str] = None
    avatar_url: Optional[str] = None
    status_bio: Optional[str] = None

    model_config = ConfigDict(extra="ignore")

class VerifyOtpRequest(BaseModel):
    email: str
    otp: str

    model_config = ConfigDict(extra="ignore")

class ResendOtpRequest(BaseModel):
    email: str

    model_config = ConfigDict(extra="ignore")

class SetPasswordRequest(BaseModel):
    email: str
    password: str

    model_config = ConfigDict(extra="ignore")

class UserLogin(BaseModel):
    username_or_email: Optional[str] = None
    email: Optional[str] = None
    password: str

    model_config = ConfigDict(extra="ignore")

class StandardResponse(BaseModel):
    status: str
    message: str
    redirect: Optional[str] = None
    data: Optional[Any] = None

class OtpTimeResponse(BaseModel):
    status: str
    remaining_seconds: int
    otp_status: Optional[str] = None

class TokenResponse(BaseModel):
    status: str = "success"
    message: Optional[str] = "Authentication successful"
    access_token: str
    token_type: str = "bearer"
    redirect: Optional[str] = "/home"
    user: "UserOut"

    model_config = ConfigDict(extra="ignore")

from app.schemas.user import UserOut
TokenResponse.model_rebuild()
