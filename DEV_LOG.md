# VajraKavach — Development Log

All timestamps are in **Indian Standard Time (IST, UTC+5:30)**.

---

## Session 1 — 2026-02-26

### [05:16 IST] Project Initialization & GitHub Setup
- Verified GitHub CLI authentication as `yashkumarvaibhav`
- Confirmed remote: `git@github.com:yashkumarvaibhav/VajraKavach.git`
- Set git global user config (name + email)
- Confirmed repo has initial commit on `main` branch

### [05:18 IST] Project Understanding & Architecture Planning
- Read and analyzed `project-details.md` (CSE 345/545 course project)
- Identified key requirements: secure auth (TOTP), PKI, E2E encryption, encrypted resume storage, RBAC, tamper-evident audit logs
- Identified tech stack: FastAPI (Python), React, PostgreSQL, Nginx
- Identified February 27 milestone (M2) as immediate priority:
  - Secure registration & login
  - TOTP verification
  - User profile management
  - Encrypted resume upload
  - Basic admin dashboard

### [05:20 IST] Architecture Document Created
- Created `ARCHITECTURE.md` with:
  - Full directory structure
  - Technology stack table
  - Authentication flow (Argon2 + JWT + TOTP)
  - RBAC design (user / recruiter / admin)
  - Encryption strategy (Fernet for resumes, RSA for E2E messaging)
  - Tamper-evident audit logging (SHA-256 hash chaining)
  - Defense mechanisms table (SQLi, XSS, CSRF, session attacks)
  - API endpoint design (RESTful)
  - Database schema overview

### [05:21 IST] Backend Project Structure & Configuration
- Created `backend/` directory structure
- Created `requirements.txt` with all dependencies:
  - FastAPI, uvicorn, SQLAlchemy, asyncpg, passlib[argon2], python-jose, pyotp, cryptography, qrcode, aiofiles
- Created `.env.example` and `.env` with configuration
- Created `backend/.gitignore`
- Created `app/config.py` — Pydantic Settings for env loading
- Created `app/database.py` — async SQLAlchemy engine + session management

### [05:23 IST] Database Models (SQLAlchemy ORM)
- Created 9 ORM models in `app/models/`:
  - `user.py` — User (with Argon2 hashed password, TOTP secret, RSA public key, role enum) + UserProfile (with JSON privacy settings)
  - `connection.py` — Connection (pending/accepted/rejected status)
  - `company.py` — Company page linked to admin user
  - `job.py` — Job listing (with enums for location_type, job_type)
  - `application.py` — Job application with status tracking (applied → reviewed → interviewed → rejected/offer)
  - `resume.py` — Resume metadata (encrypted path, SHA-256 hash, PKI digital signature)
  - `message.py` — Message (ciphertext only) + Conversation
  - `audit.py` — AuditLog with hash-chain fields (entry_hash, previous_hash)

### [05:25 IST] Security Services Implemented
- `services/auth_service.py` — Argon2id password hashing, JWT access/refresh token creation & verification
- `services/totp_service.py` — TOTP secret generation, QR code (base64 PNG), token verification (±1 window)
- `services/encryption_service.py` — Fernet (AES-128-CBC + HMAC-SHA256) encrypt/decrypt, SHA-256 hashing
- `services/pki_service.py` — RSA key pair generation, digital signing (SHA-256 + PKCS1v15), signature verification, OAEP encryption/decryption, self-signed TLS cert generation
- `services/audit_service.py` — Tamper-evident audit logging with SHA-256 hash chaining, chain integrity verification
- `services/resume_service.py` — Secure resume upload (encrypt, hash, sign), decryption for download

### [05:27 IST] API Routes Implemented (Full CRUD)
- `routes/auth.py` — Register (with TOTP QR), login, TOTP verify, token refresh, password reset (TOTP-gated)
- `routes/users.py` — Profile CRUD, privacy-filtered profile viewing, connections (send/accept/remove/list)
- `routes/companies.py` — Company CRUD (recruiter/admin only)
- `routes/jobs.py` — Job CRUD, search with filters (keyword, location, type, skills, pagination)
- `routes/applications.py` — Apply to jobs, track own applications, recruiter status updates
- `routes/messages.py` — Send encrypted messages, list conversations, get messages, fetch user public keys
- `routes/resumes.py` — Upload (encrypt + sign), download (access-controlled), integrity verification (PKI), delete
- `routes/admin.py` — User listing, suspend/activate/delete, audit log viewing, chain integrity verification, dashboard stats

