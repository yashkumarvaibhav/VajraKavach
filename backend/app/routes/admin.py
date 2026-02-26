"""
VajraKavach — Admin Routes
User management, moderation, admin lifecycle, audit log viewing.
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional
from pydantic import BaseModel, EmailStr, Field

from app.database import get_db
from app.models.user import User, UserProfile, UserRole
from app.models.audit import AuditLog
from app.schemas.user import UserResponse
from app.dependencies import require_role
from app.services.audit_service import create_audit_log, verify_audit_chain
from app.services.auth_service import hash_password
from app.services.totp_service import generate_totp_secret, get_totp_uri, generate_qr_code_base64
from app.services.pki_service import generate_rsa_key_pair

router = APIRouter(prefix="/api/admin", tags=["Admin"])


# ── Admin-only request schemas ───────────────────────────────────────

class CreateAdminRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(..., min_length=1, max_length=255)


class PromoteAdminRequest(BaseModel):
    user_id: str


@router.get("/users", response_model=list[UserResponse])
async def list_all_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    role: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """List all users (admin only) — includes last known IP from audit logs."""
    query = select(User)
    if role:
        query = query.where(User.role == role)

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    users = result.scalars().all()

    responses = []
    for u in users:
        # Get last login IP from audit logs
        ip_result = await db.execute(
            select(AuditLog.ip_address)
            .where(AuditLog.user_id == str(u.id), AuditLog.ip_address.isnot(None))
            .order_by(AuditLog.created_at.desc())
            .limit(1)
        )
        last_ip = ip_result.scalar_one_or_none()

        responses.append(UserResponse(
            id=str(u.id),
            email=u.email,
            full_name=u.full_name,
            role=u.role.value,
            is_active=u.is_active,
            is_suspended=u.is_suspended,
            totp_verified=u.totp_verified,
            created_at=u.created_at,
            ip_address=last_ip,
        ))
    return responses


@router.get("/users/count")
async def user_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Get total user count (admin only)."""
    result = await db.execute(select(func.count(User.id)))
    count = result.scalar()
    return {"total_users": count}


