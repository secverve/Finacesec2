from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import UserRole, UserStatus


class RegisterRequest(BaseModel):
    email: str
    full_name: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    full_name: str
    role: UserRole
    status: UserStatus
    created_at: datetime

