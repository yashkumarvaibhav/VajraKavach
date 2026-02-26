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
from app.utils.ip import get_client_ip

router = APIRouter(prefix="/api/applications", tags=["Applications"])


async def _enrich_application(db: AsyncSession, app: Application) -> ApplicationResponse:
    """Build an enriched ApplicationResponse with job/company/applicant info."""
    job_title = None
    company_name = None
    applicant_name = None
    applicant_email = None

    # Get job info
    job_result = await db.execute(select(Job).where(Job.id == app.job_id))
    job = job_result.scalar_one_or_none()
    if job:
        job_title = job.title
        # Get company info
        comp_result = await db.execute(select(Company).where(Company.id == job.company_id))
        comp = comp_result.scalar_one_or_none()
        if comp:
            company_name = comp.name

    # Get applicant info
    user_result = await db.execute(select(User).where(User.id == app.user_id))
    user = user_result.scalar_one_or_none()
    if user:
        applicant_name = user.full_name
        applicant_email = user.email

    # Get resume filename if resume attached
    resume_filename = None
    if app.resume_id:
        from app.models.resume import Resume
        resume_result = await db.execute(select(Resume).where(Resume.id == app.resume_id))
        resume = resume_result.scalar_one_or_none()
        if resume:
            resume_filename = resume.original_filename

    return ApplicationResponse(
        id=str(app.id),
        job_id=str(app.job_id),
        job_title=job_title,
        company_name=company_name,
        user_id=str(app.user_id),
        applicant_name=applicant_name,
        applicant_email=applicant_email,
        resume_id=str(app.resume_id) if app.resume_id else None,
        resume_filename=resume_filename,
        cover_note=app.cover_note,
        status=app.status.value if hasattr(app.status, 'value') else app.status,
        recruiter_notes=app.recruiter_notes,
        created_at=app.created_at,
    )


@router.post("/", response_model=ApplicationResponse, status_code=status.HTTP_201_CREATED)
async def apply_to_job(
    req: ApplicationCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Apply to a job posting."""
    result = await db.execute(select(Job).where(Job.id == req.job_id, Job.is_active == True))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found or inactive")

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
        ip_address=get_client_ip(request),
    )

    return await _enrich_application(db, application)


@router.delete("/{application_id}", status_code=204)
async def withdraw_application(
    application_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Withdraw (delete) an application. Only the applicant can withdraw."""
    result = await db.execute(
        select(Application).where(
            Application.id == application_id,
            Application.user_id == current_user.id,
        )
    )
    application = result.scalar_one_or_none()
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")

    await create_audit_log(
        db=db,
        action="application.withdraw",
        user_id=str(current_user.id),
        resource="application",
        resource_id=str(application.id),
        details={"job_id": str(application.job_id)},
        ip_address=get_client_ip(request),
    )

    await db.delete(application)


@router.get("/my", response_model=list[ApplicationResponse])
async def my_applications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all applications by the current user (enriched with job/company info)."""
    result = await db.execute(
        select(Application).where(Application.user_id == current_user.id).order_by(Application.created_at.desc())
    )
    apps = result.scalars().all()

    return [await _enrich_application(db, a) for a in apps]


@router.get("/job/{job_id}", response_model=list[ApplicationResponse])
async def job_applications(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("recruiter", "admin")),
):
    """List all applications for a job (recruiter/admin only, with applicant info)."""
    job_result = await db.execute(select(Job).where(Job.id == job_id))
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    company_result = await db.execute(select(Company).where(Company.id == job.company_id))
    company = company_result.scalar_one_or_none()
    if str(company.admin_id) != str(current_user.id) and current_user.role.value != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    result = await db.execute(
        select(Application).where(Application.job_id == job_id).order_by(Application.created_at.desc())
    )
    apps = result.scalars().all()

    return [await _enrich_application(db, a) for a in apps]


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

    job_result = await db.execute(select(Job).where(Job.id == application.job_id))
    job = job_result.scalar_one_or_none()
    company_result = await db.execute(select(Company).where(Company.id == job.company_id))
    company = company_result.scalar_one_or_none()

    if str(company.admin_id) != str(current_user.id) and current_user.role.value != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    old_status = application.status.value if hasattr(application.status, 'value') else application.status
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
        ip_address=get_client_ip(request),
    )

    return await _enrich_application(db, application)
