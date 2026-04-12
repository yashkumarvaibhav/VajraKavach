"""
VajraKavach — Job & Application Schemas
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Literal
from datetime import date, datetime


CURRENCY_CHOICES = ["INR", "USD", "EUR", "GBP"]


class JobCreate(BaseModel):
    company_id: str
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field(..., min_length=1, max_length=10000)
    required_skills: Optional[List[str]] = Field(None, max_length=50)
    location: Optional[str] = Field(None, max_length=255)
    location_type: Literal["remote", "onsite", "hybrid"] = "onsite"
    job_type: Literal["full_time", "part_time", "internship", "contract"] = "full_time"
    salary_min: Optional[str] = Field(None, max_length=50)
    salary_max: Optional[str] = Field(None, max_length=50)
    salary_currency: str = Field("INR", max_length=5)
    application_deadline: Optional[date] = None

    @field_validator("application_deadline")
    @classmethod
    def deadline_not_in_past(cls, v):
        if v is not None and v < date.today():
            raise ValueError("Application deadline cannot be in the past")
        return v

    @field_validator("salary_currency")
    @classmethod
    def valid_currency(cls, v):
        if v not in CURRENCY_CHOICES:
            raise ValueError(f"Currency must be one of: {', '.join(CURRENCY_CHOICES)}")
        return v

    @field_validator("salary_max")
    @classmethod
    def max_salary_gte_min(cls, v, info):
        salary_min = info.data.get("salary_min")
        if v is not None and salary_min is not None:
            try:
                if float(v) < float(salary_min):
                    raise ValueError("Maximum salary cannot be less than minimum salary")
            except (TypeError, ValueError) as e:
                if "Maximum salary" in str(e):
                    raise
        return v


class JobUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = Field(None, max_length=10000)
    required_skills: Optional[List[str]] = Field(None, max_length=50)
    location: Optional[str] = Field(None, max_length=255)
    location_type: Optional[Literal["remote", "onsite", "hybrid"]] = None
    job_type: Optional[Literal["full_time", "part_time", "internship", "contract"]] = None
    salary_min: Optional[str] = Field(None, max_length=50)
    salary_max: Optional[str] = Field(None, max_length=50)
    salary_currency: Optional[str] = Field(None, max_length=5)
    application_deadline: Optional[date] = None
    is_active: Optional[bool] = None

    @field_validator("application_deadline")
    @classmethod
    def deadline_not_in_past(cls, v):
        if v is not None and v < date.today():
            raise ValueError("Application deadline cannot be in the past")
        return v

    @field_validator("salary_currency")
    @classmethod
    def valid_currency(cls, v):
        if v is not None and v not in CURRENCY_CHOICES:
            raise ValueError(f"Currency must be one of: {', '.join(CURRENCY_CHOICES)}")
        return v


class JobResponse(BaseModel):
    id: str
    company_id: str
    company_name: Optional[str] = None
    posted_by: Optional[str] = None
    title: str
    description: str
    required_skills: Optional[List[str]] = None
    location: Optional[str] = None
    location_type: str
    job_type: str
    salary_min: Optional[str] = None
    salary_max: Optional[str] = None
    salary_currency: str = "INR"
    application_deadline: Optional[date] = None
    is_active: bool
    created_at: datetime
    applicant_count: Optional[int] = None

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
    cover_note: Optional[str] = Field(None, max_length=2000)


class ApplicationStatusUpdate(BaseModel):
    status: Literal["applied", "reviewed", "interviewed", "rejected", "offer"]
    recruiter_notes: Optional[str] = Field(None, max_length=5000)


class ApplicationResponse(BaseModel):
    id: str
    job_id: str
    job_title: Optional[str] = None
    company_name: Optional[str] = None
    job_is_active: bool = True
    user_id: str
    applicant_name: Optional[str] = None
    applicant_email: Optional[str] = None
    resume_id: Optional[str] = None
    resume_filename: Optional[str] = None
    cover_note: Optional[str] = None
    status: str
    recruiter_notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
