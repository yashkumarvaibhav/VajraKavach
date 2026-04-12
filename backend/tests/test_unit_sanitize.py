"""
VajraKavach — Unit Tests: Input Sanitization
Tests escape_like and Pydantic schema validation.
"""

import pytest
from app.utils.sanitize import escape_like


# ─── escape_like ─────────────────────────────────────────────────────

class TestEscapeLike:
    def test_no_wildcards(self):
        """Normal input without wildcards should pass through unchanged."""
        assert escape_like("hello world") == "hello world"

    def test_escape_percent(self):
        """% wildcard should be escaped."""
        assert escape_like("50%") == "50\\%"

    def test_escape_underscore(self):
        """_ wildcard should be escaped."""
        assert escape_like("user_name") == "user\\_name"

    def test_escape_both(self):
        """Both % and _ should be escaped."""
        assert escape_like("100%_done") == "100\\%\\_done"

    def test_multiple_occurrences(self):
        """Multiple wildcards should all be escaped."""
        assert escape_like("%%__") == "\\%\\%\\_\\_"

    def test_empty_string(self):
        """Empty string should remain empty."""
        assert escape_like("") == ""

    def test_sql_injection_attempt(self):
        """SQL injection attempt should be escaped (wildcards only)."""
        assert escape_like("'; DROP TABLE users; --") == "'; DROP TABLE users; --"

    def test_xss_payload_passthrough(self):
        """XSS payloads pass through escape_like (it only escapes LIKE wildcards)."""
        assert escape_like("<script>alert(1)</script>") == "<script>alert(1)</script>"


# ─── Password Validation (Schema Level) ─────────────────────────────

class TestPasswordValidation:
    def test_valid_password(self):
        """A strong password should validate successfully."""
        from app.schemas.auth import validate_strong_password
        result = validate_strong_password("GraduateAlgo@1198")
        assert result == "GraduateAlgo@1198"

    def test_too_short(self):
        """Password shorter than 8 chars should fail."""
        from app.schemas.auth import validate_strong_password
        with pytest.raises(ValueError, match="at least 8 characters"):
            validate_strong_password("Ab1@xyz")

    def test_too_long(self):
        """Password longer than 72 chars should fail."""
        from app.schemas.auth import validate_strong_password
        with pytest.raises(ValueError, match="at most 72 characters"):
            validate_strong_password("A" * 73)

    def test_no_uppercase(self):
        """Password without uppercase should fail."""
        from app.schemas.auth import validate_strong_password
        with pytest.raises(ValueError, match="uppercase"):
            validate_strong_password("lowercase@123")

    def test_no_lowercase(self):
        """Password without lowercase should fail."""
        from app.schemas.auth import validate_strong_password
        with pytest.raises(ValueError, match="lowercase"):
            validate_strong_password("UPPERCASE@123")

    def test_no_digit(self):
        """Password without digit should fail."""
        from app.schemas.auth import validate_strong_password
        with pytest.raises(ValueError, match="digit"):
            validate_strong_password("NoDigits@Here")

    def test_no_special(self):
        """Password without special character should fail."""
        from app.schemas.auth import validate_strong_password
        with pytest.raises(ValueError, match="special"):
            validate_strong_password("NoSpecial123")


# ─── Phone Validation ────────────────────────────────────────────────

class TestPhoneValidation:
    def test_valid_phone(self):
        """Valid Indian phone number should pass."""
        from app.schemas.auth import RegisterRequest
        # We test the validator directly via partial model
        from pydantic import ValidationError
        # Valid phone with country code
        try:
            req = RegisterRequest(
                email="test@test.com",
                password="TestPass@123",
                full_name="Test User",
                phone="+919876543210",
                public_key="A" * 64,
            )
            assert req.phone == "+919876543210"
        except ValidationError:
            pytest.fail("Valid phone should not raise ValidationError")

    def test_phone_with_spaces(self):
        """Phone with spaces should be cleaned."""
        from app.schemas.auth import RegisterRequest
        req = RegisterRequest(
            email="test@test.com",
            password="TestPass@123",
            full_name="Test User",
            phone="+91 987 654 3210",
            public_key="A" * 64,
        )
        assert req.phone == "+919876543210"

    def test_phone_without_country_code_fails(self):
        """Phone without country code should fail."""
        from app.schemas.auth import RegisterRequest
        from pydantic import ValidationError
        with pytest.raises(ValidationError, match="country code"):
            RegisterRequest(
                email="test@test.com",
                password="TestPass@123",
                full_name="Test User",
                phone="9876543210",
                public_key="A" * 64,
            )

    def test_null_phone_allowed(self):
        """Null/None phone should be allowed."""
        from app.schemas.auth import RegisterRequest
        req = RegisterRequest(
            email="test@test.com",
            password="TestPass@123",
            full_name="Test User",
            phone=None,
            public_key="A" * 64,
        )
        assert req.phone is None
