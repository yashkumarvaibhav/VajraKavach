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
