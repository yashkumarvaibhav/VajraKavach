"""
VajraKavach — User & Profile Routes
Profile CRUD, connections, profile viewing.
"""

import uuid
import os
import aiofiles
from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_

from app.database import get_db
from app.models.user import User, UserProfile
from app.models.connection import Connection, ConnectionStatus
from app.schemas.user import (
    UserResponse, UserProfileUpdate, UserProfileResponse,
    ConnectionRequest, ConnectionResponse, UserNameUpdate,
)
from app.dependencies import get_current_user
from app.services.audit_service import create_audit_log
from app.config import settings

router = APIRouter(prefix="/api/users", tags=["Users & Profiles"])


# ── User Search ──────────────────────────────────────────────────────

@router.get("/search", response_model=list[UserResponse])
async def search_users(
    q: str = "",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Search users by name or email (for connections/messaging)."""
    from sqlalchemy import func as sqlfunc
    query = select(User).where(User.is_active == True, User.id != current_user.id)
    if q:
        query = query.where(
            or_(
                User.full_name.ilike(f"%{q}%"),
                User.email.ilike(f"%{q}%"),
            )
        )
    query = query.limit(20)
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


# ── User Account ─────────────────────────────────────────────────────

@router.put("/me", response_model=UserResponse)
async def update_my_account(
    update: UserNameUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update account-level fields (full_name, phone)."""
    if update.full_name is not None:
        current_user.full_name = update.full_name
    if update.phone is not None:
        current_user.phone = update.phone

    await db.flush()
    await create_audit_log(
        db=db,
        action="user.account_update",
        user_id=str(current_user.id),
        resource="user",
        resource_id=str(current_user.id),
        details={"updated_fields": update.model_dump(exclude_unset=True)},
        ip_address=request.client.host if request.client else None,
    )

    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role.value,
        is_active=current_user.is_active,
        totp_verified=current_user.totp_verified,
        created_at=current_user.created_at,
    )


# ── Profile Picture ──────────────────────────────────────────────────

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB

