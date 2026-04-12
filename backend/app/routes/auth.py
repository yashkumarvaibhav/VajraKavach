"""
VajraKavach — Auth Routes
Registration, login, TOTP setup & verification, token refresh, password change.
"""

import uuid
import os
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.user import User, UserProfile, UserRole
from app.schemas.auth import (
    RegisterRequest, LoginRequest, TOTPVerifyRequest,
    TokenResponse, TOTPSetupResponse, RefreshTokenRequest,
    PasswordChangeRequest, SetupVerifyRequest, ForgotPasswordRequest,
    DeleteAccountRequest,
)
from app.schemas.user import UserResponse
from app.services.auth_service import (
    hash_password, verify_password, create_access_token,
    create_refresh_token, decode_token, revoke_token,
    flush_pending_revocations, load_revoked_cache, is_token_revoked,
)
from app.services.totp_service import (
    generate_totp_secret, get_totp_uri, generate_qr_code_base64, verify_totp,
    encrypt_totp_secret, decrypt_totp_secret,
    check_totp_lockout, record_totp_failure, clear_totp_attempts,
)
from app.services.audit_service import create_audit_log
from app.dependencies import get_current_user_pre_totp, get_current_user
from app.utils.ip import get_client_ip
from app.models.resume import Resume
from app.config import settings
from app.services.action_rate_limit_service import check_action_rate_limit, record_action

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

DELETE_ACCOUNT_CONFIRMATION = "DELETE MY ACCOUNT"


def _request_is_https(request: Request) -> bool:
    forwarded_proto = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip().lower()
    return request.url.scheme == "https" or forwarded_proto == "https"


def _set_auth_cookies(response: Response, request: Request, access_token: str, refresh_token: str) -> None:
    secure = True
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=secure,
        samesite="strict",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=secure,
        samesite="strict",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/",
    )


def _clear_auth_cookies(response: Response, request: Request) -> None:
    secure = True
    response.delete_cookie("access_token", path="/", secure=secure, samesite="strict")
    response.delete_cookie("refresh_token", path="/", secure=secure, samesite="strict")


