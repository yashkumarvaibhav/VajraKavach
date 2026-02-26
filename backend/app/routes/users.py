"""
VajraKavach — User & Profile Routes
Profile CRUD, connections, profile viewing, connection graph.
"""

import uuid
import os
import aiofiles
from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, func

from app.database import get_db
from app.models.user import User, UserProfile, UserRole, ProfileView
from app.models.connection import Connection, ConnectionStatus
from app.schemas.user import (
    UserResponse, UserProfileUpdate, UserProfileResponse,
    ConnectionRequest, ConnectionResponse, UserNameUpdate,
    UserSearchResponse,
)
from app.dependencies import get_current_user
from app.services.audit_service import create_audit_log
from app.config import settings

router = APIRouter(prefix="/api/users", tags=["Users & Profiles"])


# ── Helpers ──────────────────────────────────────────────────────────

async def _get_connection_status(db, user_id, other_id):
    """Get connection status between two users."""
    result = await db.execute(
        select(Connection).where(
            or_(
                and_(Connection.requester_id == user_id, Connection.addressee_id == other_id),
                and_(Connection.requester_id == other_id, Connection.addressee_id == user_id),
            )
        )
    )
    conn = result.scalar_one_or_none()
    if not conn:
        return None
    return conn.status.value


async def _enrich_connection(db, conn, current_user_id):
    """Attach requester/addressee profile info to a connection response."""
    # Fetch requester info
    req_user = await db.execute(select(User).where(User.id == conn.requester_id))
    req = req_user.scalar_one_or_none()
    req_profile = None
    if req:
        rp = await db.execute(select(UserProfile).where(UserProfile.user_id == req.id))
        req_profile = rp.scalar_one_or_none()

    # Fetch addressee info
    addr_user = await db.execute(select(User).where(User.id == conn.addressee_id))
    addr = addr_user.scalar_one_or_none()
    addr_profile = None
    if addr:
        ap = await db.execute(select(UserProfile).where(UserProfile.user_id == addr.id))
        addr_profile = ap.scalar_one_or_none()

    return ConnectionResponse(
        id=str(conn.id),
        requester_id=str(conn.requester_id),
        addressee_id=str(conn.addressee_id),
        status=conn.status.value,
        created_at=conn.created_at,
        requester_name=req.full_name if req else None,
        requester_headline=req_profile.headline if req_profile else None,
        requester_picture=req_profile.profile_picture_url if req_profile else None,
        addressee_name=addr.full_name if addr else None,
        addressee_headline=addr_profile.headline if addr_profile else None,
        addressee_picture=addr_profile.profile_picture_url if addr_profile else None,
    )


# ── User Search ──────────────────────────────────────────────────────

