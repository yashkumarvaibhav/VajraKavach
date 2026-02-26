"""
VajraKavach — Auth Schemas
"""

import re
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional


def validate_strong_password(password: str) -> str:
    """Enforce strong password: 8-16 chars, upper+lower+digit+special."""
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters")
    if len(password) > 16:
        raise ValueError("Password must be at most 16 characters")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r"[a-z]", password):
        raise ValueError("Password must contain at least one lowercase letter")
    if not re.search(r"\d", password):
        raise ValueError("Password must contain at least one digit")
    if not re.search(r'[!@#$%^&*()_+\-=\[\]{};:\'\"\\|,.<>\/?]', password):
        raise ValueError("Password must contain at least one special character")
    return password


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=16)
    full_name: str = Field(..., min_length=1, max_length=255)
    phone: Optional[str] = None
    role: Optional[str] = "user"  # user, recruiter

    @field_validator("password")
    @classmethod
    def check_password_strength(cls, v):
        return validate_strong_password(v)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v):
        if v is None or v == "":
            return v
        cleaned = re.sub(r"[\s\-]", "", v)
        if not re.match(r"^\+\d{1,3}\d{6,14}$", cleaned):
            raise ValueError("Phone must include country code (e.g., +91) followed by the number")
        return cleaned


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TOTPVerifyRequest(BaseModel):
    token: str = Field(..., min_length=6, max_length=6)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    totp_required: bool = False
    totp_setup_required: bool = False
    totp_secret: Optional[str] = None
    qr_code_base64: Optional[str] = None


class TOTPSetupResponse(BaseModel):
    totp_secret: str
    qr_code_base64: str
    message: str = "Scan the QR code with your authenticator app, then verify with a TOTP token."


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=16)
    totp_token: str = Field(..., min_length=6, max_length=6)

    @field_validator("new_password")
    @classmethod
    def check_password_strength(cls, v):
        return validate_strong_password(v)


class SetupVerifyRequest(BaseModel):
    """Verify TOTP during registration flow (before first login)."""
    email: EmailStr
    token: str = Field(..., min_length=6, max_length=6)
