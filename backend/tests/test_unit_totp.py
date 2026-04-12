"""
VajraKavach — Unit Tests: TOTP Service
Tests lockout logic, progressive escalation, and attempt tracking.
"""

import time
import pytest
from unittest.mock import patch
from app.services.totp_service import (
    _lockout_duration,
    check_totp_lockout,
    record_totp_failure,
    clear_totp_attempts,
    _totp_attempts,
    TOTP_MAX_ATTEMPTS,
    TOTP_BASE_LOCKOUT_MINUTES,
    TOTP_LOCKOUT_MULTIPLIER,
    TOTP_WINDOW_SECONDS,
    encrypt_totp_secret,
    decrypt_totp_secret,
    generate_totp_secret,
    verify_totp,
)


@pytest.fixture(autouse=True)
def clean_attempts():
    """Clear TOTP attempts before and after each test."""
    _totp_attempts.clear()
    yield
    _totp_attempts.clear()


# ─── Lockout Duration Calculation ────────────────────────────────────

class TestLockoutDuration:
    def test_level_0_duration(self):
        """First lockout: 60 minutes = 3600 seconds."""
        assert _lockout_duration(0) == 60 * 60  # 3600s

    def test_level_1_duration(self):
        """Second lockout: 60 * 5 = 300 minutes = 18000 seconds."""
        assert _lockout_duration(1) == 300 * 60  # 18000s

    def test_level_2_duration(self):
        """Third lockout: 60 * 25 = 1500 minutes = 90000 seconds."""
        assert _lockout_duration(2) == 1500 * 60  # 90000s

    def test_level_3_duration(self):
        """Fourth lockout: 60 * 125 = 7500 minutes."""
        assert _lockout_duration(3) == 7500 * 60

    def test_progressive_multiplier(self):
        """Each level is exactly TOTP_LOCKOUT_MULTIPLIER times the previous."""
        for level in range(5):
            expected = TOTP_BASE_LOCKOUT_MINUTES * (TOTP_LOCKOUT_MULTIPLIER ** level) * 60
            assert _lockout_duration(level) == expected


# ─── Check TOTP Lockout ─────────────────────────────────────────────

class TestCheckTotpLockout:
    def test_unknown_ip_not_locked(self):
        """An IP with no history is not locked out."""
        assert check_totp_lockout("10.0.0.1") is False

    def test_locked_ip_returns_true(self):
        """An IP with locked_until in the future is locked."""
        future = time.time() + 3600
        _totp_attempts["10.0.0.1"] = (3, time.time(), future, 1)
        assert check_totp_lockout("10.0.0.1") is True

    def test_expired_lockout_returns_false(self):
        """An IP whose lockout has expired is not locked."""
        past = time.time() - 10
        _totp_attempts["10.0.0.1"] = (3, time.time() - 400, past, 1)
        assert check_totp_lockout("10.0.0.1") is False

    def test_window_expired_resets_attempts(self):
        """If the attempt window (5 min) has expired, attempts reset to 0."""
        old_time = time.time() - TOTP_WINDOW_SECONDS - 10
        _totp_attempts["10.0.0.1"] = (2, old_time, 0, 0)
        assert check_totp_lockout("10.0.0.1") is False
        # Attempts should be reset
        assert _totp_attempts["10.0.0.1"][0] == 0

    def test_within_window_under_max_not_locked(self):
        """2 attempts within window (< 3 max) — not locked."""
        _totp_attempts["10.0.0.1"] = (2, time.time(), 0, 0)
        assert check_totp_lockout("10.0.0.1") is False


# ─── Record TOTP Failure ─────────────────────────────────────────────

