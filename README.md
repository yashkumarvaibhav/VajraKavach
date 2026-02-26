# VajraKavach

**Secure Job Search & Professional Networking Platform**

CSE 345/545 — Foundations to Computer Security | Course Project

## Overview

VajraKavach is a full-stack web application providing end-to-end security for professional networking, job search, resume sharing, and messaging. Built with security as a first-class requirement.

## Tech Stack

| Component   | Technology            |
|-------------|----------------------|
| Backend     | Python / FastAPI      |
| Frontend    | React 18 (Vite)      |
| Database    | PostgreSQL            |
| Web Server  | Nginx (HTTPS/TLS)    |
| Auth        | JWT + TOTP (pyotp)   |
| Encryption  | Fernet (AES) + RSA   |
| Passwords   | Argon2id             |

## Security Features

- **TOTP 2FA** with virtual keyboard (randomized) for high-risk actions
- **PKI** — message signing, resume integrity verification, self-signed TLS
- **E2E Encryption** — messages encrypted client-side with recipient's RSA public key
- **Encrypted Resume Storage** — Fernet (AES-128-CBC + HMAC-SHA256) at rest
- **Tamper-Evident Audit Logs** — SHA-256 hash-chained entries
- **RBAC** — User / Recruiter / Admin roles
- **Defense**: SQL injection (ORM), XSS (React + CSP), CSRF (SameSite), rate limiting, security headers

## Quick Start

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# Set up PostgreSQL and update .env
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### API Docs
Visit `http://localhost:8000/api/docs` after starting the backend.

## Project Structure

See [ARCHITECTURE.md](ARCHITECTURE.md) for full architecture documentation.

## Development Log

See [DEV_LOG.md](DEV_LOG.md) for detailed session-by-session progress tracking.

## Milestones

- [x] **M1** (Feb 13): Stack finalized, HTTPS configured, skeleton deployed
- [ ] **M2** (Feb 27): Auth, TOTP, profiles, encrypted resume, admin dashboard
- [ ] **M3** (Mar 31): Companies, jobs, applications, E2E messaging, audit logs
- [ ] **Final** (Apr 30): Full PKI, virtual keyboard TOTP, tamper-evident logs, defense demo