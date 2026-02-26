"""
VajraKavach — Encryption Service
Symmetric encryption (Fernet / AES) for encrypting resumes and sensitive data at rest.
"""

import hashlib
from cryptography.fernet import Fernet
from app.config import settings


def _get_fernet() -> Fernet:
    """Get or create a Fernet cipher instance."""
    key = settings.FERNET_SECRET_KEY
    if not key or key.startswith("placeholder"):
        raise RuntimeError(
            "FERNET_SECRET_KEY is not configured! "
            "Set a stable Fernet key in .env (generate with: "
            "python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')"
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


_fernet = None


def get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = _get_fernet()
    return _fernet


def encrypt_data(data: bytes) -> bytes:
    """Encrypt raw bytes using Fernet (AES-128-CBC + HMAC-SHA256)."""
    return get_fernet().encrypt(data)


def decrypt_data(encrypted_data: bytes) -> bytes:
    """Decrypt Fernet-encrypted bytes."""
    return get_fernet().decrypt(encrypted_data)


def compute_sha256(data: bytes) -> str:
    """Compute SHA-256 hex digest of data (for integrity verification)."""
    return hashlib.sha256(data).hexdigest()
