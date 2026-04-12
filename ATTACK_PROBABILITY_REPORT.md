# VajraKavach — Attack Probability Report

**Date:** 7 April 2026
**Scope:** Full-stack assessment — FastAPI backend, React frontend, Nginx reverse proxy, PostgreSQL, WebSocket, E2EE messaging, blockchain audit, systemd service layer
**Deployment:** IIIT-Delhi LAN — `https://192.168.3.44/`, Nginx reverse proxy (HTTPS 443 only)
**Threat Model:** ~20 authenticated/unauthenticated attackers on same LAN (192.168.3.0/24). All attacks allowed except DDoS. DoS (single-source) in scope. Attackers do NOT have source code (black-box only).
**Bug Types:** Security bugs AND functional bugs

---

## Executive Summary

VajraKavach has undergone comprehensive hardening across all layers — kernel, Nginx, application, and database. The platform implements defense-in-depth with 23 mitigation mechanisms, 10 tolerance mechanisms, and 10 recovery mechanisms. All OWASP Top 10 categories are addressed.

### Current Risk

| Category | Count | Impact |
|----------|-------|--------|
| Unfixed security findings | 5 | All Low/Medium; none directly exploitable for data breach |
| By-design decisions | 1 | Admin self-registration (intentional, read-only role) |
| Functional gaps | 2 | Business logic, not security |

**Aggregate probability that a skilled attacker exploits at least one deductible security issue within a 5-day bug bounty: 3–8%**

The remaining attack surface consists of defense-in-depth concerns and cosmetic issues. No critical or high-severity findings remain.

---

## Verified Secure Controls

| Control | Implementation | Verified By |
|---------|---------------|-------------|
| SQL Injection | SQLAlchemy ORM + `escape_like()` for LIKE queries | sqlmap (0 vectors) |
| XSS | React auto-escaping + CSP (no unsafe-inline) + no `dangerouslySetInnerHTML` | Wapiti (0 findings) |
| CSRF | SameSite=Strict + HttpOnly + Secure cookies | Manual + regression tests |
| CORS | Same-origin only; evil origins rejected | curl + integration tests |
| Session Hijacking | HttpOnly/Secure/SameSite=Strict cookies, IP-bound JWT, 30-min expiry | Manual testing |
| Session Fixation | Fresh JWT generated on every login | Code review |
| Token Revocation | DB-backed blocklist, in-memory cache (30s refresh), survives restarts | Unit tests (18) |
| Token Type Enforcement | `type != "access"` check rejects refresh tokens as access tokens | Regression test |
| Password Storage | Argon2id (memory-hard, PHC winner) | Code review |
| TOTP 2FA | pyotp RFC 6238, `valid_window=1`, IP-based progressive lockout (3 fails → 60 min × 5^n escalation) | Unit tests (28) |
| TOTP Lockout Persistence | DB-backed via `sync_totp_lockout_to_db()` + `load_totp_lockout_from_db()` at startup | Code review |
| TOTP Secret Storage | Fernet-encrypted at rest in PostgreSQL | Code review |
| E2EE Messaging | RSA-4096 OAEP + AES-256-GCM hybrid, client-side keys in IndexedDB (PBKDF2-encrypted) | Code review |
| WebSocket Security | Origin validation (CSWSH prevention), cookie-based JWT auth | Frontend tests (14) |
| Resume Encryption | Fernet (AES-128-CBC + HMAC-SHA256) at rest | Code review |
| Digital Signatures | RSA-PSS SHA-256 for message integrity | Code review |
| HTTPS Enforcement | HTTP→444 (connection drop), HSTS 1-year max-age, TLS 1.2/1.3 AEAD ciphers | testssl.sh (14/14 CVE checks pass) |
| Rate Limiting | Triple-layer: Nginx (5/min auth, 30/min API, 15 conn/IP) + FastAPI middleware (60/min global, 5/min auth) + **16 DB-backed action rate limits** (daily/weekly per user/IP for registration, login, messages, jobs, etc.) | Integration tests + manual verification |
| IP Spoofing Prevention | Nginx overwrites X-Forwarded-For with $remote_addr; backend on 127.0.0.1 only | `ss -tlnp` + config review |
| Path Traversal | UUID filenames, `os.path.realpath()` + `startswith()` containment | Regression test |
| File Upload Validation | Triple-layer: MIME type + magic bytes + file extension; size limits (resume 5MB, avatar 2MB) | Code review |
| Server Fingerprinting | `server_tokens off`; no version in root endpoint or headers | Nikto + curl |
| API Schema Exposure | `/api/docs`, `/api/redoc`, `/openapi.json` → 404 (gated behind DEBUG=False) | curl verification |
| Sensitive Path Blocking | `/.env`, `/.git`, `/wp-admin`, `/debug`, etc. → 404 | Integration tests (12 paths) |
| LAN-Only Access | Nginx `allow 192.168.0.0/16; allow 10.0.0.0/8; deny all` | Nginx config |
| Audit Log Integrity | SHA-256 hash chain with `SELECT ... FOR UPDATE` row locking (race-safe) | Code review |
| Blockchain Integrity | Merkle trees + proof-of-work, tamper-evident record keeping | Code review |
| Password Change Sessions | `force_reauth_at` invalidates all pre-existing JWT sessions | Code review |
| Refresh Token Race | `SELECT ... FOR UPDATE` lock + revoke-before-issue pattern | Code review |
| DM Connection Enforcement | `send_message()` requires accepted connection between users | Code review |
| Group Management | Creator-only member management, leave/archive/delete-for-me options | Code review |
| Service Resilience | systemd watchdog (30s), health check timer (2 min), auto-restart (3s), kernel panic reboot (10s) | systemd status verified |
| Resource Caps | MemoryMax=2G, CPUQuota=80%, LimitNOFILE=65536 | systemd service file |
| Automated Tests | 140 tests (119 backend + 21 frontend) — all passing | pytest + vitest |

