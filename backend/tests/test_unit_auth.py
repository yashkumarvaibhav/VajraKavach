"""
VajraKavach — Unit Tests: Auth Service
Tests JWT creation/validation, password hashing, and token revocation.
"""

import time
import pytest
from datetime import timedelta
from app.services.auth_service import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    revoke_token,
    is_token_revoked,
    _revoked_cache,
    _hash_token,
)
from app.config import settings


@pytest.fixture(autouse=True)
def clean_revoked():
    """Clear revoked cache before each test."""
    _revoked_cache.clear()
    yield
    _revoked_cache.clear()


# ─── Password Hashing (Argon2id) ─────────────────────────────────────

class TestPasswordHashing:
    def test_hash_password_produces_argon2(self):
        """Hashed password should use Argon2 format."""
        hashed = hash_password("TestPassword@123")
        assert hashed.startswith("$argon2")

    def test_verify_correct_password(self):
        """Correct password should verify successfully."""
        hashed = hash_password("SecurePass#99")
        assert verify_password("SecurePass#99", hashed) is True

    def test_verify_wrong_password(self):
        """Wrong password should fail verification."""
        hashed = hash_password("SecurePass#99")
        assert verify_password("WrongPass#99", hashed) is False

    def test_different_hashes_for_same_password(self):
        """Same password should produce different hashes (salted)."""
        h1 = hash_password("SamePass@1")
        h2 = hash_password("SamePass@1")
        assert h1 != h2  # Different salts

    def test_empty_password_still_hashes(self):
        """Even empty string should hash (validation is at schema level)."""
        hashed = hash_password("")
        assert hashed.startswith("$argon2")


# ─── JWT Token Creation ──────────────────────────────────────────────

class TestJWTCreation:
    def test_access_token_has_correct_type(self):
        """Access token should have type='access' in payload."""
        token = create_access_token({"sub": "user-123", "email": "test@test.com"})
        payload = decode_token(token)
        assert payload is not None
        assert payload["type"] == "access"

    def test_access_token_has_expiry(self):
        """Access token should have 'exp' claim."""
        token = create_access_token({"sub": "user-123"})
        payload = decode_token(token)
        assert "exp" in payload
        assert payload["exp"] > time.time()

    def test_access_token_custom_expiry(self):
        """Access token with custom expiry should use that delta."""
        token = create_access_token(
            {"sub": "user-123"},
            expires_delta=timedelta(minutes=5),
        )
        payload = decode_token(token)
        # Should expire within ~5 minutes
        assert payload["exp"] - payload["iat"] <= 301

    def test_refresh_token_has_correct_type(self):
        """Refresh token should have type='refresh'."""
        token = create_refresh_token({"sub": "user-123"})
        payload = decode_token(token)
        assert payload["type"] == "refresh"

    def test_refresh_token_long_expiry(self):
        """Refresh token should have longer expiry than access token."""
        access = create_access_token({"sub": "user-123"})
        refresh = create_refresh_token({"sub": "user-123"})
        a_payload = decode_token(access)
        r_payload = decode_token(refresh)
        assert r_payload["exp"] > a_payload["exp"]

    def test_token_preserves_claims(self):
        """Custom claims should be preserved in the token."""
        token = create_access_token({
            "sub": "user-456",
            "email": "test@iiitd.ac.in",
            "role": "user",
            "totp_verified": True,
            "ip": "192.168.1.1",
        })
        payload = decode_token(token)
        assert payload["sub"] == "user-456"
        assert payload["email"] == "test@iiitd.ac.in"
        assert payload["role"] == "user"
        assert payload["totp_verified"] is True
        assert payload["ip"] == "192.168.1.1"


# ─── JWT Token Validation ────────────────────────────────────────────

class TestJWTValidation:
    def test_tampered_token_rejected(self):
        """A tampered JWT should return None."""
        token = create_access_token({"sub": "user-123"})
        tampered = token[:-5] + "XXXXX"
        assert decode_token(tampered) is None

    def test_expired_token_rejected(self):
        """An expired token should return None."""
        token = create_access_token(
            {"sub": "user-123"},
            expires_delta=timedelta(seconds=-1),
        )
        assert decode_token(token) is None

    def test_garbage_token_rejected(self):
        """Random garbage string should return None."""
        assert decode_token("not.a.jwt") is None
        assert decode_token("") is None
        assert decode_token("eyJhbGciOiJIUzI1NiJ9.fake.payload") is None

    def test_valid_token_decoded(self):
        """A valid token should decode successfully."""
        token = create_access_token({"sub": "user-123"})
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "user-123"


# ─── Token Revocation ────────────────────────────────────────────────

class TestTokenRevocation:
    def test_revoked_token_is_detected(self):
        """A revoked token should be detected as revoked."""
        token = create_access_token({"sub": "user-123"})
        revoke_token(token)
        assert is_token_revoked(token) is True

    def test_unrevoked_token_not_detected(self):
        """A non-revoked token should not be detected as revoked."""
        token = create_access_token({"sub": "user-123"})
        assert is_token_revoked(token) is False

    def test_revoked_token_decode_returns_none(self):
        """decode_token should return None for revoked tokens."""
        token = create_access_token({"sub": "user-123"})
        revoke_token(token)
        assert decode_token(token) is None

    def test_different_tokens_independent(self):
        """Revoking one token should not affect another."""
        t1 = create_access_token({"sub": "user-1"})
        t2 = create_access_token({"sub": "user-2"})
        revoke_token(t1)
        assert is_token_revoked(t1) is True
        assert is_token_revoked(t2) is False


# ─── Token Hash ──────────────────────────────────────────────────────

class TestTokenHash:
    def test_hash_is_sha256(self):
        """Token hash should be 64 hex characters (SHA-256)."""
        h = _hash_token("some-token-string")
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)

    def test_same_input_same_hash(self):
        """Same token should produce the same hash."""
        assert _hash_token("token-abc") == _hash_token("token-abc")

    def test_different_input_different_hash(self):
        """Different tokens should produce different hashes."""
        assert _hash_token("token-1") != _hash_token("token-2")
