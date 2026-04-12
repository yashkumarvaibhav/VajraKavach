"""
VajraKavach — Company Schemas
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime
import re


def _validate_url(v: str | None) -> str | None:
    if v is None:
        return v
    if not re.match(r'^https?://', v, re.IGNORECASE):
        if re.match(r'^[a-z]+:', v, re.IGNORECASE):
            raise ValueError('Website must use http:// or https:// protocol')
        v = f'https://{v}'
    return v


class CompanyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str = Field(..., min_length=1, max_length=5000)
    location: str = Field(..., min_length=1, max_length=255)
    website: str = Field(..., min_length=1, max_length=512)
    industry: Optional[str] = Field(None, max_length=255)
    size: Optional[str] = Field(None, max_length=100)

    @field_validator('website')
    @classmethod
    def validate_website(cls, v):
        return _validate_url(v)


class CompanyUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = Field(None, max_length=5000)
    location: Optional[str] = Field(None, max_length=255)
    website: Optional[str] = Field(None, max_length=512)
    industry: Optional[str] = Field(None, max_length=255)
    size: Optional[str] = Field(None, max_length=100)

    @field_validator('website')
    @classmethod
    def validate_website(cls, v):
        return _validate_url(v)


class CompanyResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    location: Optional[str] = None
    website: Optional[str] = None
    industry: Optional[str] = None
    size: Optional[str] = None
    is_verified: bool
    admin_id: str
    created_at: datetime

    class Config:
        from_attributes = True
