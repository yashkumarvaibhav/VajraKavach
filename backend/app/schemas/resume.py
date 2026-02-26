"""
VajraKavach — Resume Schemas
"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ResumeResponse(BaseModel):
    id: str
    user_id: str
    original_filename: str
    file_hash: str
    file_size: Optional[str] = None
    mime_type: Optional[str] = None
    has_signature: bool = False
    uploaded_at: datetime

    class Config:
        from_attributes = True