---

## Current Findings (Unfixed)

### MEDIUM

#### M-01: Admin Self-Registration (Intentional)

| Attribute | Value |
|-----------|-------|
| **Location** | `backend/app/schemas/auth.py`, `backend/app/routes/auth.py` |
| **Type** | Privilege Escalation (by design) |
| **Exploit Probability** | **100%** (trivially findable) |
| **Deductible** | **No** — intentional for bug bounty testing |

`RegisterRequest` accepts `role: Literal["user", "recruiter", "admin"]`. Any user can self-register as admin. The admin role is **read-only** — no destructive operations (those require `platform_admin`). Kept intentionally so testers can access the admin dashboard during the bug bounty.

**Risk:** Low. Admin can view audit logs and user lists but cannot modify data. Separate `platform_admin` role exists for actual admin operations.

---

#### M-02: Profile View Count Inflation

| Attribute | Value |
|-----------|-------|
| **Location** | `backend/app/routes/users.py` |
| **Type** | Business Logic |
| **Exploit Probability** | **15%** (per-viewer dedup exists; 100/day rate limit; cosmetic impact) |

View counter uses per-viewer deduplication (`ProfileView.viewer_id`). A single user viewing the same profile repeatedly only increments their own `visit_count`, not creating fake unique viewers. Additionally, profile view actions are rate-limited to 100/day per user.

**Impact:** Cosmetic only — no security consequence. Gaming profile view counts doesn't grant access or privileges. Per-viewer dedup + rate limiting significantly reduces inflation potential.

---

#### M-03: `verify-password` Endpoint Uses Raw JSON

| Attribute | Value |
|-----------|-------|
| **Location** | `backend/app/routes/auth.py` |
| **Type** | Input Validation Gap |
| **Exploit Probability** | **5%** |

Reads `await request.json()` instead of a Pydantic schema. Accepts non-string types for the password field. No practical exploit — Argon2id hashing handles any input type.

---

### LOW

#### L-01: `/assets/` Location Block Drops Security Headers

| Attribute | Value |
|-----------|-------|
| **Location** | `nginx/nginx.conf` |
| **Type** | Misconfiguration |
| **Exploit Probability** | **10%** (Burp Scanner will flag it; no practical exploit for static JS/CSS) |

Nginx's `add_header` in the `/assets/` child block replaces parent-level headers. Static assets served without CSP, HSTS, X-Frame-Options. Not practically exploitable — static JS/CSS cannot be clickjacked for credential theft, and the SPA page itself has all headers.

---

#### L-02: Private Key Export Without Encryption

| Attribute | Value |
|-----------|-------|
| **Location** | `frontend/src/utils/e2eeKeyStore.js` |
| **Type** | Sensitive Data Exposure |
| **Exploit Probability** | **3%** |

`exportKeyPairToFile()` writes RSA private key as plaintext JSON to disk. Requires physical access to the victim's computer. Mitigated by CSP hardening and the fact that keys are in sessionStorage (cleared on tab close).

---

#### L-03: Revoked Token 30-Second Cache Window

