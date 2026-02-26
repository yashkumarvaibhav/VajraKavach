"""
VajraKavach — Job & Application Schemas
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime


class JobCreate(BaseModel):
    company_id: str
    title: str = Field(..., min_length=1, max_length=255)
    description: str
    required_skills: Optional[List[str]] = None
    location: Optional[str] = None
    location_type: str = "onsite"  # remote, onsite, hybrid
    job_type: str = "full_time"    # full_time, part_time, internship, contract
    salary_min: Optional[str] = None
    salary_max: Optional[str] = None
    application_deadline: Optional[date] = None


class JobUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    required_skills: Optional[List[str]] = None
    location: Optional[str] = None
    location_type: Optional[str] = None
    job_type: Optional[str] = None
    salary_min: Optional[str] = None
    salary_max: Optional[str] = None
    application_deadline: Optional[date] = None
    is_active: Optional[bool] = None


class JobResponse(BaseModel):
    id: str
    company_id: str
    title: str
    description: str
    required_skills: Optional[List[str]] = None
    location: Optional[str] = None
    location_type: str
    job_type: str
    salary_min: Optional[str] = None
    salary_max: Optional[str] = None
    application_deadline: Optional[date] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class JobSearchParams(BaseModel):
    keyword: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    skills: Optional[List[str]] = None
    location_type: Optional[str] = None
    job_type: Optional[str] = None
    page: int = 1
    page_size: int = 20


class ApplicationCreate(BaseModel):
    job_id: str
    resume_id: Optional[str] = None
    cover_note: Optional[str] = None


class ApplicationStatusUpdate(BaseModel):
    status: str   # applied, reviewed, interviewed, rejected, offer
    recruiter_notes: Optional[str] = None


class ApplicationResponse(BaseModel):
    id: str
    job_id: str
    user_id: str
    resume_id: Optional[str] = None
    cover_note: Optional[str] = None
    status: str
    recruiter_notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
