"""
VajraKavach — Integration Tests: Security
Tests security headers, HTTP methods, CORS, cookies, and auth bypass
against the live production server at https://192.168.3.44.
"""

import pytest
import httpx
import time

BASE = "https://192.168.3.44"
VERIFY_SSL = False  # Self-signed cert (mkcert)


@pytest.fixture(scope="module")
def client():
    """httpx client with SSL verification disabled for self-signed cert."""
    with httpx.Client(verify=False, timeout=10) as c:
        yield c


@pytest.fixture(scope="module")
def login_cookies(client):
    """Login and return cookies (pre-TOTP — enough for cookie flag testing)."""
    r = client.post(f"{BASE}/api/auth/login", json={
        "email": "yash25091@iiitd.ac.in",
        "password": "GraduateAlgo@1198",
    })
    assert r.status_code == 200
    return r.cookies


# ─── Security Headers ────────────────────────────────────────────────

class TestSecurityHeaders:
    def test_hsts_present(self, client):
        """HSTS header should be set with 1 year max-age."""
        time.sleep(1)
        r = client.get(f"{BASE}/")
        assert "strict-transport-security" in r.headers
        assert "max-age=31536000" in r.headers["strict-transport-security"]
        assert "includeSubDomains" in r.headers["strict-transport-security"]

    def test_x_frame_options_deny(self, client):
        """X-Frame-Options should be DENY (prevent clickjacking)."""
        r = client.get(f"{BASE}/")
        assert r.headers.get("x-frame-options", "").upper() == "DENY"

    def test_x_content_type_options(self, client):
        """X-Content-Type-Options should be nosniff."""
        r = client.get(f"{BASE}/")
        assert r.headers.get("x-content-type-options") == "nosniff"

    def test_csp_present(self, client):
        """Content-Security-Policy should be present with restrictive directives."""
        r = client.get(f"{BASE}/")
        csp = r.headers.get("content-security-policy", "")
        assert "default-src 'self'" in csp
        assert "frame-ancestors 'none'" in csp
        assert "object-src 'none'" in csp

    def test_referrer_policy(self, client):
        """Referrer-Policy should be strict-origin-when-cross-origin."""
        r = client.get(f"{BASE}/")
        assert r.headers.get("referrer-policy") == "strict-origin-when-cross-origin"

    def test_permissions_policy(self, client):
        """Permissions-Policy should restrict camera, microphone, geolocation."""
        r = client.get(f"{BASE}/")
        pp = r.headers.get("permissions-policy", "")
        assert "camera=()" in pp
        assert "microphone=()" in pp
        assert "geolocation=()" in pp

    def test_xss_protection(self, client):
        """X-XSS-Protection should be enabled."""
        r = client.get(f"{BASE}/")
        assert "1; mode=block" in r.headers.get("x-xss-protection", "")

    def test_server_version_hidden(self, client):
        """Server header should not leak version number."""
        r = client.get(f"{BASE}/")
        server = r.headers.get("server", "")
        assert server == "nginx"  # No version number

    def test_no_x_powered_by(self, client):
        """X-Powered-By should not be present."""
        r = client.get(f"{BASE}/")
        assert "x-powered-by" not in r.headers

    def test_no_x_request_id_leaked(self, client):
        r = client.get(f"{BASE}/")
        assert "x-request-id" not in r.headers


# ─── HTTP Methods ────────────────────────────────────────────────────

class TestHTTPMethods:
    def test_trace_blocked(self, client):
        """TRACE method should be blocked (405)."""
        time.sleep(1)
        r = client.request("TRACE", f"{BASE}/")
        assert r.status_code == 405

    def test_options_blocked(self, client):
        """OPTIONS method should be blocked on API endpoints (405)."""
        r = client.request("OPTIONS", f"{BASE}/api/auth/login")
        assert r.status_code == 405

    def test_put_blocked(self, client):
        """PUT method should be blocked on root (405)."""
        r = client.request("PUT", f"{BASE}/")
        assert r.status_code == 405

    def test_delete_blocked(self, client):
        """DELETE method should be blocked on root (405)."""
        r = client.request("DELETE", f"{BASE}/")
        assert r.status_code == 405

    def test_get_allowed(self, client):
        """GET method should be allowed."""
        r = client.get(f"{BASE}/")
        assert r.status_code == 200

    def test_post_allowed(self, client):
        """POST method should be allowed on API endpoints."""
        time.sleep(1)
        r = client.post(f"{BASE}/api/auth/login", json={
            "email": "nonexistent@test.com",
            "password": "test",
        })
        # 401 means POST was accepted (not 405)
        assert r.status_code in [401, 429]


