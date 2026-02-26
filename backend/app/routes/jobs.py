"""
VajraKavach — Job Routes
Job posting CRUD and search.
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from typing import Optional, List

from app.database import get_db
from app.models.job import Job
from app.models.company import Company
from app.models.user import User
from app.schemas.job import JobCreate, JobUpdate, JobResponse
from app.dependencies import get_current_user, require_role
from app.services.audit_service import create_audit_log

router = APIRouter(prefix="/api/jobs", tags=["Jobs"])


@router.post("/", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def create_job(
    req: JobCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("recruiter", "admin")),
):
    """Post a new job listing."""
    # Verify company ownership
    result = await db.execute(select(Company).where(Company.id == req.company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    if str(company.admin_id) != str(current_user.id) and current_user.role.value != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this company")

    job = Job(
        id=uuid.uuid4(),
        company_id=uuid.UUID(req.company_id),
        title=req.title,
        description=req.description,
        required_skills=req.required_skills,
        location=req.location,
        location_type=req.location_type,
        job_type=req.job_type,
        salary_min=req.salary_min,
        salary_max=req.salary_max,
        application_deadline=req.application_deadline,
    )
    db.add(job)
    await db.flush()

    await create_audit_log(
        db=db,
        action="job.create",
        user_id=str(current_user.id),
        resource="job",
        resource_id=str(job.id),
        details={"title": req.title, "company_id": req.company_id},
        ip_address=request.client.host if request.client else None,
    )

    return JobResponse(
        id=str(job.id),
        company_id=str(job.company_id),
        title=job.title,
        description=job.description,
        required_skills=job.required_skills,
        location=job.location,
        location_type=job.location_type.value if hasattr(job.location_type, 'value') else job.location_type,
        job_type=job.job_type.value if hasattr(job.job_type, 'value') else job.job_type,
        salary_min=job.salary_min,
        salary_max=job.salary_max,
        application_deadline=job.application_deadline,
        is_active=job.is_active,
        created_at=job.created_at,
    )


@router.get("/search", response_model=list[JobResponse])
async def search_jobs(
    keyword: Optional[str] = Query(None),
    company: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    location_type: Optional[str] = Query(None),
    job_type: Optional[str] = Query(None),
    skills: Optional[str] = Query(None, description="Comma-separated skill tags"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Search jobs with filters."""
    query = select(Job, Company.name.label("company_name")).join(Company, Job.company_id == Company.id).where(Job.is_active == True)

    if keyword:
        query = query.where(
            or_(
                Job.title.ilike(f"%{keyword}%"),
                Job.description.ilike(f"%{keyword}%"),
            )
        )

    if company:
        query = query.where(Company.name.ilike(f"%{company}%"))

    if location:
        query = query.where(Job.location.ilike(f"%{location}%"))

    if location_type:
        query = query.where(Job.location_type == location_type)

    if job_type:
        query = query.where(Job.job_type == job_type)

    # Pagination
    offset = (page - 1) * page_size
    query = query.order_by(Job.created_at.desc()).offset(offset).limit(page_size)

    result = await db.execute(query)
    rows = result.all()

    return [
        JobResponse(
            id=str(j.id),
            company_id=str(j.company_id),
            company_name=company_name,
            title=j.title,
            description=j.description,
            required_skills=j.required_skills,
            location=j.location,
            location_type=j.location_type.value if hasattr(j.location_type, 'value') else j.location_type,
            job_type=j.job_type.value if hasattr(j.job_type, 'value') else j.job_type,
            salary_min=j.salary_min,
            salary_max=j.salary_max,
            application_deadline=j.application_deadline,
            is_active=j.is_active,
            created_at=j.created_at,
        )
        for j, company_name in rows
    ]


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific job listing."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    return JobResponse(
        id=str(job.id),
        company_id=str(job.company_id),
        title=job.title,
        description=job.description,
        required_skills=job.required_skills,
        location=job.location,
        location_type=job.location_type.value if hasattr(job.location_type, 'value') else job.location_type,
        job_type=job.job_type.value if hasattr(job.job_type, 'value') else job.job_type,
        salary_min=job.salary_min,
        salary_max=job.salary_max,
        application_deadline=job.application_deadline,
        is_active=job.is_active,
        created_at=job.created_at,
    )


@router.put("/{job_id}", response_model=JobResponse)
async def update_job(
    job_id: str,
    req: JobUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("recruiter", "admin")),
):
    """Update a job listing."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    # Verify ownership through company
    company_result = await db.execute(select(Company).where(Company.id == job.company_id))
    company = company_result.scalar_one_or_none()
    if str(company.admin_id) != str(current_user.id) and current_user.role.value != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    update_data = req.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(job, field, value)

    await db.flush()

    await create_audit_log(
        db=db,
        action="job.update",
        user_id=str(current_user.id),
        resource="job",
        resource_id=str(job.id),
        details={"updated_fields": list(update_data.keys())},
        ip_address=request.client.host if request.client else None,
    )

    return JobResponse(
        id=str(job.id),
        company_id=str(job.company_id),
        title=job.title,
        description=job.description,
        required_skills=job.required_skills,
        location=job.location,
        location_type=job.location_type.value if hasattr(job.location_type, 'value') else job.location_type,
        job_type=job.job_type.value if hasattr(job.job_type, 'value') else job.job_type,
        salary_min=job.salary_min,
        salary_max=job.salary_max,
        application_deadline=job.application_deadline,
        is_active=job.is_active,
        created_at=job.created_at,
    )


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(
    job_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("recruiter", "admin")),
):
    """Delete a job listing."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    company_result = await db.execute(select(Company).where(Company.id == job.company_id))
    company = company_result.scalar_one_or_none()
    if str(company.admin_id) != str(current_user.id) and current_user.role.value != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    await create_audit_log(
        db=db,
        action="job.delete",
        user_id=str(current_user.id),
        resource="job",
        resource_id=str(job.id),
        details={"title": job.title},
        ip_address=request.client.host if request.client else None,
    )

    await db.delete(job)
