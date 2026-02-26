"""
VajraKavach — Auth Routes
Registration, login, TOTP setup & verification, token refresh, password change.
"""

import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User, UserProfile, UserRole
from app.schemas.auth import (
    RegisterRequest, LoginRequest, TOTPVerifyRequest,
    TokenResponse, TOTPSetupResponse, RefreshTokenRequest,
    PasswordChangeRequest, SetupVerifyRequest, ForgotPasswordRequest,
)
from app.schemas.user import UserResponse
from app.services.auth_service import (
    hash_password, verify_password, create_access_token,
    create_refresh_token, decode_token,
)
from app.services.totp_service import (
    generate_totp_secret, get_totp_uri, generate_qr_code_base64, verify_totp,
)
from app.services.pki_service import generate_rsa_key_pair
from app.services.audit_service import create_audit_log
from app.dependencies import get_current_user_pre_totp, get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", response_model=TOTPSetupResponse, status_code=status.HTTP_201_CREATED)
async def register(
    req: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Register a new user. Returns TOTP setup QR code."""
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    role = UserRole.USER
    if req.role == "recruiter":
        role = UserRole.RECRUITER
    elif req.role == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin accounts cannot be created through public registration.",
        )

    hashed_pw = hash_password(req.password)
    totp_secret = generate_totp_secret()
    private_key_pem, public_key_pem = generate_rsa_key_pair()

    user = User(
        id=uuid.uuid4(),
        email=req.email,
        hashed_password=hashed_pw,
        full_name=req.full_name,
        phone=req.phone,
        role=role,
        totp_secret=totp_secret,
        totp_verified=False,
        public_key=public_key_pem,
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
        ip_address=request.client.host if request.client else None,
    )

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
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.totp_verified:
        return {"message": "TOTP already verified"}

    if not user.totp_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="TOTP not set up")

    if not verify_totp(user.totp_secret, req.token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid TOTP token")

    user.totp_verified = True
    await db.flush()

    await create_audit_log(
        db=db,
        action="user.totp_setup_verified",
        user_id=str(user.id),
        resource="user",
        resource_id=str(user.id),
        ip_address=request.client.host if request.client else None,
    )

    return {"message": "TOTP verified successfully! You can now log in."}


@router.post("/login", response_model=TokenResponse)
async def login(
    req: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate with email + password. Returns JWT (TOTP still required)."""
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(req.password, user.hashed_password):
        await create_audit_log(
            db=db,
            action="user.login_failed",
            details={"email": req.email},
            ip_address=request.client.host if request.client else None,
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    if not user.is_active or user.is_suspended:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is suspended or deactivated")

    token_data = {"sub": str(user.id), "email": user.email, "role": user.role.value, "totp_verified": False}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    await create_audit_log(
        db=db,
        action="user.login",
        user_id=str(user.id),
        resource="user",
        resource_id=str(user.id),
        ip_address=request.client.host if request.client else None,
    )

    user.last_login = datetime.utcnow()

    # If TOTP hasn't been verified yet (first-time setup), include QR code
    totp_setup_required = not user.totp_verified
    totp_secret = None
    qr_code_b64 = None
    if totp_setup_required and user.totp_secret:
        totp_secret = user.totp_secret
        totp_uri = get_totp_uri(user.totp_secret, user.email)
        qr_code_b64 = generate_qr_code_base64(totp_uri)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        totp_required=True,
        totp_setup_required=totp_setup_required,
        totp_secret=totp_secret,
        qr_code_base64=qr_code_b64,
    )


@router.post("/verify-totp", response_model=TokenResponse)
async def verify_totp_endpoint(
    req: TOTPVerifyRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_pre_totp),
):
    """Verify TOTP token after login. Returns new JWT with totp_verified=True."""
    if not current_user.totp_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="TOTP not set up for this account")

    if not verify_totp(current_user.totp_secret, req.token):
        await create_audit_log(
            db=db,
            action="user.totp_failed",
            user_id=str(current_user.id),
            resource="user",
            resource_id=str(current_user.id),
            ip_address=request.client.host if request.client else None,
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid TOTP token")

    if not current_user.totp_verified:
        current_user.totp_verified = True

    token_data = {
        "sub": str(current_user.id),
        "email": current_user.email,
        "role": current_user.role.value,
        "totp_verified": True,
    }
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    await create_audit_log(
        db=db,
        action="user.totp_verified",
        user_id=str(current_user.id),
        resource="user",
        resource_id=str(current_user.id),
        ip_address=request.client.host if request.client else None,
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        totp_required=False,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(req: RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    """Refresh an access token using a valid refresh token."""
    payload = decode_token(req.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    token_data = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role.value,
        "totp_verified": payload.get("totp_verified", False),
    }

    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
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
    if not verify_password(req.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")

    if not verify_totp(current_user.totp_secret, req.totp_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid TOTP token")

    current_user.hashed_password = hash_password(req.new_password)

    await create_audit_log(
        db=db,
        action="user.password_change",
        user_id=str(current_user.id),
        resource="user",
        resource_id=str(current_user.id),
        ip_address=request.client.host if request.client else None,
    )

    return {"message": "Password changed successfully"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
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
    )


@router.post("/forgot-password")
async def forgot_password(
    req: ForgotPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Reset password using email + TOTP verification (no login required)."""
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No account found with this email")

    if not user.totp_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="TOTP not configured for this account")

    if not verify_totp(user.totp_secret, req.totp_token):
        await create_audit_log(
            db=db,
            action="user.forgot_password_failed",
            user_id=str(user.id),
            details={"email": req.email, "reason": "invalid_totp"},
            ip_address=request.client.host if request.client else None,
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid TOTP token")

    user.hashed_password = hash_password(req.new_password)

    await create_audit_log(
        db=db,
        action="user.forgot_password_reset",
        user_id=str(user.id),
        resource="user",
        resource_id=str(user.id),
        ip_address=request.client.host if request.client else None,
    )

    return {"message": "Password reset successfully. You can now log in with your new password."}
