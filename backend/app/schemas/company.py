"""
VajraKavach — Company Schemas
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class CompanyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str = Field(..., min_length=1, max_length=5000)
    location: str = Field(..., min_length=1, max_length=255)
    website: str = Field(..., min_length=1, max_length=512)


class CompanyUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = Field(None, max_length=5000)
    location: Optional[str] = Field(None, max_length=255)
    website: Optional[str] = Field(None, max_length=512)


class CompanyResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    location: Optional[str] = None
    website: Optional[str] = None
    is_verified: bool
    admin_id: str
    created_at: datetime

    class Config:
        from_attributes = True