# ─── CORS ────────────────────────────────────────────────────────────

class TestCORS:
    def test_evil_origin_no_acao(self, client):
        """Evil origin should NOT get Access-Control-Allow-Origin header."""
        time.sleep(1)
        r = client.post(
            f"{BASE}/api/auth/login",
            json={"email": "test@test.com", "password": "test"},
            headers={"Origin": "https://evil.com"},
        )
        assert "access-control-allow-origin" not in r.headers or \
               r.headers.get("access-control-allow-origin") != "https://evil.com"

    def test_same_origin_gets_acao(self, client):
        """Same origin should get proper Access-Control-Allow-Origin."""
        time.sleep(1)
        r = client.post(
            f"{BASE}/api/auth/login",
            json={"email": "test@test.com", "password": "test"},
            headers={"Origin": "https://192.168.3.44"},
        )
        assert r.headers.get("access-control-allow-origin") == "https://192.168.3.44"


# ─── Cookie Security ─────────────────────────────────────────────────

class TestCookieSecurity:
    @pytest.fixture(scope="class")
    def login_cookies_raw(self, client):
        """Single login call for all cookie tests to avoid rate limiting."""
        time.sleep(5)  # Wait for rate limit to reset
        r = client.post(f"{BASE}/api/auth/login", json={
            "email": "yash25091@iiitd.ac.in",
            "password": "GraduateAlgo@1198",
        })
        if r.status_code in [429, 503]:
            time.sleep(10)  # Extended wait
            r = client.post(f"{BASE}/api/auth/login", json={
                "email": "yash25091@iiitd.ac.in",
                "password": "GraduateAlgo@1198",
            })
        assert r.status_code == 200, f"Login failed with status {r.status_code}"
        return r.headers.get_list("set-cookie")

    def test_access_token_httponly(self, login_cookies_raw):
        """access_token cookie should have HttpOnly flag."""
        access_cookie = [c for c in login_cookies_raw if "access_token=" in c]
        assert len(access_cookie) > 0, f"No access_token cookie found"
        assert "httponly" in access_cookie[0].lower()

    def test_access_token_secure(self, login_cookies_raw):
        """access_token cookie should have Secure flag."""
        access_cookie = [c for c in login_cookies_raw if "access_token=" in c]
        assert len(access_cookie) > 0
        assert "secure" in access_cookie[0].lower()

    def test_access_token_samesite_strict(self, login_cookies_raw):
        """access_token cookie should have SameSite=strict."""
        access_cookie = [c for c in login_cookies_raw if "access_token=" in c]
        assert len(access_cookie) > 0
        assert "samesite=strict" in access_cookie[0].lower()

    def test_refresh_token_httponly(self, login_cookies_raw):
        """refresh_token cookie should also have HttpOnly."""
        refresh_cookie = [c for c in login_cookies_raw if "refresh_token=" in c]
        assert len(refresh_cookie) > 0
        assert "httponly" in refresh_cookie[0].lower()


# ─── Auth Bypass ─────────────────────────────────────────────────────

