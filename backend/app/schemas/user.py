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
    totp_verified: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserProfileUpdate(BaseModel):
    headline: Optional[str] = None
    location: Optional[str] = None
    bio: Optional[str] = None
    education: Optional[List[Dict[str, Any]]] = None
    experience: Optional[List[Dict[str, Any]]] = None
    skills: Optional[List[str]] = None
    profile_picture_url: Optional[str] = None
    privacy_settings: Optional[Dict[str, str]] = None
    show_viewers: Optional[bool] = None


class UserProfileResponse(BaseModel):
    id: str
    user_id: str
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

    class Config:
        from_attributes = True
