"""
VajraKavach — Report Routes
User reporting / flagging system for platform moderation.
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

from app.database import get_db
from app.models.report import Report, ReportStatus, ReportCategory
from app.models.user import User
from app.dependencies import get_current_user, require_role
from app.services.audit_service import create_audit_log
from app.utils.ip import get_client_ip

router = APIRouter(prefix="/api/reports", tags=["Reports"])


# ── Schemas ────────────────────────────────────────────────────

class ReportCreate(BaseModel):
    reported_user_id: Optional[str] = None
    category: str = Field(..., description="spam, harassment, fraud, inappropriate, impersonation, other")
    description: str = Field(..., max_length=2000, min_length=5)
    resource_type: Optional[str] = None  # 'user', 'message', 'job'
    resource_id: Optional[str] = None


class ReportResponse(BaseModel):
    id: str
    reporter_id: str
    reporter_name: Optional[str] = None
    reported_user_id: Optional[str] = None
    reported_user_name: Optional[str] = None
    category: str
    description: str
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    status: str
    admin_notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ReportUpdateStatus(BaseModel):
    status: str = Field(..., description="reviewed, resolved, dismissed")
    admin_notes: Optional[str] = Field(None, max_length=2000)


# ── User Routes ────────────────────────────────────────────────

@router.post("/", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
async def create_report(
    req: ReportCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a report / flag content or a user."""
    # Validate category
    try:
        category = ReportCategory(req.category)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid category. Must be one of: {[c.value for c in ReportCategory]}")

    # Prevent self-reporting
    if req.reported_user_id and req.reported_user_id == str(current_user.id):
        raise HTTPException(status_code=400, detail="Cannot report yourself")

    # Verify reported user exists (if provided)
    reported_user = None
    if req.reported_user_id:
        result = await db.execute(select(User).where(User.id == req.reported_user_id))
        reported_user = result.scalar_one_or_none()
        if not reported_user:
            raise HTTPException(status_code=404, detail="Reported user not found")

    report = Report(
        id=uuid.uuid4(),
        reporter_id=current_user.id,
        reported_user_id=uuid.UUID(req.reported_user_id) if req.reported_user_id else None,
        category=category,
        description=req.description,
        resource_type=req.resource_type,
        resource_id=req.resource_id,
        status=ReportStatus.PENDING,
    )
    db.add(report)
    await db.flush()

    await create_audit_log(
        db=db,
        action="report.created",
        user_id=str(current_user.id),
        resource="report",
        resource_id=str(report.id),
        details={
            "category": req.category,
            "reported_user_id": req.reported_user_id,
            "resource_type": req.resource_type,
        },
        ip_address=get_client_ip(request),
    )

    return ReportResponse(
        id=str(report.id),
        reporter_id=str(current_user.id),
        reporter_name=current_user.full_name,
        reported_user_id=req.reported_user_id,
        reported_user_name=reported_user.full_name if reported_user else None,
        category=report.category.value,
        description=report.description,
        resource_type=report.resource_type,
        resource_id=report.resource_id,
        status=report.status.value,
        created_at=report.created_at,
    )


@router.get("/my", response_model=list[ReportResponse])
async def get_my_reports(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get reports submitted by the current user."""
    result = await db.execute(
        select(Report)
        .where(Report.reporter_id == current_user.id)
        .order_by(Report.created_at.desc())
    )
    reports = result.scalars().all()
    responses = []
    for r in reports:
        reported_name = None
        if r.reported_user_id:
            u_result = await db.execute(select(User).where(User.id == r.reported_user_id))
            u = u_result.scalar_one_or_none()
            reported_name = u.full_name if u else None
        responses.append(ReportResponse(
            id=str(r.id),
            reporter_id=str(r.reporter_id),
            reporter_name=current_user.full_name,
            reported_user_id=str(r.reported_user_id) if r.reported_user_id else None,
            reported_user_name=reported_name,
            category=r.category.value,
            description=r.description,
            resource_type=r.resource_type,
            resource_id=r.resource_id,
            status=r.status.value,
            created_at=r.created_at,
        ))
    return responses


# ── Admin Routes ───────────────────────────────────────────────

@router.get("/admin/all", response_model=list[ReportResponse])
async def admin_get_all_reports(
    status_filter: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Admin: Get all reports with optional status filter."""
    query = select(Report).order_by(Report.created_at.desc())
    if status_filter:
        try:
            rs = ReportStatus(status_filter)
            query = query.where(Report.status == rs)
        except ValueError:
            pass

    result = await db.execute(query)
    reports = result.scalars().all()

    # Batch-load names
    user_ids = set()
    for r in reports:
        user_ids.add(r.reporter_id)
        if r.reported_user_id:
            user_ids.add(r.reported_user_id)

    names = {}
    if user_ids:
        users_result = await db.execute(select(User).where(User.id.in_(user_ids)))
        for u in users_result.scalars().all():
            names[str(u.id)] = u.full_name

    responses = []
    for r in reports:
        responses.append(ReportResponse(
            id=str(r.id),
            reporter_id=str(r.reporter_id),
            reporter_name=names.get(str(r.reporter_id)),
            reported_user_id=str(r.reported_user_id) if r.reported_user_id else None,
            reported_user_name=names.get(str(r.reported_user_id)) if r.reported_user_id else None,
            category=r.category.value,
            description=r.description,
            resource_type=r.resource_type,
            resource_id=r.resource_id,
            status=r.status.value,
            admin_notes=r.admin_notes,
            created_at=r.created_at,
        ))
    return responses


@router.put("/admin/{report_id}", response_model=ReportResponse)
async def admin_update_report(
    report_id: str,
    req: ReportUpdateStatus,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Admin: Update a report's status."""
    try:
        new_status = ReportStatus(req.status)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {[s.value for s in ReportStatus]}")

    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    report.status = new_status
    report.admin_notes = req.admin_notes or report.admin_notes
    report.resolved_by = current_user.id
    await db.flush()

    await create_audit_log(
        db=db,
        action="report.status_updated",
        user_id=str(current_user.id),
        resource="report",
        resource_id=str(report.id),
        details={"new_status": req.status},
        ip_address=get_client_ip(request),
    )

    # Load names
    reporter_name = None
    reported_name = None
    r_result = await db.execute(select(User).where(User.id == report.reporter_id))
    reporter = r_result.scalar_one_or_none()
    if reporter:
        reporter_name = reporter.full_name
    if report.reported_user_id:
        ru_result = await db.execute(select(User).where(User.id == report.reported_user_id))
        ru = ru_result.scalar_one_or_none()
        if ru:
            reported_name = ru.full_name

    return ReportResponse(
        id=str(report.id),
        reporter_id=str(report.reporter_id),
        reporter_name=reporter_name,
        reported_user_id=str(report.reported_user_id) if report.reported_user_id else None,
        reported_user_name=reported_name,
        category=report.category.value,
        description=report.description,
        resource_type=report.resource_type,
        resource_id=report.resource_id,
        status=report.status.value,
        admin_notes=report.admin_notes,
        created_at=report.created_at,
    )