@router.post("/me/profile-picture")
async def upload_profile_picture(
    file: UploadFile = File(...),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a profile picture (max 5 MB, jpg/png/webp/gif)."""
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, and GIF images are allowed")

    contents = await file.read()
    if len(contents) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="Image must be under 5 MB")

    # Save to uploads/avatars/<user_id>.<ext>
    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else 'jpg'
    avatar_dir = os.path.join(settings.UPLOAD_DIR, "avatars")
    os.makedirs(avatar_dir, exist_ok=True)
    filename = f"{current_user.id}.{ext}"
    filepath = os.path.join(avatar_dir, filename)

    async with aiofiles.open(filepath, "wb") as f:
        await f.write(contents)

    # Update profile
    result = await db.execute(
        select(UserProfile).where(UserProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if profile:
        profile.profile_picture_url = f"/api/users/me/profile-picture/{filename}"
        await db.flush()

    await create_audit_log(
        db=db,
        action="user.profile_picture_upload",
        user_id=str(current_user.id),
        resource="user_profile",
        details={"filename": filename, "size_bytes": len(contents)},
        ip_address=request.client.host if request.client else None,
    )

    return {"url": f"/api/users/me/profile-picture/{filename}"}


@router.get("/me/profile-picture/{filename}")
async def get_profile_picture(filename: str):
    """Serve a profile picture file."""
    from fastapi.responses import FileResponse
    filepath = os.path.join(settings.UPLOAD_DIR, "avatars", filename)
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(filepath)


# ── Profile ──────────────────────────────────────────────────────────

@router.get("/me/profile", response_model=UserProfileResponse)
async def get_my_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get current user's full profile."""
    result = await db.execute(
        select(UserProfile).where(UserProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    return UserProfileResponse(
        id=str(profile.id),
        user_id=str(profile.user_id),
        full_name=current_user.full_name,
        email=current_user.email,
        headline=profile.headline,
        location=profile.location,
        bio=profile.bio,
        education=profile.education,
        experience=profile.experience,
        skills=profile.skills,
        profile_picture_url=profile.profile_picture_url,
        privacy_settings=profile.privacy_settings,
        view_count=profile.view_count,
        show_viewers=profile.show_viewers,
    )


@router.put("/me/profile", response_model=UserProfileResponse)
async def update_my_profile(
    update: UserProfileUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update current user's profile."""
    result = await db.execute(
        select(UserProfile).where(UserProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    update_data = update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(profile, field, value)

    await db.flush()

    await create_audit_log(
        db=db,
        action="user.profile_update",
        user_id=str(current_user.id),
        resource="user_profile",
        resource_id=str(profile.id),
        details={"updated_fields": list(update_data.keys())},
        ip_address=request.client.host if request.client else None,
    )

    return UserProfileResponse(
        id=str(profile.id),
        user_id=str(profile.user_id),
        full_name=current_user.full_name,
        email=current_user.email,
        headline=profile.headline,
        location=profile.location,
        bio=profile.bio,
        education=profile.education,
        experience=profile.experience,
        skills=profile.skills,
        profile_picture_url=profile.profile_picture_url,
        privacy_settings=profile.privacy_settings,
        view_count=profile.view_count,
        show_viewers=profile.show_viewers,
    )


@router.get("/{user_id}/profile", response_model=UserProfileResponse)
async def view_user_profile(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """View another user's profile (respects privacy settings)."""
    result = await db.execute(
        select(UserProfile).where(UserProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    # Increment view count
    if str(current_user.id) != user_id:
        current_count = profile.view_count if isinstance(profile.view_count, int) else 0
        profile.view_count = current_count + 1

    # Check connection status for privacy filtering
    is_connected = False
    if str(current_user.id) != user_id:
        conn_result = await db.execute(
            select(Connection).where(
                and_(
                    Connection.status == ConnectionStatus.ACCEPTED,
                    or_(
                        and_(Connection.requester_id == current_user.id, Connection.addressee_id == user_id),
                        and_(Connection.requester_id == user_id, Connection.addressee_id == current_user.id),
                    )
                )
            )
        )
        is_connected = conn_result.scalar_one_or_none() is not None

    # Apply privacy filtering
    privacy = profile.privacy_settings or {}
    response_data = {
        "id": str(profile.id),
        "user_id": str(profile.user_id),
        "headline": profile.headline,
        "location": profile.location,
        "bio": profile.bio,
        "education": profile.education,
        "experience": profile.experience,
        "skills": profile.skills,
        "profile_picture_url": profile.profile_picture_url,
        "privacy_settings": None,  # don't expose privacy settings to others
        "view_count": profile.view_count if profile.show_viewers else 0,
        "show_viewers": profile.show_viewers,
    }

    # Filter fields based on privacy
    is_owner = str(current_user.id) == user_id
    is_admin = current_user.role.value == "admin"
    for field, level in privacy.items():
        if field in response_data and not is_owner and not is_admin:
            if level == "private":
                response_data[field] = None
            elif level == "connections" and not is_connected:
                response_data[field] = None

    return UserProfileResponse(**response_data)


# ── Connections ──────────────────────────────────────────────────────

@router.post("/connections", response_model=ConnectionResponse, status_code=status.HTTP_201_CREATED)
async def send_connection_request(
    req: ConnectionRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a professional connection request."""
    if str(current_user.id) == req.addressee_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot connect to yourself")

    # Check if connection already exists
    existing = await db.execute(
        select(Connection).where(
            or_(
                and_(Connection.requester_id == current_user.id, Connection.addressee_id == req.addressee_id),
                and_(Connection.requester_id == req.addressee_id, Connection.addressee_id == current_user.id),
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Connection request already exists")

    conn = Connection(
        id=uuid.uuid4(),
        requester_id=current_user.id,
        addressee_id=uuid.UUID(req.addressee_id),
        status=ConnectionStatus.PENDING,
    )
    db.add(conn)
    await db.flush()

    await create_audit_log(
        db=db,
        action="connection.request",
        user_id=str(current_user.id),
        resource="connection",
        resource_id=str(conn.id),
        ip_address=request.client.host if request.client else None,
    )

    return ConnectionResponse(
        id=str(conn.id),
        requester_id=str(conn.requester_id),
        addressee_id=str(conn.addressee_id),
        status=conn.status.value,
        created_at=conn.created_at,
    )


@router.put("/connections/{connection_id}/accept", response_model=ConnectionResponse)
async def accept_connection(
    connection_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Accept a pending connection request."""
    result = await db.execute(
        select(Connection).where(
            Connection.id == connection_id,
            Connection.addressee_id == current_user.id,
            Connection.status == ConnectionStatus.PENDING,
        )
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection request not found")

    conn.status = ConnectionStatus.ACCEPTED
    await db.flush()

    return ConnectionResponse(
        id=str(conn.id),
        requester_id=str(conn.requester_id),
        addressee_id=str(conn.addressee_id),
        status=conn.status.value,
        created_at=conn.created_at,
    )


@router.delete("/connections/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_connection(
    connection_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a connection or reject a request."""
    result = await db.execute(
        select(Connection).where(
            Connection.id == connection_id,
            or_(
                Connection.requester_id == current_user.id,
                Connection.addressee_id == current_user.id,
            ),
        )
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")

    await db.delete(conn)


@router.get("/connections", response_model=list[ConnectionResponse])
async def list_connections(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all connections for the current user."""
    result = await db.execute(
        select(Connection).where(
            and_(
                Connection.status == ConnectionStatus.ACCEPTED,
                or_(
                    Connection.requester_id == current_user.id,
                    Connection.addressee_id == current_user.id,
                ),
            )
        )
    )
    connections = result.scalars().all()

    return [
        ConnectionResponse(
            id=str(c.id),
            requester_id=str(c.requester_id),
            addressee_id=str(c.addressee_id),
            status=c.status.value,
            created_at=c.created_at,
        )
        for c in connections
    ]


@router.get("/connections/pending", response_model=list[ConnectionResponse])
async def list_pending_requests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List pending connection requests for the current user."""
    result = await db.execute(
        select(Connection).where(
            Connection.addressee_id == current_user.id,
            Connection.status == ConnectionStatus.PENDING,
        )
    )
    connections = result.scalars().all()

    return [
        ConnectionResponse(
            id=str(c.id),
            requester_id=str(c.requester_id),
            addressee_id=str(c.addressee_id),
            status=c.status.value,
            created_at=c.created_at,
        )
        for c in connections
    ]