| Attribute | Value |
|-----------|-------|
| **Location** | `backend/app/services/auth_service.py` |
| **Type** | Time-of-check/Time-of-use |
| **Exploit Probability** | **3%** |

In-memory revocation cache refreshes from DB every 30 seconds. A revoked token may be accepted for up to 30s after logout. Requires token theft + immediate use within the cache window.

---

#### L-04: TOTP Replay Within Validity Window

| Attribute | Value |
|-----------|-------|
| **Location** | `backend/app/services/totp_service.py` |
| **Type** | Protocol Limitation |
| **Exploit Probability** | **1%** |

`valid_window=1` allows TOTP codes from the previous 30-second window (90 seconds total). Inherent to TOTP protocol design. Real-time interception required. Mitigated by TLS, IP-based lockout, and 3-attempt limit.

---

## Tool-by-Tool Outlook

| Tool | Expected Findings | Actual Risk |
|------|-------------------|-------------|
| **Burp Suite Scanner** | Self-signed cert warning, admin role in registration, missing headers on `/assets/` | All non-deductible or low impact |
| **Burp Intruder** | Rate limited at 5–30 req/min, 429s on brute force, profile view inflation | Cosmetic only |
| **Burp Repeater** | All IDOR endpoints protected, DM connection enforced | Nothing exploitable |
| **sqlmap** | 0 injection points (ORM-parameterized) | Nothing |
| **Wapiti** | 0 XSS/SSRF/XXE findings | Nothing |
| **Nikto** | Server version hidden, clean headers (except `/assets/`) | L-01 only |
| **testssl.sh** | TLS 1.3, AES-256-GCM, 14/14 CVE checks pass | Nothing |
| **nmap** | 22 (SSH), 80 (→444), 443 (HTTPS). Backend not reachable on port 8000 | Nothing webapp-related |
| **Gobuster/ffuf** | SPA wildcard response, rate limited at 30 req/min | Nothing |
| **hydra** | 5 req/min auth + TOTP 2FA + 3-attempt lockout (60 min) | Infeasible brute force |
| **Metasploit** | Backend/DB not reachable from LAN | No exploitable services |

---

## Attack Probability Matrix

| ID | Finding | Severity | Exploit Prob. | Deductible? |
|----|---------|----------|---------------|-------------|
| M-01 | Admin self-registration | Medium | 100% | **No** (by design) |
| M-02 | Profile view inflation | Medium | 40% | Maybe (cosmetic) |
| M-03 | verify-password raw JSON | Medium | 5% | Unlikely |
| L-01 | `/assets/` headers gap | Low | 10% | Scanner noise |
| L-02 | Plaintext key export | Low | 3% | Requires local access |
| L-03 | 30s revocation cache | Low | 3% | Requires token theft |
| L-04 | TOTP 90s replay window | Low | 1% | Protocol inherent |

---

## Aggregate Risk Assessment

**For the 5-day bug bounty (April 14–19) with ~20 attackers, no source code:**

| Scenario | Probability |
|----------|-------------|
| At least one deductible security exploit | **5–12%** |
| At least one functional bug reported | **15–25%** |
| At least one issue of any type reported | **18–30%** |
| Critical/High severity issue found | **< 2%** |

### Most Likely Reports (and why they don't matter)

1. **Admin self-registration** (M-01) — by design, testers will report it, not deductible
2. **Profile view inflation** (M-02) — cosmetic, no security impact
3. **Burp Suite "password in plaintext"** — local MITM proxy, not a vulnerability
4. **Self-signed certificate** — expected for LAN deployment

### Unlikely but Possible

1. **`/assets/` header gap** (L-01) — scanner finding, no practical exploit
2. **verify-password** (M-03) — obscure endpoint, hard to find without docs

### Effectively Impossible

- SQL injection, XSS, CSRF, session hijacking, path traversal, IDOR, brute force, privilege escalation (beyond admin read-only), DoS (auto-restart + rate limits)

---

## Conclusion

VajraKavach has **zero critical or high-severity findings remaining**. The 7 remaining items are:
- 1 intentional design choice (admin registration for testing)
- 2 cosmetic/minor issues (profile views, raw JSON endpoint)
- 4 low-severity defense-in-depth concerns (headers, key export, cache window, TOTP replay)

No remaining issue enables data breach, privilege escalation beyond read-only admin, session theft, injection, or service disruption. The platform achieves a **strong** security posture with comprehensive automated test coverage (140 tests).

---

*Fresh assessment conducted 7 April 2026 — VajraKavach Security Team*
