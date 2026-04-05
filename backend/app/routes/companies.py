"""
VajraKavach — Company Routes
Company page CRUD for recruiters; searchable by all users.
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from typing import Optional

from app.database import get_db
from app.models.company import Company
from app.models.user import User
from app.schemas.company import CompanyCreate, CompanyUpdate, CompanyResponse
from app.dependencies import get_current_user, require_role
from app.services.audit_service import create_audit_log
from app.utils.ip import get_client_ip
from app.utils.sanitize import escape_like

router = APIRouter(prefix="/api/companies", tags=["Companies"])


@router.post("/", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
async def create_company(
    req: CompanyCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("recruiter", "platform_admin")),
):
    """Create a new company page (recruiter or admin only)."""
    company = Company(
        id=uuid.uuid4(),
        name=req.name,
        description=req.description,
        location=req.location,
        website=req.website,
        admin_id=current_user.id,
    )
    db.add(company)
    await db.flush()

    await create_audit_log(
        db=db,
        action="company.create",
        user_id=str(current_user.id),
        resource="company",
        resource_id=str(company.id),
        details={"name": req.name},
        ip_address=get_client_ip(request),
    )

    return CompanyResponse(
        id=str(company.id),
        name=company.name,
        description=company.description,
        location=company.location,
        website=company.website,
        is_verified=company.is_verified,
        admin_id=str(company.admin_id),
        created_at=company.created_at,
    )


@router.get("/search", response_model=list[CompanyResponse])
async def search_companies(
    q: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Search companies by name or location (accessible to all authenticated users)."""
    query = select(Company)
    if q:
        eq = escape_like(q)
        query = query.where(
            or_(
                Company.name.ilike(f"%{eq}%"),
                Company.location.ilike(f"%{eq}%"),
            )
        )
    query = query.order_by(Company.name).limit(50)
    result = await db.execute(query)
    companies = result.scalars().all()

    return [
        CompanyResponse(
            id=str(c.id),
            name=c.name,
            description=c.description,
            location=c.location,
            website=c.website,
            is_verified=c.is_verified,
            admin_id=str(c.admin_id),
            created_at=c.created_at,
        )
        for c in companies
    ]


@router.get("/", response_model=list[CompanyResponse])
async def list_companies(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all companies."""
    result = await db.execute(select(Company))
    companies = result.scalars().all()

    return [
        CompanyResponse(
            id=str(c.id),
            name=c.name,
            description=c.description,
            location=c.location,
            website=c.website,
            is_verified=c.is_verified,
            admin_id=str(c.admin_id),
            created_at=c.created_at,
        )
        for c in companies
    ]


@router.get("/my", response_model=list[CompanyResponse])
async def my_companies(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("recruiter", "platform_admin")),
):
    """List companies owned by the current recruiter."""
    result = await db.execute(
        select(Company).where(Company.admin_id == current_user.id)
    )
    companies = result.scalars().all()

    return [
        CompanyResponse(
            id=str(c.id),
            name=c.name,
            description=c.description,
            location=c.location,
            website=c.website,
            is_verified=c.is_verified,
            admin_id=str(c.admin_id),
            created_at=c.created_at,
        )
        for c in companies
    ]


@router.get("/{company_id}", response_model=CompanyResponse)
async def get_company(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific company."""
    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    return CompanyResponse(
        id=str(company.id),
        name=company.name,
        description=company.description,
        location=company.location,
        website=company.website,
        is_verified=company.is_verified,
        admin_id=str(company.admin_id),
        created_at=company.created_at,
    )


@router.put("/{company_id}", response_model=CompanyResponse)
async def update_company(
    company_id: str,
    req: CompanyUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a company page (owner or admin only)."""
    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    if str(company.admin_id) != str(current_user.id) and current_user.role.value != "platform_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    update_data = req.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(company, field, value)

    await db.flush()

    await create_audit_log(
        db=db,
        action="company.update",
        user_id=str(current_user.id),
        resource="company",
        resource_id=str(company.id),
        details={"updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
    )

    return CompanyResponse(
        id=str(company.id),
        name=company.name,
        description=company.description,
        location=company.location,
        website=company.website,
        is_verified=company.is_verified,
        admin_id=str(company.admin_id),
        created_at=company.created_at,
    )


@router.delete("/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company(
    company_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a company page (owner or admin only)."""
    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    if str(company.admin_id) != str(current_user.id) and current_user.role.value != "platform_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    await create_audit_log(
        db=db,
        action="company.delete",
        user_id=str(current_user.id),
        resource="company",
        resource_id=str(company.id),
        details={"name": company.name},
        ip_address=get_client_ip(request),
    )

    await db.delete(company)
