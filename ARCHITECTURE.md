# VajraKavach — Architecture Document

## Overview

**VajraKavach** is a Secure Job Search & Professional Networking Platform built for CSE 345/545 (Foundations to Computer Security). It provides end-to-end security for professional interactions, private messaging, resume sharing, and job application workflows.

## Technology Stack

| Layer       | Technology                |
|-------------|---------------------------|
| OS          | Ubuntu (VM)               |
| Database    | PostgreSQL                |
| Web Server  | Nginx (HTTPS/TLS)         |
| Backend     | Python 3.10+ / FastAPI    |
| Frontend    | React 18 (Vite)           |
| Auth        | JWT + TOTP (pyotp)        |
| Encryption  | Fernet (AES-128-CBC) + RSA (PKI) |
| Passwords   | Argon2 (via passlib)      |

## Directory Structure

```
vajrakavach-v01/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                 # FastAPI application entry
│   │   ├── config.py               # Pydantic Settings
│   │   ├── database.py             # SQLAlchemy async engine + session
│   │   ├── dependencies.py         # Auth dependency injection
│   │   ├── models/                 # SQLAlchemy ORM models
│   │   │   ├── user.py
│   │   │   ├── company.py
│   │   │   ├── job.py
│   │   │   ├── application.py
│   │   │   ├── message.py
│   │   │   ├── resume.py
│   │   │   ├── connection.py
│   │   │   └── audit.py
│   │   ├── schemas/                # Pydantic request/response schemas
│   │   │   ├── user.py
│   │   │   ├── auth.py
│   │   │   ├── company.py
│   │   │   ├── job.py
│   │   │   ├── message.py
│   │   │   └── resume.py
│   │   ├── routes/                 # API endpoints
│   │   │   ├── auth.py
│   │   │   ├── users.py
│   │   │   ├── companies.py
│   │   │   ├── jobs.py
│   │   │   ├── applications.py
│   │   │   ├── messages.py
│   │   │   ├── resumes.py
│   │   │   └── admin.py
│   │   ├── services/               # Business & security logic
│   │   │   ├── auth_service.py
│   │   │   ├── totp_service.py
│   │   │   ├── encryption_service.py
│   │   │   ├── pki_service.py
│   │   │   ├── audit_service.py
│   │   │   └── resume_service.py
│   │   └── middleware/
│   │       ├── security.py         # CSRF, rate-limit, headers
│   │       └── audit.py            # Request audit logging
│   ├── certs/                      # TLS & PKI certificates
│   ├── uploads/                    # Encrypted resume storage
│   ├── requirements.txt
│   └── .env.example
├── frontend/                       # React (Vite) SPA
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── contexts/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
├── nginx/
│   └── nginx.conf
├── project-details.md
├── ARCHITECTURE.md
├── DEV_LOG.md
└── README.md
```

## Security Architecture

### 1. Authentication Flow
```
User → Register (email, password, phone)
     → Password hashed with Argon2id (salt auto-generated)
     → TOTP secret generated, QR code returned
     → Login: email + password → JWT issued (short-lived access + refresh)
     → TOTP required after login for session activation
     → High-risk actions require fresh TOTP via virtual keyboard
```

### 2. Role-Based Access Control (RBAC)
| Role              | Permissions |
|-------------------|-------------|
| `user`            | Profile, apply, message, resume upload |
| `recruiter`       | Company pages, job postings, view applicants |
| `admin`           | Full platform management, audit logs |

### 3. Encryption Strategy
- **Passwords**: Argon2id (passlib)
- **Resumes at rest**: Fernet symmetric encryption (AES-128-CBC + HMAC)
- **E2E Messaging**: RSA key pairs per user; messages encrypted with recipient's public key
- **PKI Functions**: (1) Message signing/verification, (2) Resume integrity (digital signatures)

### 4. Tamper-Evident Audit Logging
- Every critical action (auth, job changes, status updates, admin actions) creates an audit entry
- Each log entry includes a SHA-256 hash of `(previous_hash + current_entry_data)`
- Hash-chain structure ensures any tampering is detectable

### 5. Defense Mechanisms
| Attack            | Defense |
|-------------------|---------|
| SQL Injection     | SQLAlchemy ORM (parameterized queries) |
| XSS               | React auto-escaping + CSP headers |
| CSRF              | SameSite cookies + CSRF tokens |
| Session Fixation  | New session ID on login |
| Session Hijacking | HttpOnly + Secure cookies, short JWT TTL |

## API Design (RESTful)

| Method | Endpoint                     | Description               |
|--------|------------------------------|---------------------------|
| POST   | /api/auth/register           | User registration         |
| POST   | /api/auth/login              | Login (returns JWT)       |
| POST   | /api/auth/verify-totp        | TOTP verification         |
| GET    | /api/users/me                | Current user profile      |
| PUT    | /api/users/me                | Update profile            |
| POST   | /api/resumes/upload          | Upload encrypted resume   |
| GET    | /api/resumes/{id}/download   | Download (access-controlled) |
| POST   | /api/companies               | Create company page       |
| POST   | /api/jobs                    | Post a job listing        |
| GET    | /api/jobs/search             | Search jobs               |
| POST   | /api/applications            | Apply to a job            |
| POST   | /api/messages                | Send encrypted message    |
| GET    | /api/admin/users             | Admin: list all users     |
| GET    | /api/admin/audit-logs        | Admin: view audit logs    |

## Database Schema (Key Tables)

- **users**: id, email, hashed_password, full_name, role, totp_secret, public_key, is_active, ...
- **user_profiles**: user_id FK, headline, location, education, experience, skills, bio, privacy_settings
- **connections**: id, requester_id FK, addressee_id FK, status (pending/accepted/rejected)
- **companies**: id, name, description, location, website, admin_id FK
- **jobs**: id, company_id FK, title, description, skills, location_type, salary_range, deadline
- **applications**: id, job_id FK, user_id FK, resume_id FK, cover_note, status
- **resumes**: id, user_id FK, filename, encrypted_path, file_hash, uploaded_at
- **messages**: id, sender_id FK, recipient_id FK, conversation_id, ciphertext, signature, timestamp
- **audit_logs**: id, user_id, action, resource, details, ip_address, hash, previous_hash, timestamp