### [05:28 IST] Middleware & Main Application
- `middleware/security.py` — Security headers (CSP, HSTS, XSS, frame options), request ID tracing, in-memory rate limiting
- `middleware/audit.py` — Request-level audit logging with timing
- `dependencies.py` — JWT auth dependency (with TOTP verification check), pre-TOTP dependency, role-checking factory
- `app/main.py` — FastAPI app with lifespan (auto-creates TLS certs, generates Fernet key, initializes DB), all middleware, all routers

### [05:29 IST] Frontend Scaffold (React + Vite + TailwindCSS)
- Created `frontend/` with Vite + React 18 + TailwindCSS + React Router
- **Components:**
  - `Navbar.jsx` — Navigation with role-based links
  - `VirtualKeyboard.jsx` — Randomized digit layout for secure TOTP entry (anti-keylogger)
- **Pages:**
  - `LoginPage.jsx` — Email + password login form
  - `RegisterPage.jsx` — Registration form with TOTP QR code display
  - `TOTPVerifyPage.jsx` — 6-digit TOTP entry with virtual keyboard option
  - `DashboardPage.jsx` — User dashboard with security status overview
  - `ProfilePage.jsx` — Profile editing (headline, bio, skills, etc.)
  - `ResumePage.jsx` — Resume management (upload, download, verify integrity, delete)
  - `AdminDashboard.jsx` — Admin: user management, stats, audit log viewer with chain verification
- **Services:**
  - `api.js` — Axios instance with JWT interceptors and auto-refresh
- **Contexts:**
  - `AuthContext.jsx` — Auth state management (login, register, TOTP verify, logout)

### [05:29 IST] Nginx & Infrastructure
- Created `nginx/nginx.conf` — HTTPS reverse proxy (HTTP→HTTPS redirect, TLS, security headers, proxy to backend:8000 + frontend:5173)

### [05:30 IST] Documentation & Git
- Updated `README.md` with project overview, tech stack, security features, quick start guide, milestones
- Created this DEV_LOG.md

---

### Summary — Session 1 Deliverables
| Item | Status |
|------|--------|
| Architecture document | Done |
| Backend: 9 ORM models | Done |
| Backend: 6 security services | Done |
| Backend: 8 API route modules (40+ endpoints) | Done |
| Backend: Middleware (security, audit, rate-limit) | Done |
| Backend: Main app entry point with lifespan | Done |
| Frontend: 9 React components/pages | Done |
| Frontend: Auth context + API service | Done |
| Virtual keyboard for TOTP | Done |
| Nginx HTTPS config | Done |
| README + DEV_LOG | Done |

**Next Steps:** Set up PostgreSQL, install dependencies, test backend startup, install frontend deps, verify full-stack integration.
---

## Session 2 — 2026-02-26

### [05:31 IST] Git Commit & Push
- Committed all 71 files (5572 insertions) to `main` branch
- Pushed to GitHub successfully: `671d969..4699f91`

### [05:35 IST] Backend Dependencies Installation
- Created Python virtual environment at `backend/venv/`
- Installed all dependencies (FastAPI, SQLAlchemy, asyncpg, passlib, pyotp, cryptography, pydantic-settings, etc.)
- Using Python 3.10, pip 22.0.2

### [05:38 IST] PostgreSQL Database Setup
- Verified PostgreSQL 14.20 running on Ubuntu
- Database `vajrakavach_db` and user `vajrakavach` already existed
- Updated password and verified connectivity
- Updated `backend/.env` with correct DATABASE_URL

### [05:40 IST] Backend Testing & Bug Fixes
- **BUG FIX:** `models/job.py` — `Boolean` was not imported (NameError at import time). Added `Boolean` to the SQLAlchemy import tuple.
- After fix, all imports pass cleanly
- Started uvicorn on port 8000 with `--reload`
- All 10 DB tables auto-created: users, user_profiles, companies, jobs, applications, resumes, messages, conversations, connections, audit_logs

