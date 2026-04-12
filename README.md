# VajraKavach

**Secure Job Search & Professional Networking Platform**

CSE 345/545 — Foundations to Computer Security | IIIT-Delhi

---

## Overview

VajraKavach is a full-stack web application that provides end-to-end security for professional networking, job search, resume sharing, and messaging. Confidentiality, integrity, and availability of user data are first-class requirements throughout the system.

## Tech Stack

| Layer | Technology |
|-------|------------|
| OS | Ubuntu (VM) |
| Database | PostgreSQL |
| Web Server | Nginx (HTTPS / TLS 1.2–1.3) |
| Backend | Python 3.10 / FastAPI |
| Frontend | React 18 (Vite) / Tailwind CSS |
| Auth | JWT + TOTP (pyotp) |
| Encryption | Fernet (AES-128-CBC + HMAC-SHA256) + RSA (PKI) |
| Passwords | Argon2id (passlib) |

---

## User Guide

### User Roles

| Role | Capabilities |
|------|-------------|
| **Job Seeker** | Create profile, upload resume, search & apply for jobs, send/receive encrypted messages, manage connections |
| **Recruiter** | Create company pages, post jobs, view applicants, update application status, message candidates |
| **Admin** | Manage all users, suspend/delete accounts, view audit logs, inspect blockchain, moderate reports |

### Getting Started

1. **Register** — Create an account at the registration page. You will set up TOTP 2FA during registration.
2. **Login** — Enter your credentials, then verify with your TOTP authenticator app code via the virtual keyboard.
3. **Dashboard** — After login you land on your role-specific dashboard.

### Features

#### Profiles & Connections
- Edit your profile (name, headline, location, education, experience, skills, bio, profile picture).
- Set field-level privacy: Public, Connections-only, or Private.
- Send, accept, and remove connection requests.
- View your connection graph and profile viewer count.

#### Job Search & Applications
- Search jobs by keywords, company, location, skill tags, and filters (remote, internship, full-time).
- Apply to jobs with a resume and cover note.
- Track application status: Applied → Reviewed → Interviewed → Offer / Rejected.
- Recruiters can shortlist candidates, add notes, and update status.

#### Company Pages
- Recruiters create company pages (name, description, location, website).
- Post job listings with title, description, required skills, salary range, and deadline.
- Manage job listings and view applicants.

#### Resume Management
- Upload resumes in PDF or DOCX format.
- Resumes are encrypted at rest with Fernet (AES).
- Access restricted to: owner, authorized recruiters, and admins.
- Resume download requires TOTP verification via virtual keyboard.

#### Secure Messaging
- One-to-one and group messaging.
- End-to-end encrypted: messages encrypted client-side with the recipient's RSA public key.
- Server stores only ciphertext.
- Real-time delivery via WebSocket.

#### Security Settings
- Change password (requires TOTP verification).
- Export/import RSA key pair for E2E encryption.
- Delete account (requires TOTP verification via virtual keyboard).

#### Admin Dashboard
- Overview of all users, jobs, companies, and applications.
- Suspend or delete accounts.
- View tamper-evident audit logs (SHA-256 hash-chained).
- Inspect the blockchain for integrity verification.
- Manage reports.

---

## Security Architecture

### Authentication & Authorization
- **Argon2id** password hashing (no plaintext storage).
- **JWT** access tokens (30 min) + refresh tokens (7 days).
- **TOTP 2FA** required after every login.
- **Virtual keyboard** (randomized layout) for TOTP entry on high-risk actions (password reset, resume download, account deletion).
- **RBAC** with three roles: user, recruiter, admin.
- **Escalating lockout** on failed TOTP attempts (3 attempts → 60 min, then ×5 per level).
- **Persistent token revocation** (SHA-256 hashed blocklist, DB-backed, survives restarts).

### Encryption
- **TLS 1.2/1.3** (Nginx, self-signed certificates) — all traffic HTTPS.
- **Fernet (AES-128-CBC + HMAC-SHA256)** for resume encryption at rest.
- **RSA** key pairs for E2E message encryption and PKI message signing.
- **TOTP secrets** encrypted with Fernet before database storage.

### Network Security (Nginx)
- Port 80 returns `444` (connection close) — forces HTTPS.
- LAN-only access (`192.168.0.0/16`, `10.0.0.0/8`, `127.0.0.1`).
- Rate limiting: 5 req/min on auth endpoints, 30 req/min general API, 15 concurrent connections per IP.
- Blocks: OpenAPI docs in production, `.env`, `.git`, scanner probes.
- GZIP disabled (prevents BREACH attack).
- Security headers: HSTS, X-Frame-Options: DENY, X-Content-Type-Options, CSP, Permissions-Policy, Referrer-Policy.

