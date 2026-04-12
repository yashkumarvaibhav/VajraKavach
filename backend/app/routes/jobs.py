"""
VajraKavach — Job Routes
Job posting CRUD, search, and recruiter management.
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, func, String
from typing import Optional, List

from app.database import get_db
from app.models.job import Job
from app.models.company import Company
from app.models.user import User
from app.models.application import Application
from app.schemas.job import JobCreate, JobUpdate, JobResponse
from app.dependencies import get_current_user, require_role
from app.services.audit_service import create_audit_log
from app.utils.ip import get_client_ip
from app.services.action_rate_limit_service import check_action_rate_limit, record_action
from app.utils.sanitize import escape_like

router = APIRouter(prefix="/api/jobs", tags=["Jobs"])


def _job_response(job, company_name=None, applicant_count=None):
    """Build a standard JobResponse from a Job ORM object."""
    return JobResponse(
        id=str(job.id),
        company_id=str(job.company_id),
        company_name=company_name,
        title=job.title,
        description=job.description,
        required_skills=job.required_skills,
        location=job.location,
        location_type=job.location_type.value if hasattr(job.location_type, 'value') else job.location_type,
        job_type=job.job_type.value if hasattr(job.job_type, 'value') else job.job_type,
        salary_min=job.salary_min,
        salary_max=job.salary_max,
        salary_currency=getattr(job, 'salary_currency', None) or "INR",
        application_deadline=job.application_deadline,
        is_active=job.is_active,
        created_at=job.created_at,
        applicant_count=applicant_count,
    )


@router.post("/", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def create_job(
    req: JobCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("recruiter", "platform_admin")),
):
    """Post a new job listing."""
    await check_action_rate_limit(db, "job_create", str(current_user.id))

    result = await db.execute(select(Company).where(Company.id == req.company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    if str(company.admin_id) != str(current_user.id) and current_user.role.value != "platform_admin":
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
        salary_currency=req.salary_currency,
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
        ip_address=get_client_ip(request),
    )
    await record_action(db, "job_create", str(current_user.id))
    return _job_response(job, company_name=company.name)


@router.get("/my", response_model=list[JobResponse])
async def my_jobs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("recruiter", "platform_admin")),
):
    """List jobs posted by the current recruiter (with applicant counts)."""
    # Get companies owned by this recruiter
    comp_result = await db.execute(
        select(Company).where(Company.admin_id == current_user.id)
    )
    companies = comp_result.scalars().all()
    if not companies:
        return []

    company_map = {str(c.id): c.name for c in companies}
    company_ids = [c.id for c in companies]

    # Get all jobs for those companies
    job_result = await db.execute(
        select(Job).where(Job.company_id.in_(company_ids)).order_by(Job.created_at.desc())
    )
    jobs = job_result.scalars().all()

    responses = []
    for job in jobs:
        # Count applicants
        count_result = await db.execute(
            select(func.count(Application.id)).where(Application.job_id == job.id)
        )
        app_count = count_result.scalar() or 0

        responses.append(_job_response(
            job,
            company_name=company_map.get(str(job.company_id)),
            applicant_count=app_count,
        ))

    return responses


@router.get("/search", response_model=list[JobResponse])
async def search_jobs(
    keyword: Optional[str] = Query(None, max_length=200),
    company: Optional[str] = Query(None, max_length=255),
    location: Optional[str] = Query(None, max_length=255),
    location_type: Optional[str] = Query(None, max_length=20),
    job_type: Optional[str] = Query(None, max_length=20),
    skills: Optional[str] = Query(None, max_length=500, description="Comma-separated skill tags"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Search jobs with filters."""
    await check_action_rate_limit(db, "search_query", str(current_user.id))
    await record_action(db, "search_query", str(current_user.id))

    query = select(Job, Company.name.label("company_name")).join(Company, Job.company_id == Company.id).where(Job.is_active == True)

    if keyword:
        ek = escape_like(keyword)
        query = query.where(
            or_(
                Job.title.ilike(f"%{ek}%"),
                Job.description.ilike(f"%{ek}%"),
            )
        )

    if company:
        query = query.where(Company.name.ilike(f"%{escape_like(company)}%"))

    if location:
        query = query.where(Job.location.ilike(f"%{escape_like(location)}%"))

    if location_type:
        query = query.where(Job.location_type == location_type)

    if job_type:
        query = query.where(Job.job_type == job_type)

    if skills:
        skill_list = [s.strip().lower() for s in skills.split(",") if s.strip()]
        for skill in skill_list:
            query = query.where(
                func.lower(func.cast(Job.required_skills, String)).contains(skill)
            )

    offset = (page - 1) * page_size
    query = query.order_by(Job.created_at.desc()).offset(offset).limit(page_size)

    result = await db.execute(query)
    rows = result.all()

    return [_job_response(j, company_name=cn) for j, cn in rows]


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

    # Get company name
    comp_result = await db.execute(select(Company.name).where(Company.id == job.company_id))
    comp_name = comp_result.scalar_one_or_none()

    return _job_response(job, company_name=comp_name)


@router.put("/{job_id}", response_model=JobResponse)
async def update_job(
    job_id: str,
    req: JobUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("recruiter", "platform_admin")),
):
    """Update a job listing."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    company_result = await db.execute(select(Company).where(Company.id == job.company_id))
    company = company_result.scalar_one_or_none()
    if str(company.admin_id) != str(current_user.id) and current_user.role.value != "platform_admin":
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
        ip_address=get_client_ip(request),
    )

    return _job_response(job, company_name=company.name)


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(
    job_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("recruiter", "platform_admin")),
):
    """Delete a job listing."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    company_result = await db.execute(select(Company).where(Company.id == job.company_id))
    company = company_result.scalar_one_or_none()
    if str(company.admin_id) != str(current_user.id) and current_user.role.value != "platform_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    await create_audit_log(
        db=db,
        action="job.delete",
        user_id=str(current_user.id),
        resource="job",
        resource_id=str(job.id),
        details={"title": job.title},
        ip_address=get_client_ip(request),
    )

    await db.delete(job)