@router.put("/users/{user_id}/suspend")
async def suspend_user(
    user_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Suspend a user account (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if str(user.id) == str(current_user.id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot suspend yourself")

    user.is_suspended = True
    user.is_active = False

    await create_audit_log(
        db=db,
        action="admin.suspend_user",
        user_id=str(current_user.id),
        resource="user",
        resource_id=str(user.id),
        details={"target_email": user.email},
        ip_address=request.client.host if request.client else None,
    )

    return {"message": f"User {user.email} has been suspended"}


@router.put("/users/{user_id}/activate")
async def activate_user(
    user_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Reactivate a suspended user (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.is_suspended = False
    user.is_active = True

    await create_audit_log(
        db=db,
        action="admin.activate_user",
        user_id=str(current_user.id),
        resource="user",
        resource_id=str(user.id),
        details={"target_email": user.email},
        ip_address=request.client.host if request.client else None,
    )

    return {"message": f"User {user.email} has been reactivated"}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Delete a user account (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if str(user.id) == str(current_user.id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete yourself")

    await create_audit_log(
        db=db,
        action="admin.delete_user",
        user_id=str(current_user.id),
        resource="user",
        resource_id=str(user.id),
        details={"target_email": user.email},
        ip_address=request.client.host if request.client else None,
    )

    await db.delete(user)
    return {"message": f"User {user.email} has been deleted"}


# ── Admin Lifecycle (Only admins can create/promote/demote admins) ───

@router.post("/create-admin", status_code=status.HTTP_201_CREATED)
async def create_admin(
    req: CreateAdminRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Create a new admin account (admin only). Returns TOTP setup info."""
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    hashed_pw = hash_password(req.password)
    totp_secret = generate_totp_secret()
    private_key_pem, public_key_pem = generate_rsa_key_pair()

    admin_id = uuid.uuid4()
    admin = User(
        id=admin_id,
        email=req.email,
        hashed_password=hashed_pw,
        full_name=req.full_name,
        role=UserRole.ADMIN,
        totp_secret=totp_secret,
        totp_verified=False,
        public_key=public_key_pem,
        is_active=True,
        is_suspended=False,
    )
    db.add(admin)

    profile = UserProfile(
        id=uuid.uuid4(),
        user_id=admin_id,
    )
    db.add(profile)
    await db.flush()

    await create_audit_log(
        db=db,
        action="admin.create_admin",
        user_id=str(current_user.id),
        resource="user",
        resource_id=str(admin_id),
        details={"email": req.email, "created_by": current_user.email},
        ip_address=request.client.host if request.client else None,
    )

    totp_uri = get_totp_uri(totp_secret, req.email)
    qr_b64 = generate_qr_code_base64(totp_uri)

    return {
        "message": f"Admin user {req.email} created successfully",
        "user_id": str(admin_id),
        "totp_secret": totp_secret,
        "qr_code_base64": qr_b64,
    }


@router.put("/users/{user_id}/promote-admin")
async def promote_to_admin(
    user_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Promote an existing user to admin role (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.role == UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is already an admin")

    old_role = user.role.value
    user.role = UserRole.ADMIN
    await db.flush()

    await create_audit_log(
        db=db,
        action="admin.promote_user",
        user_id=str(current_user.id),
        resource="user",
        resource_id=str(user.id),
        details={"email": user.email, "old_role": old_role, "new_role": "admin"},
        ip_address=request.client.host if request.client else None,
    )

    return {"message": f"User {user.email} has been promoted to admin"}


@router.put("/users/{user_id}/demote-admin")
async def demote_from_admin(
    user_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Remove admin privileges from a user (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if str(user.id) == str(current_user.id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot demote yourself")

    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is not an admin")

    user.role = UserRole.USER
    await db.flush()

    await create_audit_log(
        db=db,
        action="admin.demote_user",
        user_id=str(current_user.id),
        resource="user",
        resource_id=str(user.id),
        details={"email": user.email, "old_role": "admin", "new_role": "user"},
        ip_address=request.client.host if request.client else None,
    )

    return {"message": f"Admin privileges removed from {user.email}"}


@router.get("/audit-logs")
async def get_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    action: Optional[str] = None,
    user_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """View audit logs with pagination and filtering (admin only)."""
    query = select(AuditLog).order_by(AuditLog.created_at.desc())

    if action:
        query = query.where(AuditLog.action == action)
    if user_id:
        query = query.where(AuditLog.user_id == user_id)

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    logs = result.scalars().all()

    return [
        {
            "id": str(log.id),
            "user_id": str(log.user_id) if log.user_id else None,
            "action": log.action,
            "resource": log.resource,
            "resource_id": log.resource_id,
            "details": log.details,
            "ip_address": log.ip_address,
            "entry_hash": log.entry_hash,
            "previous_hash": log.previous_hash,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]


@router.get("/audit-logs/verify-integrity")
async def verify_log_integrity(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Verify the tamper-evidence of the audit log chain (admin only)."""
    result = await verify_audit_chain(db)
    return result


@router.get("/dashboard")
async def admin_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Admin dashboard overview stats."""
    from app.models.company import Company
    from app.models.job import Job
    from app.models.application import Application
    from app.models.resume import Resume

    user_count = (await db.execute(select(func.count(User.id)))).scalar()
    active_users = (await db.execute(select(func.count(User.id)).where(User.is_active == True, User.is_suspended == False))).scalar()
    company_count = (await db.execute(select(func.count(Company.id)))).scalar()
    job_count = (await db.execute(select(func.count(Job.id)))).scalar()
    app_count = (await db.execute(select(func.count(Application.id)))).scalar()
    resume_count = (await db.execute(select(func.count(Resume.id)))).scalar()
    log_count = (await db.execute(select(func.count(AuditLog.id)))).scalar()
    suspended_count = (await db.execute(select(func.count(User.id)).where(User.is_suspended == True))).scalar()
    active_jobs = (await db.execute(select(func.count(Job.id)).where(Job.is_active == True))).scalar()

    return {
        "total_users": user_count,
        "active_users": active_users,
        "total_companies": company_count,
        "total_jobs": job_count,
        "active_jobs": active_jobs,
        "total_applications": app_count,
        "total_resumes": resume_count,
        "total_audit_logs": log_count,
        "suspended_users": suspended_count,
    }


@router.get("/jobs")
async def admin_list_jobs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """List all jobs for admin management."""
    from app.models.job import Job
    from app.models.company import Company

    result = await db.execute(
        select(Job, Company.name.label("company_name"))
        .join(Company, Job.company_id == Company.id)
        .order_by(Job.created_at.desc())
    )
    rows = result.all()

    return [
        {
            "id": str(j.id),
            "title": j.title,
            "company_name": cn,
            "location": j.location,
            "job_type": j.job_type.value if hasattr(j.job_type, 'value') else j.job_type,
            "is_active": j.is_active,
            "created_at": j.created_at.isoformat(),
        }
        for j, cn in rows
    ]


@router.put("/jobs/{job_id}/delist")
async def admin_delist_job(
    job_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Admin: delist (deactivate) or re-activate a job listing."""
    from app.models.job import Job

    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.is_active = not job.is_active
    await db.flush()

    await create_audit_log(
        db=db,
        action="admin.job_toggle_active",
        user_id=str(current_user.id),
        resource="job",
        resource_id=str(job.id),
        details={"is_active": job.is_active, "title": job.title},
        ip_address=request.client.host if request.client else None,
    )

    return {"message": f"Job {'activated' if job.is_active else 'delisted'}", "is_active": job.is_active}