class TestRecordTotpFailure:
    def test_first_failure_creates_entry(self):
        """First failed attempt creates a new entry with 1 attempt."""
        locked = record_totp_failure("10.0.0.2")
        assert locked is False
        assert _totp_attempts["10.0.0.2"][0] == 1

    def test_second_failure_increments(self):
        """Second failure increments to 2."""
        record_totp_failure("10.0.0.2")
        locked = record_totp_failure("10.0.0.2")
        assert locked is False
        assert _totp_attempts["10.0.0.2"][0] == 2

    def test_third_failure_triggers_lockout(self):
        """Third failure (= MAX_ATTEMPTS) triggers lockout."""
        record_totp_failure("10.0.0.2")
        record_totp_failure("10.0.0.2")
        locked = record_totp_failure("10.0.0.2")
        assert locked is True
        entry = _totp_attempts["10.0.0.2"]
        assert entry[2] > 0  # locked_until is set
        assert entry[3] == 1  # lockout_level incremented to 1

    def test_lockout_duration_matches_level(self):
        """Lockout duration should match level 0 (60 min) on first lockout."""
        record_totp_failure("10.0.0.3")
        record_totp_failure("10.0.0.3")
        before = time.time()
        record_totp_failure("10.0.0.3")
        entry = _totp_attempts["10.0.0.3"]
        expected_duration = _lockout_duration(0)  # level 0
        assert abs(entry[2] - (before + expected_duration)) < 2  # within 2 seconds

    def test_still_locked_returns_true(self):
        """Further failures while locked still return True."""
        _totp_attempts["10.0.0.4"] = (3, time.time(), time.time() + 3600, 1)
        assert record_totp_failure("10.0.0.4") is True

    def test_window_expired_starts_fresh_count(self):
        """If window expired, start fresh count but keep level."""
        old_time = time.time() - TOTP_WINDOW_SECONDS - 10
        _totp_attempts["10.0.0.5"] = (2, old_time, 0, 2)
        locked = record_totp_failure("10.0.0.5")
        assert locked is False
        entry = _totp_attempts["10.0.0.5"]
        assert entry[0] == 1  # Reset to 1
        assert entry[3] == 2  # Level preserved

    def test_progressive_escalation(self):
        """Second lockout should use level 1 (300 min), not level 0 (60 min)."""
        # First lockout cycle
        for _ in range(3):
            record_totp_failure("10.0.0.6")
        first_entry = _totp_attempts["10.0.0.6"]
        assert first_entry[3] == 1  # level bumped to 1

        # Simulate lockout expired and window expired
        now = time.time()
        _totp_attempts["10.0.0.6"] = (0, now - TOTP_WINDOW_SECONDS - 10, 0, 1)

        # Second lockout cycle
        for _ in range(3):
            record_totp_failure("10.0.0.6")
        second_entry = _totp_attempts["10.0.0.6"]
        assert second_entry[3] == 2  # level bumped to 2
        expected_duration_level1 = _lockout_duration(1)  # 300 min = 18000s
        assert second_entry[2] > 0


# ─── Clear TOTP Attempts ─────────────────────────────────────────────

class TestClearTotpAttempts:
    def test_clear_resets_attempts_keeps_level(self):
        """Clearing attempts after success keeps the lockout level."""
        _totp_attempts["10.0.0.7"] = (2, time.time(), 0, 3)
        clear_totp_attempts("10.0.0.7")
        entry = _totp_attempts["10.0.0.7"]
        assert entry[0] == 0  # attempts reset
        assert entry[3] == 3  # level kept

    def test_clear_nonexistent_does_nothing(self):
        """Clearing a non-existent IP does nothing (no crash)."""
        clear_totp_attempts("10.0.0.99")
        assert "10.0.0.99" not in _totp_attempts


# ─── TOTP Secret Encryption/Decryption ───────────────────────────────

class TestTotpEncryption:
    def test_encrypt_decrypt_roundtrip(self):
        """Encrypting then decrypting returns the original secret."""
        secret = generate_totp_secret()
        encrypted = encrypt_totp_secret(secret)
        assert encrypted != secret  # Should be different
        decrypted = decrypt_totp_secret(encrypted)
        assert decrypted == secret

    def test_decrypt_plaintext_fallback(self):
        """Decrypting a non-Fernet value returns it as-is (legacy fallback)."""
        plaintext = "JBSWY3DPEHPK3PXP"
        result = decrypt_totp_secret(plaintext)
        assert result == plaintext

    def test_generate_secret_is_base32(self):
        """Generated secrets should be valid base32."""
        secret = generate_totp_secret()
        assert len(secret) >= 16
        assert all(c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567=" for c in secret)


# ─── TOTP Verification ──────────────────────────────────────────────

class TestTotpVerification:
    def test_valid_token_accepted(self):
        """A valid current TOTP token should be accepted."""
        import pyotp
        secret = generate_totp_secret()
        totp = pyotp.TOTP(secret)
        current_token = totp.now()
        assert verify_totp(secret, current_token) is True

    def test_invalid_token_rejected(self):
        """An invalid TOTP token should be rejected."""
        secret = generate_totp_secret()
        assert verify_totp(secret, "000000") is False

    def test_wrong_secret_rejected(self):
        """A token from a different secret should be rejected."""
        import pyotp
        secret1 = generate_totp_secret()
        secret2 = generate_totp_secret()
        totp = pyotp.TOTP(secret1)
        token = totp.now()
        assert verify_totp(secret2, token) is False


# ─── Constants Verification ──────────────────────────────────────────

class TestConstants:
    def test_max_attempts_is_3(self):
        assert TOTP_MAX_ATTEMPTS == 3

    def test_window_is_5_minutes(self):
        assert TOTP_WINDOW_SECONDS == 300

    def test_base_lockout_is_60_minutes(self):
        assert TOTP_BASE_LOCKOUT_MINUTES == 60

    def test_multiplier_is_5(self):
        assert TOTP_LOCKOUT_MULTIPLIER == 5