@router.get("/search", response_model=list[UserSearchResponse])
async def search_users(
    q: str = "",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Search users by name or email (excludes admins from results)."""
    query = select(User).where(
        User.is_active == True,
        User.id != current_user.id,
        User.role != UserRole.ADMIN,  # Hide admin users
    )
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

    responses = []
    for u in users:
        # Get profile info
        prof_result = await db.execute(select(UserProfile).where(UserProfile.user_id == u.id))
        prof = prof_result.scalar_one_or_none()

        # Get connection status
        conn_status = await _get_connection_status(db, current_user.id, u.id)

        responses.append(UserSearchResponse(
            id=str(u.id),
            email=u.email,
            full_name=u.full_name,
            role=u.role.value,
            headline=prof.headline if prof else None,
            profile_picture_url=prof.profile_picture_url if prof else None,
            connection_status=conn_status,
        ))

    return responses


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
        is_suspended=current_user.is_suspended,
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

    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else 'jpg'
    avatar_dir = os.path.join(settings.UPLOAD_DIR, "avatars")
    os.makedirs(avatar_dir, exist_ok=True)
    filename = f"{current_user.id}.{ext}"
    filepath = os.path.join(avatar_dir, filename)

    async with aiofiles.open(filepath, "wb") as f:
        await f.write(contents)

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
        website=profile.website,
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
        website=profile.website,
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

    # Get the user object for full_name
    user_result = await db.execute(select(User).where(User.id == user_id))
    target_user = user_result.scalar_one_or_none()

    # Increment view count and record viewer (only if show_viewers is enabled)
    if str(current_user.id) != user_id and profile.show_viewers:
        profile.view_count = (profile.view_count or 0) + 1

        # Upsert profile view record (update timestamp and visit count if already viewed)
        existing_view = await db.execute(
            select(ProfileView).where(
                ProfileView.profile_user_id == uuid.UUID(user_id),
                ProfileView.viewer_id == current_user.id,
            )
        )
        pv = existing_view.scalar_one_or_none()
        if pv:
            from datetime import datetime
            pv.viewed_at = datetime.utcnow()
            pv.visit_count = (pv.visit_count or 1) + 1
        else:
            pv = ProfileView(
                id=uuid.uuid4(),
                profile_user_id=uuid.UUID(user_id),
                viewer_id=current_user.id,
                visit_count=1,
            )
            db.add(pv)

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
        "full_name": target_user.full_name if target_user else None,
        "email": target_user.email if target_user else None,
        "headline": profile.headline,
        "location": profile.location,
        "bio": profile.bio,
        "website": profile.website,
        "education": profile.education,
        "experience": profile.experience,
        "skills": profile.skills,
        "profile_picture_url": profile.profile_picture_url,
        "privacy_settings": None,
        "view_count": profile.view_count if profile.show_viewers else 0,
        "show_viewers": profile.show_viewers,
    }

    is_owner = str(current_user.id) == user_id
    is_admin = current_user.role.value == "admin"
    for field, level in privacy.items():
        if field in response_data and not is_owner and not is_admin:
            if level == "private":
                response_data[field] = None
            elif level == "connections" and not is_connected:
                response_data[field] = None

    return UserProfileResponse(**response_data)


# ── Profile Viewers ──────────────────────────────────────────────────

@router.get("/me/profile/viewers")
async def get_profile_viewers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get list of users who viewed current user's profile (most recent 20)."""
    # Check if user has show_viewers enabled
    prof_result = await db.execute(
        select(UserProfile).where(UserProfile.user_id == current_user.id)
    )
    profile = prof_result.scalar_one_or_none()
    if not profile or not profile.show_viewers:
        return {"viewers": [], "total": 0}

    result = await db.execute(
        select(ProfileView)
        .where(ProfileView.profile_user_id == current_user.id)
        .order_by(ProfileView.viewed_at.desc())
        .limit(20)
    )
    views = result.scalars().all()

    viewers = []
    for v in views:
        user_result = await db.execute(select(User).where(User.id == v.viewer_id))
        viewer_user = user_result.scalar_one_or_none()
        vp_result = await db.execute(select(UserProfile).where(UserProfile.user_id == v.viewer_id))
        viewer_profile = vp_result.scalar_one_or_none()
        if viewer_user:
            viewers.append({
                "id": str(viewer_user.id),
                "name": viewer_user.full_name,
                "headline": viewer_profile.headline if viewer_profile else None,
                "picture": viewer_profile.profile_picture_url if viewer_profile else None,
                "viewed_at": v.viewed_at.isoformat() if v.viewed_at else None,
                "visit_count": v.visit_count or 1,
            })

    # Total unique viewers count
    total_result = await db.execute(
        select(func.count(ProfileView.id))
        .where(ProfileView.profile_user_id == current_user.id)
    )
    total = total_result.scalar() or 0

    return {"viewers": viewers, "total": total}


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

    return await _enrich_connection(db, conn, str(current_user.id))


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

    return await _enrich_connection(db, conn, str(current_user.id))


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
    """List all accepted connections for the current user."""
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
    return [await _enrich_connection(db, c, str(current_user.id)) for c in connections]


@router.get("/connections/pending", response_model=list[ConnectionResponse])
async def list_pending_requests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List pending connection requests RECEIVED by the current user."""
    result = await db.execute(
        select(Connection).where(
            Connection.addressee_id == current_user.id,
            Connection.status == ConnectionStatus.PENDING,
        )
    )
    connections = result.scalars().all()
    return [await _enrich_connection(db, c, str(current_user.id)) for c in connections]


@router.get("/connections/sent", response_model=list[ConnectionResponse])
async def list_sent_requests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List pending connection requests SENT by the current user."""
    result = await db.execute(
        select(Connection).where(
            Connection.requester_id == current_user.id,
            Connection.status == ConnectionStatus.PENDING,
        )
    )
    connections = result.scalars().all()
    return [await _enrich_connection(db, c, str(current_user.id)) for c in connections]


@router.get("/connections/graph")
async def connection_graph(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a limited connection graph restricted to user's connections.
    Returns nodes (connected users) and edges (connections between them)."""
    # Get all my connections
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
    my_connections = result.scalars().all()

    # Collect connected user IDs
    connected_ids = set()
    for c in my_connections:
        other_id = str(c.addressee_id) if str(c.requester_id) == str(current_user.id) else str(c.requester_id)
        connected_ids.add(other_id)

    # Build nodes
    nodes = [{"id": str(current_user.id), "name": current_user.full_name, "role": current_user.role.value, "is_self": True}]
    for uid in connected_ids:
        u_result = await db.execute(select(User).where(User.id == uid))
        u = u_result.scalar_one_or_none()
        if u:
            nodes.append({"id": str(u.id), "name": u.full_name, "role": u.role.value, "is_self": False})

    # Build edges: connections between me and my connections
    edges = []
    for c in my_connections:
        edges.append({"from": str(c.requester_id), "to": str(c.addressee_id)})

    # Also find connections BETWEEN my connections (mutual connections)
    if connected_ids:
        from sqlalchemy import cast
        mutual_result = await db.execute(
            select(Connection).where(
                and_(
                    Connection.status == ConnectionStatus.ACCEPTED,
                    Connection.requester_id.in_(connected_ids),
                    Connection.addressee_id.in_(connected_ids),
                )
            )
        )
        mutual = mutual_result.scalars().all()
        for c in mutual:
            edges.append({"from": str(c.requester_id), "to": str(c.addressee_id)})

    return {"nodes": nodes, "edges": edges}
