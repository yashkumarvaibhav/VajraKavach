"""
VajraKavach — User Schemas
"""

from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid
import re


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    phone: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    is_active: bool
    is_suspended: bool = False
    totp_verified: bool
    created_at: datetime
    ip_address: Optional[str] = None

    class Config:
        from_attributes = True


class UserProfileUpdate(BaseModel):
    headline: Optional[str] = Field(None, max_length=255)
    location: Optional[str] = Field(None, max_length=255)
    bio: Optional[str] = Field(None, max_length=5000)
    website: Optional[str] = Field(None, max_length=512)
    education: Optional[List[Dict[str, Any]]] = Field(None, max_length=50)
    experience: Optional[List[Dict[str, Any]]] = Field(None, max_length=50)
    skills: Optional[List[str]] = Field(None, max_length=100)
    privacy_settings: Optional[Dict[str, str]] = Field(None, max_length=20)
    show_viewers: Optional[bool] = None

    @field_validator('website')
    @classmethod
    def validate_website(cls, v):
        if v is None:
            return v
        if not re.match(r'^https?://', v, re.IGNORECASE):
            if re.match(r'^[a-z]+:', v, re.IGNORECASE):
                raise ValueError('Website must use http:// or https:// protocol')
            v = f'https://{v}'
        return v


class UserNameUpdate(BaseModel):
    full_name: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=20)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v):
        if v is None or v == "":
            return v
        cleaned = re.sub(r"[\s\-]", "", v)
        if not re.match(r"^\+\d{1,3}\d{10}$", cleaned):
            raise ValueError("Phone must include country code (e.g., +91) followed by exactly 10 digits")
        return cleaned


class UserProfileResponse(BaseModel):
    id: str
    user_id: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    headline: Optional[str] = None
    location: Optional[str] = None
    bio: Optional[str] = None
    website: Optional[str] = None
    education: Optional[List[Dict[str, Any]]] = None
    experience: Optional[List[Dict[str, Any]]] = None
    skills: Optional[List[str]] = None
    profile_picture_url: Optional[str] = None
    privacy_settings: Optional[Dict[str, str]] = None
    view_count: Optional[Any] = 0
    show_viewers: bool = True

    class Config:
        from_attributes = True


class ConnectionRequest(BaseModel):
    addressee_id: str


class ConnectionResponse(BaseModel):
    id: str
    requester_id: str
    addressee_id: str
    status: str
    created_at: datetime
    requester_name: Optional[str] = None
    requester_headline: Optional[str] = None
    requester_picture: Optional[str] = None
    addressee_name: Optional[str] = None
    addressee_headline: Optional[str] = None
    addressee_picture: Optional[str] = None

    class Config:
        from_attributes = True


class UserSearchResponse(BaseModel):
    """Extended user info for search results."""
    id: str
    email: str
    full_name: str
    role: str
    headline: Optional[str] = None
    profile_picture_url: Optional[str] = None
    connection_status: Optional[str] = None  # null, pending, accepted

    class Config:
        from_attributes = True


class UserE2EEKeyUpdate(BaseModel):
    public_key: str = Field(..., min_length=64, max_length=4096)


class UserE2EEKeyStatusResponse(BaseModel):
    public_key: Optional[str] = None
    has_server_private_key: bool


class UserE2EEKeyMigrationResponse(BaseModel):
    public_key: Optional[str] = None
    private_key: Optional[str] = None