@router.post("/register", response_model=TOTPSetupResponse, status_code=status.HTTP_201_CREATED)
async def register(
    req: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Register a new user. Returns TOTP setup QR code."""
    # Rate limit: strict account creation per IP
    client_ip = get_client_ip(request)
    await check_action_rate_limit(db, "register", client_ip)

    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists. Please log in instead.",
        )

    # Reject duplicate phone numbers (if provided)
    if req.phone:
        phone_exists = await db.execute(
            select(User).where(User.phone == req.phone, User.phone != "", User.phone.isnot(None))
        )
        if phone_exists.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This phone number is already registered with another account.",
            )

    role = UserRole.USER
    if req.role == "recruiter":
        role = UserRole.RECRUITER
    elif req.role == "admin":
        role = UserRole.ADMIN

    hashed_pw = hash_password(req.password)
    totp_secret = generate_totp_secret()

    user = User(
        id=uuid.uuid4(),
        email=req.email,
        hashed_password=hashed_pw,
        full_name=req.full_name,
        phone=req.phone,
        role=role,
        totp_secret=encrypt_totp_secret(totp_secret),
        totp_verified=False,
        public_key=req.public_key,
        encrypted_private_key=None,
    )
    db.add(user)

    profile = UserProfile(
        id=uuid.uuid4(),
        user_id=user.id,
    )
    db.add(profile)
    await db.flush()

    await create_audit_log(
        db=db,
        action="user.register",
        user_id=str(user.id),
        resource="user",
        resource_id=str(user.id),
        details={"email": req.email, "role": role.value},
        ip_address=get_client_ip(request),
    )

    await record_action(db, "register", client_ip)

    totp_uri = get_totp_uri(totp_secret, req.email)
    qr_b64 = generate_qr_code_base64(totp_uri)

    return TOTPSetupResponse(
        totp_secret=totp_secret,
        qr_code_base64=qr_b64,
        message="Account created! Scan the QR code with your authenticator app, then verify with a TOTP token.",
    )


@router.post("/setup-verify")
async def setup_verify(
    req: SetupVerifyRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Verify TOTP during registration flow (before first login).
    This marks the user's TOTP as verified so the QR code won't be shown again on login."""
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()

    # Uniform error to prevent user enumeration
    _generic_error = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or TOTP token")

    if not user:
        raise _generic_error

    if user.totp_verified:
        raise _generic_error

    if not user.totp_secret:
        raise _generic_error

    client_ip = get_client_ip(request)
    if check_totp_lockout(client_ip):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many failed TOTP attempts. Try again later.")

    if not verify_totp(decrypt_totp_secret(user.totp_secret), req.token):
        record_totp_failure(client_ip)
        raise _generic_error

    clear_totp_attempts(client_ip)
    user.totp_verified = True
    await db.flush()

    await create_audit_log(
        db=db,
        action="user.totp_setup_verified",
        user_id=str(user.id),
        resource="user",
        resource_id=str(user.id),
        ip_address=get_client_ip(request),
    )

    return {"message": "TOTP verified successfully! You can now log in."}


@router.post("/login", response_model=TokenResponse)
async def login(
    req: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate with email + password. Returns JWT (TOTP still required)."""
    client_ip = get_client_ip(request)
    await check_action_rate_limit(db, "login", client_ip)

    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()

    if not user:
        # Perform a dummy hash to prevent timing oracle (same delay as real verification)
        verify_password(req.password, hash_password("dummy-constant-time-pad"))

    if not user or not verify_password(req.password, user.hashed_password):
        await create_audit_log(
            db=db,
            action="user.login_failed",
            details={"email": req.email},
            ip_address=get_client_ip(request),
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    if not user.is_active or user.is_suspended:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is suspended or deactivated")

    client_ip = get_client_ip(request)
    token_data = {"sub": str(user.id), "email": user.email, "role": user.role.value, "totp_verified": False, "ip": client_ip}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    _set_auth_cookies(response, request, access_token, refresh_token)

    await create_audit_log(
        db=db,
        action="user.login",
        user_id=str(user.id),
        resource="user",
        resource_id=str(user.id),
        ip_address=get_client_ip(request),
    )

    await record_action(db, "login", client_ip)

    user.last_login = datetime.utcnow()

    # If TOTP hasn't been verified yet (first-time setup), include QR code
    totp_setup_required = not user.totp_verified
    qr_code_b64 = None
    if totp_setup_required and user.totp_secret:
        totp_uri = get_totp_uri(decrypt_totp_secret(user.totp_secret), user.email)
        qr_code_b64 = generate_qr_code_base64(totp_uri)

    return TokenResponse(
        totp_required=True,
        totp_setup_required=totp_setup_required,
        totp_secret=None,
        qr_code_base64=qr_code_b64,
    )


@router.post("/verify-totp", response_model=TokenResponse)
async def verify_totp_endpoint(
    req: TOTPVerifyRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_pre_totp),
):
    """Verify TOTP token after login. Returns new JWT with totp_verified=True."""
    if not current_user.totp_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="TOTP not set up for this account")

    client_ip = get_client_ip(request)
    if check_totp_lockout(client_ip):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many failed TOTP attempts. Try again later.")

    if not verify_totp(decrypt_totp_secret(current_user.totp_secret), req.token):
        locked = record_totp_failure(client_ip)
        await create_audit_log(
            db=db,
            action="user.totp_failed",
            user_id=str(current_user.id),
            resource="user",
            resource_id=str(current_user.id),
            ip_address=get_client_ip(request),
            details={"locked_out": locked},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid TOTP token")

    clear_totp_attempts(client_ip)

    if not current_user.totp_verified:
        current_user.totp_verified = True

    client_ip = get_client_ip(request)
    token_data = {
        "sub": str(current_user.id),
        "email": current_user.email,
        "role": current_user.role.value,
        "totp_verified": True,
        "ip": client_ip,
    }
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    _set_auth_cookies(response, request, access_token, refresh_token)

    await create_audit_log(
        db=db,
        action="user.totp_verified",
        user_id=str(current_user.id),
        resource="user",
        resource_id=str(current_user.id),
        ip_address=get_client_ip(request),
    )

    return TokenResponse(
        totp_required=False,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: Request,
    response: Response,
    req: RefreshTokenRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Refresh an access token using a valid refresh token."""
    refresh_token_value = req.refresh_token if req and req.refresh_token else request.cookies.get("refresh_token")
    if not refresh_token_value:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token missing")

    payload = decode_token(refresh_token_value)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    # Rate limit token refresh per user
    user_id_from_token = payload.get("sub")
    if user_id_from_token:
        await check_action_rate_limit(db, "token_refresh", user_id_from_token)

    token_ip = payload.get("ip")
    if token_ip:
        request_ip = get_client_ip(request)
        if request_ip != token_ip:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session IP mismatch. Please log in again.",
            )

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id).with_for_update())
    user = result.scalar_one_or_none()

    if not user or not user.is_active or user.is_suspended:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found, inactive, or suspended")

    # Reject tokens issued before a forced reauth (e.g. forgot-password)
    if user.force_reauth_at:
        token_iat = payload.get("iat")
        if token_iat and datetime.utcfromtimestamp(token_iat) < user.force_reauth_at:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session invalidated. Please log in again.",
            )

    # Revoke the old refresh token BEFORE issuing new ones to close race window
    if is_token_revoked(refresh_token_value):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token already used")
    revoke_token(refresh_token_value)
    await flush_pending_revocations(db)

    token_data = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role.value,
        "totp_verified": payload.get("totp_verified", False),
        "ip": payload.get("ip"),
    }

    new_access_token = create_access_token(token_data)
    new_refresh_token = create_refresh_token(token_data)
    _set_auth_cookies(response, request, new_access_token, new_refresh_token)

    await record_action(db, "token_refresh", str(user.id))

    return TokenResponse(
        totp_required=not payload.get("totp_verified", False),
    )


