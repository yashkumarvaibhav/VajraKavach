"""
VajraKavach — TOTP Service
Generates TOTP secrets and QR codes, verifies TOTP tokens.
Uses pyotp (RFC 6238).
"""

import pyotp
import qrcode
import io
import base64
import logging
import time
from cryptography.fernet import Fernet, InvalidToken
from app.config import settings

logger = logging.getLogger(__name__)

_fernet = None

# ── Per-account TOTP attempt tracking (brute-force protection) ──────
# Key: user identifier (email or user_id), Value: (attempts, first_attempt_time, locked_until)
_totp_attempts: dict[str, tuple[int, float, float]] = {}
TOTP_MAX_ATTEMPTS = 5       # Max failed TOTP attempts before lockout
TOTP_WINDOW_SECONDS = 300   # 5-minute sliding window for attempt counting
TOTP_LOCKOUT_SECONDS = 900  # 15-minute lockout after max attempts


def check_totp_lockout(identifier: str) -> bool:
    """Check if an account is locked out from TOTP attempts. Returns True if locked."""
    entry = _totp_attempts.get(identifier)
    if not entry:
        return False
    attempts, first_time, locked_until = entry
    now = time.time()
    if locked_until and now < locked_until:
        return True
    # Window expired — reset
    if now - first_time > TOTP_WINDOW_SECONDS:
        _totp_attempts.pop(identifier, None)
        return False
    return False


def record_totp_failure(identifier: str) -> bool:
    """Record a failed TOTP attempt. Returns True if account is now locked out."""
    now = time.time()
    entry = _totp_attempts.get(identifier)
    if entry:
        attempts, first_time, locked_until = entry
        # If still locked, extend lockout
        if locked_until and now < locked_until:
            return True
        # Window expired — start fresh
        if now - first_time > TOTP_WINDOW_SECONDS:
            _totp_attempts[identifier] = (1, now, 0)
            return False
        attempts += 1
        if attempts >= TOTP_MAX_ATTEMPTS:
            _totp_attempts[identifier] = (attempts, first_time, now + TOTP_LOCKOUT_SECONDS)
            return True
        _totp_attempts[identifier] = (attempts, first_time, 0)
        return False
    else:
        _totp_attempts[identifier] = (1, now, 0)
        return False


def clear_totp_attempts(identifier: str):
    """Clear attempt counter on successful TOTP verification."""
    _totp_attempts.pop(identifier, None)

def _get_fernet():
    global _fernet
    if _fernet is None and settings.FERNET_SECRET_KEY:
        _fernet = Fernet(settings.FERNET_SECRET_KEY.encode() if isinstance(settings.FERNET_SECRET_KEY, str) else settings.FERNET_SECRET_KEY)
    return _fernet


def encrypt_totp_secret(plaintext_secret: str) -> str:
    """Encrypt a TOTP secret with Fernet. Returns base64 ciphertext."""
    f = _get_fernet()
    if f is None:
        return plaintext_secret
    return f.encrypt(plaintext_secret.encode()).decode()


def decrypt_totp_secret(stored_secret: str) -> str:
    """Decrypt a Fernet-encrypted TOTP secret. Falls back to plaintext for legacy values."""
    f = _get_fernet()
    if f is None:
        return stored_secret
    try:
        return f.decrypt(stored_secret.encode()).decode()
    except (InvalidToken, Exception):
        # Legacy plaintext secret — return as-is
        return stored_secret


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