### Audit & Integrity
- All critical actions logged (auth, job changes, application status, admin moderation).
- **Tamper-evident logs** using SHA-256 hash chaining.
- **Blockchain-based integrity verification** for audit entries.

### Defense Against Attacks
- **SQL Injection** — SQLAlchemy ORM with parameterized queries.
- **XSS** — React auto-escaping + Content Security Policy.
- **CSRF** — SameSite=Strict cookies.
- **Session Fixation/Hijacking** — JWT-based (no server sessions), token rotation on refresh.
- **Brute Force** — Multi-layer rate limiting (Nginx + application middleware + per-action daily/weekly limits).

---

## Setup

### Prerequisites
- Ubuntu VM with PostgreSQL installed and running.
- Python 3.10+ and Node.js 18+.
- Nginx configured with TLS certificates.

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# Configure .env with DATABASE_URL, JWT_SECRET_KEY, FERNET_SECRET_KEY, etc.
python seed_admin.py          # Create initial admin account
```

### Frontend
```bash
cd frontend
npm install
npm run build                 # Build for production (served by Nginx)
```

### Start / Stop
```bash
./start.sh                    # Start backend (systemd) + verify health
./stop.sh                     # Stop backend + clean up
```

### Accessing the App
- **URL**: `https://<VM-IP>` (e.g., `https://192.168.3.44`)
- **Backend health**: `https://<VM-IP>/api/health`
- **Backend logs**: `journalctl -u vajrakavach-backend -f`

---

## Project Structure

```
vajrakavach-v01/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI entry point
│   │   ├── config.py                # Pydantic settings (.env)
│   │   ├── database.py              # SQLAlchemy async engine
│   │   ├── dependencies.py          # Auth dependency injection
│   │   ├── models/                  # ORM models (user, job, company, ...)
│   │   ├── schemas/                 # Pydantic request/response schemas
│   │   ├── routes/                  # API endpoints
│   │   │   ├── auth.py              # Login, register, TOTP, token refresh
│   │   │   ├── users.py             # Profile management
│   │   │   ├── companies.py         # Company CRUD
│   │   │   ├── jobs.py              # Job listings
│   │   │   ├── applications.py      # Job applications
│   │   │   ├── messages.py          # Encrypted messaging
│   │   │   ├── resumes.py           # Resume upload/download
│   │   │   ├── reports.py           # User reports
│   │   │   ├── admin.py             # Admin endpoints
│   │   │   └── websocket.py         # Real-time notifications
│   │   ├── services/                # Business logic
│   │   │   ├── auth_service.py      # Password hashing, JWT, token revocation
│   │   │   ├── totp_service.py      # TOTP generation, verification, lockout
│   │   │   ├── encryption_service.py
│   │   │   ├── blockchain_service.py
│   │   │   ├── pki_service.py       # RSA key management, signing
│   │   │   ├── audit_service.py     # Hash-chained audit logging
│   │   │   └── action_rate_limit_service.py
│   │   └── middleware/              # Security, rate limiting, request ID
│   ├── tests/                       # pytest test suite
│   ├── certs/                       # TLS certificates
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx                  # Router + auth guards
│   │   ├── pages/                   # 16 page components
│   │   ├── components/              # Reusable UI components
│   │   ├── contexts/                # React context (AuthContext)
│   │   ├── hooks/                   # Custom hooks
│   │   ├── services/api.js          # Axios API client
│   │   └── utils/crypto.js          # Client-side RSA encryption
│   ├── package.json
│   └── vite.config.js
├── nginx/nginx.conf                 # Nginx reverse proxy config
├── start.sh                         # Start script
├── stop.sh                          # Stop script
└── ARCHITECTURE.md                  # Architecture documentation
```

---

## Testing

```bash
cd backend
source venv/bin/activate
pytest tests/ -v
```

The test suite covers unit tests (auth, TOTP, sanitization), integration tests (security headers, CORS, rate limiting), and regression tests.

---

## Milestones

- [x] **M1** (Feb 13): Stack finalized, HTTPS configured, skeleton deployed
- [x] **M2** (Feb 27): Auth, TOTP, profiles, encrypted resume, admin dashboard
- [x] **M3** (Mar 31): Companies, jobs, applications, E2E messaging, audit logs
- [x] **Final** (Apr 30): Full PKI, virtual keyboard TOTP, tamper-evident logs, defense demo