### [05:42 IST] API Integration Testing
- **Registration:** `POST /api/auth/register` — returns TOTP secret + QR code base64 (verified)
- **Login:** `POST /api/auth/login` — returns JWT with `totp_required: true` (verified)
- **TOTP Verify:** `POST /api/auth/verify-totp` — accepts 6-digit token, returns new JWT with `totp_verified: true` (verified)
- **Auth/Me:** `GET /api/auth/me` — returns authenticated user data (verified)
- **BUG FIX:** `routes/auth.py` — admin role was not being assigned during registration. Added `elif req.role == "admin": role = UserRole.ADMIN`.
- **Admin Dashboard:** `GET /api/admin/dashboard` — returns stats (total_users: 5, etc.)
- All audit logs with SHA-256 hash chains verified working in DB

### [05:48 IST] Node.js & Frontend Setup
- Upgraded Node.js from v12.22.9 to v20.20.0 (via NodeSource repo)
- npm upgraded to 10.8.2
- Installed frontend dependencies: React 18, Vite 5, TailwindCSS, Axios, Lucide, etc.
- Started Vite dev server on port 5173 — serving correctly

### [05:53 IST] Full Stack Verification
- Backend (port 8000): all endpoints healthy, API docs at /api/docs
- Frontend (port 5173): serving React SPA correctly
- API proxy from frontend → backend working via Vite config
- Hash-chained audit logs accumulating properly in PostgreSQL

### Summary — Session 2 Deliverables
| Item | Status |
|------|--------|
| Git commit & push to GitHub | Done |
| Backend venv + dependency install | Done |
| PostgreSQL database setup | Done |
| Backend startup + table creation | Done |
| Bug fix: Boolean import in job.py | Done |
| Bug fix: Admin role in registration | Done |
| Full auth flow tested (register → login → TOTP → me) | Done |
| Admin dashboard tested | Done |
| Node.js 20 + frontend deps installed | Done |
| Frontend Vite dev server running | Done |

**Next Steps:** End-to-end browser testing, resume upload/download test, profile management test, cleanup test data.

---

## Session 3 — 2026-02-26

### [06:20 IST] Landing Page
- Created `LandingPage.jsx` — hero section with tagline, feature cards (TOTP, encrypted resumes, E2E messaging, audit logs), trust/tech section, footer
- Updated `App.jsx` routing: `/` now shows landing page for guests, redirects to `/dashboard` for logged-in users
- Login/Register pages now redirect to `/dashboard` if already authenticated
- Navbar logout redirects to `/` (landing) instead of `/login`

### [06:30 IST] Enhanced Profile Page
- **Name editing:** Full name is now editable (was read-only). Uses new `PUT /api/users/me` endpoint
- **Education section:** Structured entries with fields for institution, degree, field of study, start/end year, description. Add/edit/remove with inline forms
- **Experience section:** Structured entries with company, title, location, start/end date (month picker), "currently working" checkbox, description. Add/edit/remove
- **Profile picture:** Upload with hover overlay camera icon, max 5 MB (jpg/png/webp/gif), stored in `uploads/avatars/`

### [06:35 IST] Backend — New Endpoints
- `PUT /api/users/me` — update full_name and phone on the User model
- `POST /api/users/me/profile-picture` — upload avatar (validates type & size, saves as `<user_id>.<ext>`)
- `GET /api/users/me/profile-picture/{filename}` — serve avatar file
- `UserProfileResponse` schema now includes `full_name` and `email` from the User record
- Added `UserNameUpdate` schema for name/phone updates
- All verified with curl tests — name update returns updated data

### [06:40 IST] Git Push
- Committed and pushed: `674a351`

### Summary — Session 3 Deliverables
| Item | Status |
|------|--------|
| Landing page with hero + features | Done |
| Guest → landing, auth → dashboard routing | Done |
| Name field editable in profile | Done |
| Education entries (structured JSON) | Done |
| Experience entries (structured JSON) | Done |
| Profile picture upload + display | Done |
| Backend PUT /users/me endpoint | Done |
| Backend profile-picture upload/serve | Done |

**Next Steps:** Browser-test the full flow, admin login walkthrough, resume encryption test.