"""
VajraKavach — User Schemas
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid


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

    class Config:
        from_attributes = True


class UserProfileUpdate(BaseModel):
    headline: Optional[str] = Field(None, max_length=255)
    location: Optional[str] = Field(None, max_length=255)
    bio: Optional[str] = Field(None, max_length=5000)
    education: Optional[List[Dict[str, Any]]] = None
    experience: Optional[List[Dict[str, Any]]] = None
    skills: Optional[List[str]] = None
    profile_picture_url: Optional[str] = None
    privacy_settings: Optional[Dict[str, str]] = None
    show_viewers: Optional[bool] = None


class UserNameUpdate(BaseModel):
    full_name: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=20)


class UserProfileResponse(BaseModel):
    id: str
    user_id: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    headline: Optional[str] = None
    location: Optional[str] = None
    bio: Optional[str] = None
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
