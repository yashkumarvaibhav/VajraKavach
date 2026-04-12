# VajraKavach — Complete Design Principles Document

> **Project:** Secure Job Search & Professional Networking Platform  
> **Stack:** FastAPI (Python) · PostgreSQL · Nginx · React 18 (Vite) · TailwindCSS  
> **Generated:** 2026-04-11

---

## Table of Contents

1. [Defense in Depth](#1-defense-in-depth)
2. [Zero Trust / Assume Breach](#2-zero-trust--assume-breach)
3. [Principle of Least Privilege (RBAC)](#3-principle-of-least-privilege-rbac)
4. [Multi-Factor Authentication (MFA) with TOTP](#4-multi-factor-authentication-mfa-with-totp)
5. [Progressive / Exponential Lockout](#5-progressive--exponential-lockout)
6. [Triple-Layer Rate Limiting](#6-triple-layer-rate-limiting)
7. [Tamper-Evident Audit Logging (Hash-Chain + Blockchain)](#7-tamper-evident-audit-logging-hash-chain--blockchain)
8. [Encryption at Rest (Symmetric — Fernet/AES)](#8-encryption-at-rest-symmetric--fernetaes)
9. [End-to-End Encryption (E2EE) for Messaging](#9-end-to-end-encryption-e2ee-for-messaging)
10. [Client-Side Key Management (Zero-Knowledge)](#10-client-side-key-management-zero-knowledge)
11. [PKI / Digital Signatures for Data Integrity](#11-pki--digital-signatures-for-data-integrity)
12. [Secure Session Management](#12-secure-session-management)
13. [Timing-Safe Authentication](#13-timing-safe-authentication)
14. [Transport Layer Security (TLS)](#14-transport-layer-security-tls)
15. [Content Security Policy (CSP) and Browser Security Headers](#15-content-security-policy-csp-and-browser-security-headers)
16. [Separation of Concerns / Layered Architecture](#16-separation-of-concerns--layered-architecture)
17. [Input Validation and Sanitization](#17-input-validation-and-sanitization)
18. [SQL Injection Prevention via ORM](#18-sql-injection-prevention-via-orm)
19. [Secure Password Storage (Argon2id)](#19-secure-password-storage-argon2id)
20. [Privacy by Design (Granular Privacy Controls)](#20-privacy-by-design-granular-privacy-controls)
21. [Network Segmentation / LAN-Only Access](#21-network-segmentation--lan-only-access)
22. [Information Leakage Prevention](#22-information-leakage-prevention)
23. [Systemd Integration / Service Resilience](#23-systemd-integration--service-resilience)
24. [Secure CORS Configuration](#24-secure-cors-configuration)
25. [Secure Cookie Configuration](#25-secure-cookie-configuration)
26. [Real-Time Communication (WebSocket) with Security Parity](#26-real-time-communication-websocket-with-security-parity)
27. [Data Integrity Verification (SHA-256)](#27-data-integrity-verification-sha-256)
28. [Secure File Handling](#28-secure-file-handling)
29. [Async-First Architecture](#29-async-first-architecture)
30. [Configuration Security (Pydantic Settings)](#30-configuration-security-pydantic-settings)
31. [Secure Account Lifecycle](#31-secure-account-lifecycle)
32. [Anti-Enumeration / Uniform Error Responses](#32-anti-enumeration--uniform-error-responses)
33. [Reverse Proxy Architecture](#33-reverse-proxy-architecture)
34. [Automatic Token/State Cleanup](#34-automatic-tokenstate-cleanup)
35. [Client-Side Security Architecture](#35-client-side-security-architecture)

---

## 1. Defense in Depth

**Where implemented:**  
- `nginx/nginx.conf`  
- `backend/app/middleware/security.py`  
- `backend/app/main.py`

**Rationale:** No single security layer is trusted alone; multiple overlapping controls ensure that compromise of one layer doesn't compromise the system.

**Implementation details:**
- **Security headers** are set at the Nginx layer (`add_header ... always`) AND replicated in `SecurityHeadersMiddleware` as a fallback — the middleware checks `if "X-Content-Type-Options" not in response.headers` to avoid duplication but guarantees coverage if backend is accessed directly.
- **Rate limiting** is enforced at three independent layers: (1) Nginx `limit_req_zone` for network-level per-IP throttling, (2) `RateLimitMiddleware` in FastAPI for application-level per-IP sliding window, (3) `ActionRateLimitService` for semantic per-user/per-IP daily/weekly business-logic limits stored in PostgreSQL.
- **TLS termination** at Nginx with backend bound to `127.0.0.1:8000` only — even if middleware is bypassed, backend is not network-accessible.
- **Input validation** at Pydantic schema level (type/length), at service level (magic bytes for resumes), and at database level (constraints, FK integrity).

---

## 2. Zero Trust / Assume Breach

**Where implemented:**  
- `backend/app/dependencies.py`  
- `backend/app/routes/auth.py`  
- `backend/app/routes/websocket.py`

**Rationale:** Every request is authenticated and authorized independently; sessions are bound to context (IP) and can be invalidated globally.

**Implementation details:**
- **IP binding on JWT tokens**: Client IP is embedded in the JWT claim `"ip"` at login. Every subsequent request compares `get_client_ip(request)` against `payload.get("ip")` — mismatch returns `401 Session IP mismatch`.
- **Force re-authentication**: `User.force_reauth_at` timestamp invalidates ALL tokens issued before that time (used after `forgot-password` reset).
- **Token type enforcement**: `get_current_user()` explicitly rejects refresh tokens used as access tokens (`payload.get("type") != "access"`).
- **WebSocket authentication**: Same JWT validation, IP binding, TOTP requirement, and active/suspended checks applied to WebSocket connections in `_authenticate()`.

---

## 3. Principle of Least Privilege (RBAC)

**Where implemented:**  
- `backend/app/models/user.py` (roles)  
- `backend/app/dependencies.py` (`require_role`)  
- `backend/app/routes/admin.py`  
- `frontend/src/App.jsx`

**Rationale:** Users can only access resources appropriate to their role; admin functions are further split into read-only and full-power tiers.

**Implementation details:**
- Four roles: `user`, `recruiter`, `admin` (read-only), `platform_admin` (full power).
- `require_role(*roles)` dependency factory enforces role checks at the route level.
- Resume download authorization checks ownership → admin → authorized recruiter (only if they posted a job the resume owner applied to).
- Frontend `ProtectedRoute` with `allowedRoles` prop prevents client-side access to admin UI.
- Platform admin deletion blocked if they're the last active platform admin.

---

## 4. Multi-Factor Authentication (MFA) with TOTP

**Where implemented:**  
- `backend/app/services/totp_service.py`  
- `backend/app/routes/auth.py`  
- `backend/app/dependencies.py`

**Rationale:** Password alone is insufficient; TOTP adds a second factor that's resistant to phishing and credential stuffing. High-risk actions require fresh TOTP re-verification.

**Implementation details:**
- **Mandatory TOTP for all users**: Registration generates a TOTP secret, login returns `totp_required: true`, and `get_current_user()` rejects tokens where `totp_verified=False`.
- **TOTP for high-risk actions**: Resume download requires `X-TOTP-Token` header; password change and account deletion require fresh TOTP verification.
- **TOTP secret encryption at rest**: Secrets stored encrypted via Fernet (`encrypt_totp_secret()` / `decrypt_totp_secret()`) with graceful fallback for legacy plaintext.
- **Clock drift tolerance**: `verify_totp(..., valid_window=1)` allows ±30 seconds to handle client/server clock skew.

---

## 5. Progressive / Exponential Lockout

**Where implemented:**  
- `backend/app/services/totp_service.py`

**Rationale:** Prevents brute-force attacks on TOTP while allowing legitimate users to recover after a cooling period; escalating penalties deter persistent attackers.

**Implementation details:**
- 3 failed TOTP attempts within a 5-minute window triggers lockout.
- First lockout: 60 minutes. Each subsequent lockout: ×5 multiplier (60 → 300 → 1500 minutes).
- Lockout level persists across successful verifications (`clear_totp_attempts()` resets count but preserves level).
- State is DB-backed (`TOTPLockout` model) — survives server restarts via `sync_totp_lockout_to_db()` / `load_totp_lockout_from_db()`.

---

## 6. Triple-Layer Rate Limiting

**Where implemented:**  
- `nginx/nginx.conf` (Layer 1)  
- `backend/app/middleware/security.py` (Layer 2)  
- `backend/app/services/action_rate_limit_service.py` (Layer 3)

**Rationale:** Different threat models require different granularity — network-level protects infrastructure, application-level protects API, semantic-level prevents business logic abuse.

**Implementation details:**
- **Layer 1 — Nginx**: `api_global:30r/m`, `api_auth:5r/m`, `conn_limit:15` concurrent connections per IP.
- **Layer 2 — Middleware**: `RateLimitMiddleware(requests_per_minute=60, auth_requests_per_minute=5)` with 60-second sliding window and periodic cleanup.
- **Layer 3 — Business Logic**: 16 distinct action types with daily/weekly limits:
  - `register: 3/day, 5/week per IP` (strict account creation)
  - `message_send: 200/day, 1000/week per user`
  - `search_query: 200/day per user` (anti-scraping)
  - `profile_view: 100/day per user` (anti-stalking)
  - `login: 50/day, 200/week per IP` (slow brute-force protection)
  - `password_change: 3/day, 10/week per user`
  - etc.

---

## 7. Tamper-Evident Audit Logging (Hash-Chain + Blockchain)

**Where implemented:**  
- `backend/app/services/audit_service.py`  
- `backend/app/models/audit.py`  
- `backend/app/services/blockchain_service.py`  
- `backend/app/models/audit_block.py`

**Rationale:** Audit logs must be verifiable — any modification (insertion, deletion, alteration) should be mathematically detectable. The blockchain layer adds Merkle tree integrity for batch verification.

**Implementation details:**
- **Hash chain**: Each `AuditLog` entry has `entry_hash = SHA-256(previous_hash | action | user_id | resource | ...)` and `previous_hash` linking to the prior entry. Genesis hash: `"0" * 64`.
- **Race condition prevention**: `get_last_hash(db, lock=True)` uses `SELECT ... FOR UPDATE` to prevent concurrent inserts from breaking the chain.
- **Verification function**: `verify_audit_chain()` recomputes every hash and checks linkage.
- **Blockchain layer**: `AuditBlock` groups entries in batches of 10; each block has:
  - A Merkle root computed from the entry hashes.
  - A proof-of-work nonce (difficulty: 2 leading zeros).
  - A hash linking to the previous block.
- **Blockchain verification**: `verify_blockchain()` validates hash links, recomputes block hashes, verifies PoW prefix, and checks Merkle roots.

---

## 8. Encryption at Rest (Symmetric — Fernet/AES)

**Where implemented:**  
- `backend/app/services/encryption_service.py`  
- `backend/app/services/resume_service.py`

**Rationale:** Resumes contain highly sensitive PII; even if storage or database is compromised, data remains encrypted.

**Implementation details:**
- Fernet (AES-128-CBC + HMAC-SHA256) encrypts resume content before writing to disk.
- Each encrypted file stored at `uploads/{user_id}/{uuid}.enc`.
- SHA-256 hash of original content stored in DB for integrity verification.
- Key managed via `.env` `FERNET_SECRET_KEY`; auto-generated at startup if missing (with warning).
- TOTP secrets also encrypted at rest with the same Fernet key.

---

## 9. End-to-End Encryption (E2EE) for Messaging

**Where implemented:**  
- `frontend/src/utils/crypto.js`  
- `frontend/src/utils/e2eeKeyStore.js`  
- `backend/app/routes/messages.py`  
- `backend/app/services/pki_service.py`

**Rationale:** Server should never see plaintext messages — even a compromised server or malicious admin cannot read user communications.

**Implementation details:**
- **Hybrid encryption**: Random AES-256-GCM key generated per message → plaintext encrypted with AES-GCM → AES key encrypted with recipient's RSA-4096 public key (OAEP + SHA-256).
- **Binary format**: `[2-byte keyLen][RSA-encrypted AES key][12-byte IV][AES-GCM ciphertext+tag]`.
- **Dual encryption**: Each 1-to-1 message encrypted for both sender (`s`) and recipient (`r`) so both can read their own messages from server: `E2E:{"s":"...","r":"..."}`.
- **Group messages**: Encrypted per-member: `E2EG:{"userId1":"blob1","userId2":"blob2",...}`.
- **Server-side validation**: `_is_valid_e2e_ciphertext()` rejects plaintext submissions — enforces that the API only persists encrypted payloads with structural validation (`_looks_like_hybrid_ciphertext()`).
- **Digital signatures**: RSA-PSS SHA-256 signatures for message authenticity (`signMessage()`).

---

## 10. Client-Side Key Management (Zero-Knowledge)

**Where implemented:**  
- `frontend/src/utils/e2eeKeyStore.js`  
- `frontend/src/contexts/AuthContext.jsx`

**Rationale:** Private keys must never leave the client in plaintext; the server stores only public keys and optionally encrypted private keys for migration.

**Implementation details:**
- RSA-4096 key pairs generated client-side via WebCrypto API.
- Private keys encrypted with PBKDF2 (250,000 iterations, SHA-256) + AES-256-GCM using the user's password, then stored in IndexedDB.
- Session-scoped decrypted keys held in `sessionStorage` (cleared on tab close).
- `ensureLocalE2EEKeyPair()` on login: check session → check IndexedDB → check server for migration → generate new.
- Key import prompt shown when server has a different public key (multi-device scenario).

---

## 11. PKI / Digital Signatures for Data Integrity

**Where implemented:**  
- `backend/app/services/pki_service.py`  
- `backend/app/services/resume_service.py`  
- `backend/app/models/resume.py`

**Rationale:** Cryptographic signatures provide non-repudiation and tamper detection for resumes and messages beyond hash-based integrity.

**Implementation details:**
- Server signs resumes with RSA private key (`sign_data()` → SHA-256 + PKCS1v15) at upload time.
- `Resume.digital_signature` stored in DB; can be verified with server's public key.
- Self-signed TLS certificates auto-generated with RSA-4096 if not present.
- Message signatures use RSA-PSS (client-side) for sender authentication.

---

## 12. Secure Session Management

**Where implemented:**  
- `backend/app/routes/auth.py`  
- `backend/app/services/auth_service.py`  
- `backend/app/models/security_state.py`

**Rationale:** Sessions must be resistant to hijacking, fixation, and replay; revocation must be immediate and persistent.

**Implementation details:**
- **HttpOnly + Secure + SameSite=Strict cookies** for both access and refresh tokens.
- **Short-lived access tokens** (30 minutes) with 7-day refresh tokens.
- **DB-backed token blocklist**: Revoked tokens stored as SHA-256 hashes in `RevokedToken` table (never storing raw JWTs).
- **In-memory cache + DB source of truth**: `_revoked_cache` refreshed every 30 seconds from DB.
- **Refresh token rotation**: Old refresh token revoked BEFORE issuing new ones (closes race window).
- **Single-use refresh tokens**: `is_token_revoked()` check prevents replay.
- **Session invalidation on password change**: Both access and refresh tokens revoked; `force_reauth_at` invalidates all sessions globally.

---

## 13. Timing-Safe Authentication

**Where implemented:**  
- `backend/app/routes/auth.py`

**Rationale:** Prevents user enumeration via timing side-channels — if a user doesn't exist, a dummy hash is still computed to equalize response time.

**Implementation details:**
```python
if not user:
    verify_password(req.password, hash_password("dummy-constant-time-pad"))
```
- Generic error messages: `"Invalid email or password"` (never reveals whether email exists).
- TOTP setup verification uses the same uniform error: `"Invalid email or TOTP token"`.

---

## 14. Transport Layer Security (TLS)

**Where implemented:**  
- `nginx/nginx.conf`  
- `backend/app/services/pki_service.py`

**Rationale:** All data in transit must be encrypted; weak ciphers and compression must be disabled.

**Implementation details:**
- TLS 1.2 and 1.3 only (`ssl_protocols TLSv1.2 TLSv1.3`).
- Strong cipher suite: `ECDHE-RSA-AES256-GCM-SHA384`, `ECDHE-RSA-AES128-GCM-SHA256`, `ECDHE-RSA-CHACHA20-POLY1305`; explicitly excludes `!CBC`, `!aNULL`, `!MD5`, `!DSS`.
- `ssl_prefer_server_ciphers on` — server dictates cipher choice.
- **HTTP completely disabled**: Port 80 returns `444` (connection close) instead of redirect to prevent credential leakage during redirect.
- **HSTS**: `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
- **BREACH mitigation**: `gzip off` disables HTTP compression.

---

## 15. Content Security Policy (CSP) and Browser Security Headers

**Where implemented:**  
- `nginx/nginx.conf`  
- `backend/app/middleware/security.py`

**Rationale:** Prevents XSS, clickjacking, MIME sniffing, and other browser-based attacks via strict policies.

**Implementation details:**
- `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`.
- `X-Frame-Options: DENY` — prevents clickjacking.
- `X-Content-Type-Options: nosniff` — prevents MIME sniffing.
- `X-XSS-Protection: 1; mode=block`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy: camera=(), microphone=(), geolocation()` — disables sensitive browser APIs.
- Headers re-applied in `/assets/` location block because Nginx `add_header` doesn't inherit into child blocks.

---

## 16. Separation of Concerns / Layered Architecture

**Where implemented:**  
- Entire backend directory structure (`backend/app/`)

**Rationale:** Clean separation enables testability, maintainability, and security review at each layer independently.

**Implementation details:**
- **Models** (`models/`): ORM data definitions only — no business logic.
- **Schemas** (`schemas/`): Pydantic validation — input/output contracts.
- **Services** (`services/`): Business logic, cryptographic operations, audit creation.
- **Routes** (`routes/`): HTTP handling, request parsing, response formatting.
- **Middleware** (`middleware/`): Cross-cutting concerns (security headers, rate limiting, audit).
- **Dependencies** (`dependencies.py`): Authentication/authorization injection via FastAPI's DI system.
- **Utils** (`utils/`): Pure utility functions (`ip.py`, `sanitize.py`).

---

## 17. Input Validation and Sanitization

**Where implemented:**  
- `backend/app/schemas/auth.py`  
- `backend/app/utils/sanitize.py`  
- `backend/app/services/resume_service.py`  
- `backend/app/routes/resumes.py`

**Rationale:** All external input must be validated at system boundaries; defense against injection, overflow, and malicious file upload.

**Implementation details:**
- **Password policy**: 8–72 chars, must include upper + lower + digit + special (Pydantic validator).
- **Phone validation**: Regex `^\+\d{1,3}\d{10}$` — enforces country code format.
- **Email validation**: `pydantic.EmailStr`.
- **Field length limits**: `max_length` on all string fields (e.g., `full_name: max_length=255`).
- **LIKE injection prevention**: `escape_like()` escapes `%` and `_` in search queries.
- **File upload validation**: MIME type whitelist (`application/pdf`, `application/vnd.openxmlformats...`) AND magic bytes verification (checks `%PDF` / `PK\x03\x04` — not trusting client Content-Type alone).
- **File size limit**: 5 MB application-level + Nginx `client_max_body_size 5M` on `/api/`.
- **Resume count cap**: Max 5 resumes per user (prevents storage abuse).
- **Filename sanitization**: Content-Disposition filenames stripped of `"`, `\r`, `\n`, `;`.

---

## 18. SQL Injection Prevention via ORM

**Where implemented:**  
- All database operations via SQLAlchemy ORM

**Rationale:** Parameterized queries eliminate SQL injection by construction.

**Implementation details:**
- All queries use SQLAlchemy `select()`, `where()`, `func.count()` — never raw SQL string interpolation.
- `escape_like()` utility for the specific case of ILIKE pattern matching.
- Database migrations use `text()` only for schema evolution (ALTER TABLE), not for user-input queries.

---

## 19. Secure Password Storage (Argon2id)

**Where implemented:**  
- `backend/app/services/auth_service.py`

**Rationale:** Argon2id is the winner of the Password Hashing Competition — memory-hard, resistant to GPU/ASIC attacks, with automatic salt generation.

**Implementation details:**
- `CryptContext(schemes=["argon2"], deprecated="auto")` — passlib manages Argon2id with auto-generated salt.
- Max password length capped at 72 characters to prevent DoS via extremely long passwords.

---

## 20. Privacy by Design (Granular Privacy Controls)

**Where implemented:**  
- `backend/app/models/user.py`  
- `backend/app/routes/users.py`

**Rationale:** Users should control who sees their personal information; different fields have different sensitivity levels.

**Implementation details:**
- Per-field privacy settings: `email: private`, `phone: private`, `headline: public`, `education: connections`, etc.
- Three levels: `public`, `connections` (accepted connections only), `private` (owner only).
- Privacy filtering applied server-side when viewing other users' profiles — checks connection status before exposing fields.
- Profile view count hidden from visitors — only visible to profile owner.
- `show_viewers` opt-out for profile viewer tracking.

---

## 21. Network Segmentation / LAN-Only Access

**Where implemented:**  
- `nginx/nginx.conf`

**Rationale:** The platform is designed for an institutional LAN (IIIT Delhi); restricting access to internal subnets reduces attack surface.

**Implementation details:**
- `allow 192.168.0.0/16; allow 10.0.0.0/8; allow 127.0.0.1; deny all;`.
- Backend binds to `127.0.0.1:8000` — not accessible from network even without Nginx.

---

## 22. Information Leakage Prevention

**Where implemented:**  
- `nginx/nginx.conf`  
- `backend/app/middleware/security.py`  
- `backend/app/main.py`

**Rationale:** Attackers should learn as little as possible about the system internals from responses or exposed endpoints.

**Implementation details:**
- **Request ID not exposed**: `RequestIDMiddleware` sets `request.state.request_id` for internal tracing but explicitly does NOT add `X-Request-ID` to responses.
- **Nginx hides internal headers**: `proxy_hide_header X-Request-ID`.
- **API docs disabled in production**: `docs_url=None`, `openapi_url=None` unless `DEBUG=True`; Nginx blocks `/openapi.json`, `/api/docs`, `/api/redoc` with `return 404`.
- **Scanner path blocking**: Nginx returns 404 for `.env`, `.git`, `wp-admin`, `phpinfo`, `actuator`, etc.
- **Dotfile blocking**: `location ~ /\. { return 404; }`.
- **Uniform error messages**: Authentication failures use generic messages to prevent user/email enumeration.

---

## 23. Systemd Integration / Service Resilience

**Where implemented:**  
- `backend/app/main.py`  
- `stop.sh`

**Rationale:** Production deployment needs process supervision, health monitoring, and graceful lifecycle management.

**Implementation details:**
- **sd_notify protocol**: Backend sends `READY=1` when startup completes, `STOPPING=1` on shutdown.
- **Watchdog keepalive**: Periodic `WATCHDOG=1` messages at `WATCHDOG_USEC/2` interval — if the process hangs, systemd kills and restarts it.
- **Graceful shutdown**: Security state (revoked tokens, TOTP lockouts) persisted to database before exit.
- **State recovery on startup**: `load_revoked_cache()`, `load_totp_lockout_from_db()`, `cleanup_expired_tokens()` restore security state from DB.
- **Health endpoints**: `/health` and `/api/health` for monitoring.

---

## 24. Secure CORS Configuration

**Where implemented:**  
- `backend/app/main.py`

**Rationale:** CORS must be explicit to prevent cross-origin attacks while allowing legitimate frontend origins.

**Implementation details:**
- Explicit origin allowlist from `settings.CORS_ORIGINS` (default: `localhost:5173`, `localhost:3000`).
- Regex for LAN IPs: `^https://192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$`.
- `allow_credentials=True` with explicit origins (not `*`).
- Explicit method and header whitelists.

---

## 25. Secure Cookie Configuration

**Where implemented:**  
- `backend/app/routes/auth.py`

**Rationale:** Cookie-based token storage with strict security flags prevents CSRF and session hijacking.

**Implementation details:**
- `httponly=True` — JavaScript cannot read tokens (XSS mitigation).
- `secure=True` — cookies only sent over HTTPS.
- `samesite="strict"` — prevents CSRF by blocking cross-origin cookie transmission.
- Separate cookies for access and refresh tokens with appropriate `max_age`.
- Cleanup on logout: explicit cookie deletion with same flags.

---

## 26. Real-Time Communication (WebSocket) with Security Parity

**Where implemented:**  
- `backend/app/routes/websocket.py`

**Rationale:** WebSocket connections must have the same security guarantees as REST endpoints — authentication, IP binding, and user status checks.

**Implementation details:**
- JWT authentication with TOTP verification requirement.
- IP binding check (X-Real-IP for proxied connections).
- User active/suspended status verification.
- Connection registry with async locking (`asyncio.Lock`).
- Dead connection cleanup on send failure.
- Nginx proxies with `proxy_read_timeout 3600s` for persistent connections.

---

## 27. Data Integrity Verification (SHA-256)

**Where implemented:**  
- `backend/app/services/encryption_service.py`  
- `backend/app/services/resume_service.py`

**Rationale:** Data at rest must be verifiable against tampering — the hash of the original file is stored separately from the encrypted file.

**Implementation details:**
- `compute_sha256()` hash of original resume content stored in `Resume.file_hash`.
- Enables post-decryption integrity check: compare decrypted content's hash against stored hash.
- Audit entries include `file_hash` in details for forensic tracing.

---

## 28. Secure File Handling

**Where implemented:**  
- `backend/app/services/resume_service.py`  
- `backend/app/routes/resumes.py`

**Rationale:** File uploads are a common attack vector; validation, isolation, and access control must be rigorous.

**Implementation details:**
- MIME type whitelist + magic byte verification (dual validation).
- Encrypted storage in user-isolated directories (`uploads/{user_id}/`).
- UUID-based filenames (`.enc`) — original filenames stored in DB, not filesystem.
- Download requires TOTP verification (high-risk action).
- Access control: owner OR admin OR authorized recruiter only.

---

## 29. Async-First Architecture

**Where implemented:**  
- `backend/app/database.py`  
- All routes and services

**Rationale:** Non-blocking I/O maximizes throughput under concurrent load without thread-pool overhead.

**Implementation details:**
- `create_async_engine` with `asyncpg` driver for PostgreSQL.
- `async_sessionmaker` with `expire_on_commit=False`.
- Connection pool: `pool_size=10, max_overflow=5, pool_pre_ping=True`.
- All route handlers and service functions are `async def`.
- `aiofiles` for async file I/O (resume read/write).

---

## 30. Configuration Security (Pydantic Settings)

**Where implemented:**  
- `backend/app/config.py`

**Rationale:** Secrets must not be hardcoded; environment-based configuration with validation ensures safe deployment.

**Implementation details:**
- `BaseSettings` loads from `.env` file.
- Fernet key auto-generation with warning if not configured.
- Sensitive defaults clearly marked as `"change-this-in-production"`.
- CORS origins parsed from JSON string to prevent injection.
- Debug flag parsed with `field_validator` to accept common env-style values.

---

## 31. Secure Account Lifecycle

**Where implemented:**  
- `backend/app/routes/auth.py`

**Rationale:** Account deletion and high-risk operations must require explicit confirmation and MFA to prevent accidental or malicious actions.

**Implementation details:**
- **Delete account** requires: typing `"DELETE MY ACCOUNT"` + valid TOTP token.
- Deletes encrypted resume files from disk.
- Prevents deleting the last active platform admin.
- **Forgot password** uses TOTP as the second factor (no email-based reset — TOTP-only recovery).
- **Password change** invalidates all existing sessions.

---

## 32. Anti-Enumeration / Uniform Error Responses

**Where implemented:**  
- `backend/app/routes/auth.py`  
- `backend/app/dependencies.py`

**Rationale:** Attackers must not distinguish between "user doesn't exist" and "wrong password" — prevents building user databases.

**Implementation details:**
- Login: dummy hash computation when user not found; same error message for all failure cases.
- TOTP setup verification: `_generic_error = HTTPException(..., detail="Invalid email or TOTP token")`.
- Forgot password: same error for non-existent user and invalid TOTP.

---

## 33. Reverse Proxy Architecture

**Where implemented:**  
- `nginx/nginx.conf`  
- `backend/app/utils/ip.py`  
- `frontend/vite.config.js`

**Rationale:** Nginx handles TLS, static assets, rate limiting, and header management; backend focuses on business logic.

**Implementation details:**
- Nginx terminates TLS; backend receives plain HTTP on loopback.
- `X-Real-IP` and `X-Forwarded-For` set to `$remote_addr` (not appended — prevents header injection).
- `get_client_ip()` reads `X-Forwarded-For` → `X-Real-IP` → fallback to `request.client.host`.
- Static assets served directly by Nginx with 1-year cache and `immutable` header.
- SPA fallback: `try_files $uri $uri/ /index.html`.

---

## 34. Automatic Token/State Cleanup

**Where implemented:**  
- `backend/app/services/auth_service.py`  
- `backend/app/services/totp_service.py`  
- `backend/app/middleware/security.py`

**Rationale:** Security state accumulates over time; automatic cleanup prevents unbounded memory/storage growth.

**Implementation details:**
- Expired revoked tokens deleted from DB at startup (`cleanup_expired_tokens()`).
- Expired TOTP lockouts deleted from DB at startup.
- Rate limit middleware cleans stale IP entries every 60 seconds.
- Revocation cache refreshed from DB every 30 seconds.

---

## 35. Client-Side Security Architecture

**Where implemented:**  
- `frontend/src/services/api.js`  
- `frontend/src/contexts/AuthContext.jsx`  
- `frontend/src/App.jsx`

**Rationale:** Frontend must gracefully handle security events (token expiry, rate limiting) without exposing sensitive state.

**Implementation details:**
- **Automatic token refresh**: Axios interceptor catches 401, attempts refresh, retries original request.
- **Rate limit handling**: On 429/503, automatic retry after `Retry-After` header delay; if still limited, shows user-facing toast notification.
- **Session cleanup**: `clearClientSession()` clears user state, TOTP state, and E2EE session keys from sessionStorage.
- **Route protection**: `ProtectedRoute` component redirects unauthenticated or unauthorized users.
- **No token exposure**: Tokens stored in HttpOnly cookies — never in JavaScript-accessible localStorage.

---

## Summary Table

| # | Principle | Primary Layer | Key Files |
|---|-----------|---------------|-----------|
| 1 | Defense in Depth | All layers | nginx.conf, security.py, main.py |
| 2 | Zero Trust / Assume Breach | Backend | dependencies.py, auth.py |
| 3 | Least Privilege (RBAC) | Backend + Frontend | user.py, dependencies.py, App.jsx |
| 4 | MFA with TOTP | Backend | totp_service.py, auth.py |
| 5 | Progressive Lockout | Backend | totp_service.py |
| 6 | Triple-Layer Rate Limiting | All layers | nginx.conf, security.py, action_rate_limit_service.py |
| 7 | Tamper-Evident Audit (Hash-Chain + Blockchain) | Backend | audit_service.py, blockchain_service.py |
| 8 | Encryption at Rest (Fernet/AES) | Backend | encryption_service.py, resume_service.py |
| 9 | E2EE Messaging (RSA-4096 + AES-256-GCM) | Frontend + Backend | crypto.js, messages.py, pki_service.py |
| 10 | Client-Side Key Management (Zero-Knowledge) | Frontend | e2eeKeyStore.js, AuthContext.jsx |
| 11 | PKI / Digital Signatures | Backend + Frontend | pki_service.py, crypto.js |
| 12 | Secure Session Management | Backend | auth_service.py, security_state.py |
| 13 | Timing-Safe Authentication | Backend | auth.py |
| 14 | TLS (Strong Ciphers, No HTTP) | Nginx | nginx.conf |
| 15 | CSP + Browser Security Headers | Nginx + Backend | nginx.conf, security.py |
| 16 | Separation of Concerns | Backend | models/, schemas/, services/, routes/ |
| 17 | Input Validation & Sanitization | Backend | schemas/auth.py, sanitize.py, resume_service.py |
| 18 | SQL Injection Prevention (ORM) | Backend | All routes/services |
| 19 | Argon2id Password Storage | Backend | auth_service.py |
| 20 | Privacy by Design | Backend | user.py, users.py |
| 21 | Network Segmentation (LAN-Only) | Nginx | nginx.conf |
| 22 | Information Leakage Prevention | All layers | nginx.conf, security.py, main.py |
| 23 | Systemd Integration / Resilience | Backend | main.py |
| 24 | Secure CORS | Backend | main.py |
| 25 | Secure Cookies | Backend | auth.py |
| 26 | WebSocket Security Parity | Backend | websocket.py |
| 27 | SHA-256 Data Integrity | Backend | encryption_service.py |
| 28 | Secure File Handling | Backend | resume_service.py, resumes.py |
| 29 | Async-First Architecture | Backend | database.py |
| 30 | Configuration Security | Backend | config.py |
| 31 | Secure Account Lifecycle | Backend | auth.py |
| 32 | Anti-Enumeration | Backend | auth.py |
| 33 | Reverse Proxy Architecture | Nginx + Backend | nginx.conf, ip.py |
| 34 | Automatic State Cleanup | Backend | auth_service.py, totp_service.py |
| 35 | Client-Side Security | Frontend | api.js, AuthContext.jsx |