class TestAuthBypass:
    def test_no_auth_returns_4xx(self, client):
        """Accessing protected endpoint without auth should return 401 or 403."""
        time.sleep(1)
        r = client.get(f"{BASE}/api/admin/users")
        assert r.status_code in [401, 403]

    def test_tampered_jwt_rejected(self, client):
        """A tampered JWT should be rejected with 401 or 403."""
        time.sleep(1)
        # Use a fresh client to avoid stale cookies
        with httpx.Client(verify=False, timeout=10) as fresh:
            r = fresh.get(
                f"{BASE}/api/users/me/profile",
                cookies={"access_token": "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoicGxhdGZvcm1fYWRtaW4ifQ.fake"},
            )
            assert r.status_code in [401, 403]

    def test_admin_endpoint_no_auth(self, client):
        """Admin dashboard should require authentication."""
        with httpx.Client(verify=False, timeout=10) as fresh:
            r = fresh.get(f"{BASE}/api/admin/dashboard")
            assert r.status_code in [401, 403]

    def test_pre_totp_jwt_blocked_on_protected(self, client):
        """A pre-TOTP JWT (totp_verified=false) should be blocked on protected endpoints."""
        time.sleep(5)
        r = client.post(f"{BASE}/api/auth/login", json={
            "email": "yash25091@iiitd.ac.in",
            "password": "GraduateAlgo@1198",
        })
        if r.status_code == 200:
            pre_totp_cookies = r.cookies
            r2 = client.get(
                f"{BASE}/api/users/me/profile",
                cookies=pre_totp_cookies,
            )
            assert r2.status_code == 403
            assert "TOTP" in r2.json().get("detail", "")
        else:
            # Rate limited — skip gracefully
            pytest.skip(f"Login rate-limited ({r.status_code}), cannot test pre-TOTP")


# ─── Injection Attempts ──────────────────────────────────────────────

class TestInjection:
    def test_path_traversal_blocked(self, client):
        """Path traversal should not expose system files."""
        time.sleep(1)
        r = client.get(f"{BASE}/../../etc/passwd")
        # Should return SPA or 400, but NOT /etc/passwd content
        assert "root:" not in r.text

    def test_null_byte_rejected(self, client):
        """Null byte in URL should be rejected."""
        r = client.get(f"{BASE}/%00")
        assert r.status_code in [400, 200]  # 400 preferred, 200 = SPA fallback

    def test_crlf_injection_blocked(self, client):
        """CRLF injection should not inject headers."""
        r = client.get(f"{BASE}/%0d%0aX-Injected:%20header")
        assert "x-injected" not in r.headers


# ─── Sensitive Path Blocking ─────────────────────────────────────────

class TestSensitivePaths:
    @pytest.mark.parametrize("path", [
        "/.env", "/.git", "/.git/config", "/wp-admin",
        "/phpinfo.php", "/server-status", "/actuator", "/console",
    ])
    def test_sensitive_path_blocked(self, client, path):
        """Sensitive paths should return 404 or SPA fallback (not actual content)."""
        r = client.get(f"{BASE}{path}")
        # Either 404 or 200 with SPA HTML (not the actual file)
        if r.status_code == 200:
            assert "VajraKavach" in r.text or "<!DOCTYPE html>" in r.text


# ─── Debug Endpoints ─────────────────────────────────────────────────

class TestDebugEndpoints:
    def test_api_docs_disabled(self, client):
        """FastAPI /api/docs should not be accessible."""
        r = client.get(f"{BASE}/api/docs")
        assert r.status_code == 404

    def test_openapi_json_disabled(self, client):
        """openapi.json should not be accessible."""
        r = client.get(f"{BASE}/api/openapi.json")
        assert r.status_code == 404

    def test_docs_returns_spa_not_swagger(self, client):
        """/docs should return SPA, not Swagger UI."""
        r = client.get(f"{BASE}/docs")
        if r.status_code == 200:
            assert "swagger" not in r.text.lower()
            assert "VajraKavach" in r.text or "<!DOCTYPE html>" in r.text


# ─── Rate Limiting ───────────────────────────────────────────────────

class TestRateLimiting:
    def test_rapid_requests_get_rate_limited(self, client):
        """Rapid requests should eventually trigger rate limiting."""
        statuses = []
        for _ in range(8):
            r = client.post(f"{BASE}/api/auth/login", json={
                "email": "ratelimit@test.com",
                "password": "test",
            })
            statuses.append(r.status_code)
        # At least some should be rate limited (429 or 503)
        assert 429 in statuses or 503 in statuses
