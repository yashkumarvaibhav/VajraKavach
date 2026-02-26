"""
VajraKavach — Admin Routes
User management, moderation, audit log viewing.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional

from app.database import get_db
from app.models.user import User
from app.models.audit import AuditLog
from app.schemas.user import UserResponse
from app.dependencies import require_role
from app.services.audit_service import create_audit_log, verify_audit_chain

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.get("/users", response_model=list[UserResponse])
async def list_all_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    role: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """List all users (admin only)."""
    query = select(User)
    if role:
        query = query.where(User.role == role)

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    users = result.scalars().all()

    return [
        UserResponse(
            id=str(u.id),
            email=u.email,
            full_name=u.full_name,
            role=u.role.value,
            is_active=u.is_active,
            totp_verified=u.totp_verified,
            created_at=u.created_at,
        )
        for u in users
    ]


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
    company_count = (await db.execute(select(func.count(Company.id)))).scalar()
    job_count = (await db.execute(select(func.count(Job.id)))).scalar()
    app_count = (await db.execute(select(func.count(Application.id)))).scalar()
    resume_count = (await db.execute(select(func.count(Resume.id)))).scalar()
    log_count = (await db.execute(select(func.count(AuditLog.id)))).scalar()

    return {
        "total_users": user_count,
        "total_companies": company_count,
        "total_jobs": job_count,
        "total_applications": app_count,
        "total_resumes": resume_count,
        "total_audit_logs": log_count,
    }
