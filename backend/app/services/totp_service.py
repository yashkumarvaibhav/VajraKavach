"""
VajraKavach — TOTP Service
Generates TOTP secrets and QR codes, verifies TOTP tokens.
Uses pyotp (RFC 6238).
"""

import pyotp
import qrcode
import io
import base64
from app.config import settings


def generate_totp_secret() -> str:
    """Generate a new random TOTP secret (base32)."""
    return pyotp.random_base32()


def get_totp_uri(secret: str, email: str) -> str:
    """Build the otpauth:// URI for QR code provisioning."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=email, issuer_name=settings.TOTP_ISSUER)


def generate_qr_code_base64(uri: str) -> str:
    """Generate a QR code as a base64-encoded PNG string."""
    img = qrcode.make(uri)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode("utf-8")


def verify_totp(secret: str, token: str) -> bool:
    """
    Verify a TOTP token against the secret.
    Allows a window of ±1 time step (30 seconds each) to handle clock drift.
    """
    totp = pyotp.TOTP(secret)
    return totp.verify(token, valid_window=1)
