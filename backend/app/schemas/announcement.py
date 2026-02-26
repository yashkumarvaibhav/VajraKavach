"""
VajraKavach — Announcement Schemas
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class AnnouncementCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    content: str = Field(..., min_length=1, max_length=10000)


class AnnouncementResponse(BaseModel):
    id: str
    sender_id: str
    sender_name: Optional[str] = None
    title: str
    content: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