@router.post("/change-password")
async def change_password(
    req: PasswordChangeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change password (requires current password + TOTP verification)."""
    await check_action_rate_limit(db, "password_change", str(current_user.id))

    if not verify_password(req.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")

    if check_totp_lockout(current_user.email):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many failed TOTP attempts. Try again later.")

    if not verify_totp(decrypt_totp_secret(current_user.totp_secret), req.totp_token):
        record_totp_failure(current_user.email)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid TOTP token")

    clear_totp_attempts(current_user.email)
    current_user.hashed_password = hash_password(req.new_password)

    # Revoke current session tokens so all sessions (including stolen ones) are invalidated
    access_token = request.cookies.get("access_token")
    refresh_tok = request.cookies.get("refresh_token")
    if access_token:
        revoke_token(access_token)
    if refresh_tok:
        revoke_token(refresh_tok)
    await flush_pending_revocations(db)

    await create_audit_log(
        db=db,
        action="user.password_change",
        user_id=str(current_user.id),
        resource="user",
        resource_id=str(current_user.id),
        ip_address=get_client_ip(request),
    )

    await record_action(db, "password_change", str(current_user.id))

    return {"message": "Password changed successfully. Please log in again."}


@router.post("/verify-password")
async def verify_password_endpoint(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Verify the current user's password without changing anything."""
    body = await request.json()
    password = body.get("password", "")
    if not password or not verify_password(password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password")
    return {"valid": True}


@router.get("/me", response_model=UserResponse)
async def get_me(request: Request, current_user: User = Depends(get_current_user)):
    """Get current authenticated user info."""
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role.value,
        is_active=current_user.is_active,
        is_suspended=current_user.is_suspended,
        totp_verified=current_user.totp_verified,
        created_at=current_user.created_at,
        ip_address=get_client_ip(request),
    )


@router.post("/forgot-password")
async def forgot_password(
    req: ForgotPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Reset password using email + TOTP verification (no login required)."""
    client_ip = get_client_ip(request)
    await check_action_rate_limit(db, "forgot_password", client_ip)

    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()

    if not user or not user.totp_secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or TOTP token")

    if check_totp_lockout(user.email):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many failed attempts. Try again later.")

    if not verify_totp(decrypt_totp_secret(user.totp_secret), req.totp_token):
        locked = record_totp_failure(user.email)
        await create_audit_log(
            db=db,
            action="user.forgot_password_failed",
            user_id=str(user.id),
            details={"email": req.email, "reason": "invalid_totp", "locked_out": locked},
            ip_address=get_client_ip(request),
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or TOTP token")

    clear_totp_attempts(user.email)
    user.hashed_password = hash_password(req.new_password)
    # Invalidate all existing sessions for this user
    user.force_reauth_at = datetime.utcnow()

    await create_audit_log(
        db=db,
        action="user.forgot_password_reset",
        user_id=str(user.id),
        resource="user",
        resource_id=str(user.id),
        ip_address=get_client_ip(request),
    )

    await record_action(db, "forgot_password", client_ip)

    return {"message": "Password reset successfully. You can now log in with your new password."}


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Clear the current auth session cookies and revoke tokens (persisted to DB)."""
    access_token = request.cookies.get("access_token")
    refresh_token = request.cookies.get("refresh_token")
    if access_token:
        revoke_token(access_token)
    if refresh_token:
        revoke_token(refresh_token)
    # Persist revocations to database so they survive server restarts
    await flush_pending_revocations(db)
    _clear_auth_cookies(response, request)
    return {"message": "Logged out successfully"}


@router.post("/delete-account")
async def delete_account(
    req: DeleteAccountRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete the current user's account after explicit confirmation + TOTP."""
    if req.confirmation_text.strip().upper() != DELETE_ACCOUNT_CONFIRMATION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'Type "{DELETE_ACCOUNT_CONFIRMATION}" to confirm account deletion.',
        )

    if not current_user.totp_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="TOTP not configured")

    if check_totp_lockout(current_user.email):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many failed TOTP attempts. Try again later.")

    if not verify_totp(decrypt_totp_secret(current_user.totp_secret), req.totp_token):
        record_totp_failure(current_user.email)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid TOTP token")

    clear_totp_attempts(current_user.email)

    if current_user.role == UserRole.PLATFORM_ADMIN:
        remaining_platform_admins = await db.execute(
            select(func.count(User.id)).where(
                User.role == UserRole.PLATFORM_ADMIN,
                User.id != current_user.id,
                User.is_active == True,
            )
        )
        if int(remaining_platform_admins.scalar() or 0) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot delete the last active platform admin account.",
            )

    resume_result = await db.execute(select(Resume).where(Resume.user_id == current_user.id))
    resumes = resume_result.scalars().all()
    deleted_resume_files = 0
    for resume in resumes:
        if resume.encrypted_path and os.path.exists(resume.encrypted_path):
            try:
                os.remove(resume.encrypted_path)
                deleted_resume_files += 1
            except OSError:
                pass

    avatar_dir = os.path.join(settings.UPLOAD_DIR, "avatars")
    if os.path.isdir(avatar_dir):
        for filename in os.listdir(avatar_dir):
            if filename.startswith(f"{current_user.id}."):
                try:
                    os.remove(os.path.join(avatar_dir, filename))
                except OSError:
                    pass

    await create_audit_log(
        db=db,
        action="user.delete_account",
        user_id=str(current_user.id),
        resource="user",
        resource_id=str(current_user.id),
        details={
            "email": current_user.email,
            "role": current_user.role.value,
            "deleted_resume_files": deleted_resume_files,
        },
        ip_address=get_client_ip(request),
    )

    await db.delete(current_user)
    _clear_auth_cookies(response, request)
    return {"message": "Your account has been permanently deleted."}
