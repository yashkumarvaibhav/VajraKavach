"""
VajraKavach — Application Routes (Job Applications)
Apply, track, update application status.
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.application import Application, ApplicationStatus
from app.models.job import Job
from app.models.company import Company
from app.models.user import User
from app.schemas.job import ApplicationCreate, ApplicationStatusUpdate, ApplicationResponse
from app.dependencies import get_current_user, require_role
from app.services.audit_service import create_audit_log

router = APIRouter(prefix="/api/applications", tags=["Applications"])


@router.post("/", response_model=ApplicationResponse, status_code=status.HTTP_201_CREATED)
async def apply_to_job(
    req: ApplicationCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Apply to a job posting."""
    # Check job exists and is active
    result = await db.execute(select(Job).where(Job.id == req.job_id, Job.is_active == True))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found or inactive")

    # Check if already applied
    existing = await db.execute(
        select(Application).where(
            Application.job_id == req.job_id,
            Application.user_id == current_user.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already applied to this job")

    application = Application(
        id=uuid.uuid4(),
        job_id=uuid.UUID(req.job_id),
        user_id=current_user.id,
        resume_id=uuid.UUID(req.resume_id) if req.resume_id else None,
        cover_note=req.cover_note,
        status=ApplicationStatus.APPLIED,
    )
    db.add(application)
    await db.flush()

    await create_audit_log(
        db=db,
        action="application.create",
        user_id=str(current_user.id),
        resource="application",
        resource_id=str(application.id),
        details={"job_id": req.job_id},
        ip_address=request.client.host if request.client else None,
    )

    return ApplicationResponse(
        id=str(application.id),
        job_id=str(application.job_id),
        user_id=str(application.user_id),
        resume_id=str(application.resume_id) if application.resume_id else None,
        cover_note=application.cover_note,
        status=application.status.value,
        created_at=application.created_at,
    )


@router.get("/my", response_model=list[ApplicationResponse])
async def my_applications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all applications by the current user."""
    result = await db.execute(
        select(Application).where(Application.user_id == current_user.id)
    )
    apps = result.scalars().all()

    return [
        ApplicationResponse(
            id=str(a.id),
            job_id=str(a.job_id),
            user_id=str(a.user_id),
            resume_id=str(a.resume_id) if a.resume_id else None,
            cover_note=a.cover_note,
            status=a.status.value,
            recruiter_notes=None,  # Don't expose recruiter notes to applicant
            created_at=a.created_at,
        )
        for a in apps
    ]


@router.get("/job/{job_id}", response_model=list[ApplicationResponse])
async def job_applications(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("recruiter", "admin")),
):
    """List all applications for a job (recruiter/admin only)."""
    # Verify recruiter owns the company that posted this job
    job_result = await db.execute(select(Job).where(Job.id == job_id))
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    company_result = await db.execute(select(Company).where(Company.id == job.company_id))
    company = company_result.scalar_one_or_none()
    if str(company.admin_id) != str(current_user.id) and current_user.role.value != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    result = await db.execute(
        select(Application).where(Application.job_id == job_id)
    )
    apps = result.scalars().all()

    return [
        ApplicationResponse(
            id=str(a.id),
            job_id=str(a.job_id),
            user_id=str(a.user_id),
            resume_id=str(a.resume_id) if a.resume_id else None,
            cover_note=a.cover_note,
            status=a.status.value,
            recruiter_notes=a.recruiter_notes,
            created_at=a.created_at,
        )
        for a in apps
    ]


@router.put("/{application_id}/status", response_model=ApplicationResponse)
async def update_application_status(
    application_id: str,
    req: ApplicationStatusUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("recruiter", "admin")),
):
    """Update application status (recruiter/admin only)."""
    result = await db.execute(
        select(Application).where(Application.id == application_id)
    )
    application = result.scalar_one_or_none()
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")

    # Verify authorization through job -> company chain
    job_result = await db.execute(select(Job).where(Job.id == application.job_id))
    job = job_result.scalar_one_or_none()
    company_result = await db.execute(select(Company).where(Company.id == job.company_id))
    company = company_result.scalar_one_or_none()

    if str(company.admin_id) != str(current_user.id) and current_user.role.value != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    old_status = application.status.value
    application.status = req.status
    if req.recruiter_notes:
        application.recruiter_notes = req.recruiter_notes

    await db.flush()

    await create_audit_log(
        db=db,
        action="application.status_update",
        user_id=str(current_user.id),
        resource="application",
        resource_id=str(application.id),
        details={"old_status": old_status, "new_status": req.status},
        ip_address=request.client.host if request.client else None,
    )

    return ApplicationResponse(
        id=str(application.id),
        job_id=str(application.job_id),
        user_id=str(application.user_id),
        resume_id=str(application.resume_id) if application.resume_id else None,
        cover_note=application.cover_note,
        status=application.status.value if hasattr(application.status, 'value') else application.status,
        recruiter_notes=application.recruiter_notes,
        created_at=application.created_at,
    )
