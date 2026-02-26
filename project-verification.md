# VajraKavach — Project Requirements Verification Report

**Date:** February 26, 2026  
**Codebase:** `/home/iiitd/Desktop/vajrakavach-v01`

---

## Overall Summary

| Category | Satisfied | Partially Satisfied | Not Satisfied |
|----------|:---------:|:-------------------:|:-------------:|
| A. User Profiles & Connections (5) | 5 | 0 | 0 |
| B. Company Pages & Job Posting (3) | 2 | 1 | 0 |
| C. Job Search & Application Tracking (4) | 2 | 2 | 0 |
| D. Secure Resume Upload & Storage (4) | 4 | 0 | 0 |
| E. Secure Messaging (4) | 2 | 0 | 2 |
| F. Authentication & Account Security (3) | 2 | 1 | 0 |
| G. Admin & Moderation (3) | 2 | 1 | 0 |
| H. Security Mandates (14) | 12 | 2 | 0 |
| Section 3 — User Roles (12) | 10 | 2 | 0 |
| Section 4 — Tech Stack (5) | 5 | 0 | 0 |
| Section 5 — Milestones (15) | 13 | 2 | 0 |
| Section 6 — Bonus (2) | 0 | 0 | 2 |
| **TOTAL (74)** | **59** | **11** | **4** |

---

## Section 2A — User Profiles and Connections

### A1. Users can create and edit profiles (name, headline, location, education, experience, skills, profile picture, bio)

**Status: ✅ SATISFIED**

All required fields are present in the backend model and editable from the frontend:

| Field | Backend Model | Frontend Edit |
|-------|--------------|---------------|
| Name | `full_name` on `User` model — `backend/app/models/user.py` | Text input on `ProfilePage.jsx` |
| Headline | `headline` on `UserProfile` — `backend/app/models/user.py` L70 | Editable input on `ProfilePage.jsx` |
| Location | `location` on `UserProfile` — `backend/app/models/user.py` L71 | Editable input on `ProfilePage.jsx` |
| Education | `education` JSON on `UserProfile` — `backend/app/models/user.py` L74 | Full CRUD (institution, degree, field, years, grade) on `ProfilePage.jsx` |
| Experience | `experience` JSON on `UserProfile` — `backend/app/models/user.py` L75 | Full CRUD (company, title, location, dates, description) on `ProfilePage.jsx` |
| Skills | `skills` JSON on `UserProfile` — `backend/app/models/user.py` L76 | Comma-separated input on `ProfilePage.jsx` |
| Profile Picture | `profile_picture_url` on `UserProfile` — `backend/app/models/user.py` L77 | File upload with `POST /api/users/me/profile-picture` on `ProfilePage.jsx` |
| Bio | `bio` on `UserProfile` — `backend/app/models/user.py` L72 | Editable textarea on `ProfilePage.jsx` |

Backend routes: `GET /api/users/me/profile`, `PUT /api/users/me/profile`, `POST /api/users/me/profile-picture`.

---

### A2. Field-level privacy controls (Public, Connections-only, Private)

**Status: ✅ SATISFIED**

- **Model:** `PrivacyLevel` enum defines `PUBLIC`, `CONNECTIONS`, `PRIVATE` at `backend/app/models/user.py` L61-64. `UserProfile.privacy_settings` JSON column stores per-field levels (L80-89).
- **Schema:** `UserProfileUpdate.privacy_settings: Optional[Dict[str, str]]` in `backend/app/schemas/user.py` L43.
- **Backend enforcement:** `view_user_profile` route at `backend/app/routes/users.py` L393-413 iterates privacy settings and nullifies fields — `"private"` hidden from non-owners, `"connections"` hidden from non-connected users.
- **Frontend:** `PrivacySelect` component on `ProfilePage.jsx` renders a dropdown (Public/Connections Only/Private) for each field (headline, bio, location, education, experience, skills).

---

### A3. Users can send, accept, and remove professional connection requests

**Status: ✅ SATISFIED**

- **Model:** `Connection` with `ConnectionStatus` enum (`PENDING`, `ACCEPTED`, `REJECTED`) and `requester_id`/`addressee_id` at `backend/app/models/connection.py`.
- **Backend routes** (all in `backend/app/routes/users.py`):
  - **Send:** `POST /connections` (L472) — creates pending request, prevents self-connect and duplicates.
  - **Accept:** `PUT /connections/{id}/accept` (L510) — changes status to ACCEPTED, only addressee can accept.
  - **Remove:** `DELETE /connections/{id}` (L528) — deletes connection record (works for requester or addressee).
  - **List:** `GET /connections`, `GET /connections/pending`, `GET /connections/sent` (L545-590).
- **Frontend:** `ConnectionsPage.jsx` — Tabbed UI (Connections, Pending, Sent, Find People, Network) with `sendRequest()`, `respondRequest()` (accept/decline), `removeConnection()`, `cancelRequestFromSearch()`.

---

### A4. Users can view a limited connection graph restricted to their connections

**Status: ✅ SATISFIED**

- **Backend:** `GET /connections/graph` at `backend/app/routes/users.py` L598-649 returns nodes (current user + accepted connections only) and edges (direct connections + mutual connections between user's connections). Graph is explicitly restricted to the user's connections.
- **Frontend:** `NetworkGraph` component in `ConnectionsPage.jsx` L8-197 implements a force-directed SVG graph visualization with center node, connection nodes, hover tooltips (name, role, mutual count), click-to-navigate to profiles. "Network" tab triggers `fetchGraph()`.

---

### A5. Profile viewer count and recent viewers list with opt-out privacy controls

**Status: ✅ SATISFIED**

- **Model:** `ProfileView` at `backend/app/models/user.py` L100-114 tracks `profile_user_id`, `viewer_id`, `visit_count`, `viewed_at`. `UserProfile.show_viewers` (boolean, default `True`) at L93-94.
- **Backend:**
  - **View tracking:** `view_user_profile` at `backend/app/routes/users.py` L345-373 upserts ProfileView with 30-second deduplication cooldown.
  - **View count:** Computed from `sum(ProfileView.visit_count)` at L249-253.
  - **Recent viewers:** `GET /me/profile/viewers` at L419-461 returns 20 most recent viewers. Returns empty list if `show_viewers` is disabled.
  - **Privacy:** View count hidden from visitors (set to `0` in response at L400).
- **Frontend:** `ProfilePage.jsx` — Displays total view count in header. "Profile Viewers" section with toggle button (opt-out) including confirmation dialog with mutual visibility disclaimer.

---

## Section 2B — Company Pages and Job Posting

### B1. Recruiters can create company pages (name, description, location, website)

**Status: ✅ SATISFIED**

- **Model:** `backend/app/models/company.py` L17-22 — `name`, `description`, `location`, `website`, `admin_id` (FK to users).
- **Role restriction:** `backend/app/routes/companies.py` L31 — `require_role("recruiter", "admin")` on `POST /api/companies/`.
- **Schema:** `CompanyCreate` requires all four fields with length constraints.
- **Full CRUD:** create (L25), search (L67), list (L96), get (L131), update (L155), delete (L218).
- **Frontend:** `CompanyPage.jsx` L308-348 — Create form with all four fields, only shown to recruiters.

---

### B2. Companies can post job listings (title, description, required skills, location, salary range, deadline)

**Status: ⚠️ PARTIALLY SATISFIED**

- **Model:** `backend/app/models/job.py` L34-49 — `title`, `description`, `required_skills` (JSON), `location`, `location_type` (remote/onsite/hybrid), `salary_min`/`salary_max` (nullable), `application_deadline` (nullable Date) — all present.
- **Route:** `POST /api/jobs/` at `backend/app/routes/jobs.py` L51-56 — restricted to recruiter/admin; all schema fields flow into Job model.
- **Frontend gap:** `CompanyPage.jsx` L575-654 — Job posting modal includes title, description, location, salary, job_type, location_type, deadline — but **no `required_skills` input field**. Backend supports it but frontend never collects or sends it.

**Deficiency:** `required_skills` field cannot be set through the UI.

---

### B3. Company administrators can manage jobs, view applicants, and message candidates

**Status: ✅ SATISFIED**

- **Edit/Delete jobs:** `PUT /api/jobs/{job_id}` and `DELETE /api/jobs/{job_id}` at `backend/app/routes/jobs.py` L193-264 — both verify company admin ownership. Frontend: Edit and Delete buttons on "My Job Postings" tab.
- **View applicants:** `GET /api/applications/job/{job_id}` at `backend/app/routes/applications.py` L134-155 — recruiter/admin only, verifies company ownership. Frontend: expandable applicant panel per job on `CompanyPage.jsx`.
- **Message candidates:** "Message" button in `CompanyPage.jsx` L500-503 navigates to `/messages?newConv=${app.user_id}`.

---

## Section 2C — Job Search and Application Tracking

### C1. Job search by keywords, company, location, skill tags, and filters (remote, internship, full-time)

**Status: ⚠️ PARTIALLY SATISFIED**

- **Backend search params:** `backend/app/routes/jobs.py` L125-133 — accepts `keyword`, `company`, `location`, `location_type`, `job_type`, `skills` query parameters.
- **Backend bug:** The `skills` parameter is accepted but **silently ignored** — no filtering logic applies it to the query (L136-157).
- **Frontend gap:** `JobsPage.jsx` L36-39 — Only a single keyword input is exposed. `fetchJobs()` only sends `keyword`. **No UI controls** for company, location, skill tags, location_type, or job_type filters.

**Deficiencies:**
1. Backend: `skills` filter parameter accepted but never applied.
2. Frontend: Only keyword search exposed; no filter controls for company, location, skills, remote/internship/full-time.

---

### C2. Users can apply to jobs by submitting a resume and a short cover note

**Status: ✅ SATISFIED**

- **Model:** `backend/app/models/application.py` L27-33 — `resume_id` (FK, nullable), `cover_note` (Text, nullable).
- **Route:** `POST /api/applications/` at `backend/app/routes/applications.py` L72-104 — validates job is active, prevents duplicate applications.
- **Schema:** `ApplicationCreate` with `job_id`, `resume_id` (optional), `cover_note` (optional, max 2000 chars).
- **Frontend:** `JobsPage.jsx` L152-188 — Apply flow with resume dropdown selector and cover letter textarea.

---

### C3. Application status tracking: Applied, Reviewed, Interviewed, Rejected, Offer

**Status: ⚠️ PARTIALLY SATISFIED**

- **Backend enum:** `backend/app/models/application.py` L14-20 — `ApplicationStatus` enum with exactly `APPLIED`, `REVIEWED`, `INTERVIEWED`, `REJECTED`, `OFFER` — matches requirement perfectly.
- **Recruiter view (correct):** `CompanyPage.jsx` L10-16 — `STATUS_OPTIONS` uses correct values: `applied`, `reviewed`, `interviewed`, `offer`, `rejected`.
- **User view (bug):** `ApplicationsPage.jsx` L8-14 — `STATUS_COLORS` mapping uses **wrong keys**: `pending`, `reviewed`, `shortlisted`, `accepted`, `rejected`. Only `reviewed` and `rejected` match the backend enum. The statuses `applied`, `interviewed`, and `offer` lack color styling and fall to default gray.

**Deficiency:** `ApplicationsPage.jsx` `STATUS_COLORS` keys mismatch backend enum — 3 of 5 statuses get wrong/missing color-coding on the user-facing page.

---

### C4. Recruiters can shortlist candidates, add notes, and update application status

**Status: ✅ SATISFIED**

- **Status update route:** `PUT /api/applications/{id}/status` at `backend/app/routes/applications.py` L157-195 — recruiter/admin only; verifies company ownership; accepts `status` and `recruiter_notes`.
- **Notes field:** `backend/app/models/application.py` L33 — `recruiter_notes = Column(Text, nullable=True)`.
- **Frontend:** `CompanyPage.jsx` L521-537 — Status dropdown with all 5 options; "Notes" button to add/edit recruiter notes via prompt; existing notes displayed.

---

## Section 2D — Secure Resume Upload and Storage

### D1. Resume upload in PDF or DOCX format

**Status: ✅ SATISFIED**

- **Backend validation:** `backend/app/services/resume_service.py` L14-18 — `ALLOWED_MIME_TYPES` = `application/pdf` and DOCX MIME. Raises `ValueError` on invalid type. Max 10 MB.
- **Route:** `POST /api/resumes/upload` at `backend/app/routes/resumes.py` L38-44.
- **Frontend:** `ResumePage.jsx` L41-47 — Client-side validation for PDF/DOC/DOCX; file input accepts `.pdf,.doc,.docx`; 5 MB client limit.

---

### D2. All resumes must be encrypted at rest

**Status: ✅ SATISFIED**

- **Encryption service:** `backend/app/services/encryption_service.py` L1-46 — Fernet encryption (AES-128-CBC + HMAC-SHA256). Stable key from `.env`.
- **Resume encryption:** `backend/app/services/resume_service.py` L38-51 — Content encrypted with `encrypt_data(content)` before writing to disk. Saved as `{uuid}.enc` files.
- **Decryption only in-memory:** `resume_service.py` L66-69 — `read_decrypted_resume()` decrypts in-memory only on download.
- **Integrity:** SHA-256 hash (L36) + PKI digital signature (L54) stored in DB.

---

### D3. Strict access control: owner, authorized recruiters, and admins only

**Status: ✅ SATISFIED**

- **Download route:** `backend/app/routes/resumes.py` L107-158 — Three-tier access:
  - **Owner:** `resume.user_id == current_user.id`
  - **Admin:** `current_user.role.value == "admin"`
  - **Authorized recruiter:** Must own a company that posted a job to which the resume owner applied with that specific resume (tight application-scoped check at L135-147).
- **Deny if none match:** Returns 403 "Access denied" (L149).
- **TOTP required:** Every download requires TOTP verification (L122-127).
- **Audit logging:** Every download logged (L155-162).

---

### D4. Uploaded resumes must be treated as sensitive assets

**Status: ✅ SATISFIED**

| Control | Evidence |
|---------|---------|
| Encrypted at rest | Fernet AES encryption — `encryption_service.py` |
| TOTP for download | `resumes.py` L122-127 |
| TOTP for deletion | `resumes.py` L238-241 |
| Integrity hash | SHA-256 stored in DB — `resume_service.py` L36 |
| PKI digital signature | `resume_service.py` L53-55, verification at `resumes.py` L176-217 |
| Strict access control | Owner/authorized-recruiter/admin only |
| Audit trail | Upload, download, and delete all logged |

---

## Section 2E — Secure Messaging

### E1. One-to-one and small group messaging

**Status: ✅ SATISFIED**

- **Model:** `backend/app/models/message.py` L14-26 — `Conversation` with `is_group` flag, `ConversationMember` for group membership, `Message` with `sender_id`/`recipient_id`.
- **Backend:** `backend/app/routes/messages.py` L76-140 — `send_message` supports both 1-to-1 (via `recipient_id`) and group (via `conversation_id`). Group endpoints at L444-516 implement create group, list members, add/remove members.
- **Frontend:** `MessagesPage.jsx` — Full conversation list, DM and group chat UIs, group creation modal with member selection from connections.

---

### E2. End-to-end encryption (E2EE) for private conversations

**Status: ❌ NOT SATISFIED**

- **Backend PKI infrastructure exists:** `backend/app/services/pki_service.py` L89-110 provides `encrypt_with_public_key`/`decrypt_with_private_key` (RSA-OAEP). User RSA key pairs generated at registration. Public key exchange endpoint exists at `messages.py` L352-366.
- **Frontend sends plaintext:** `MessagesPage.jsx` L88-90 sends raw plaintext as `ciphertext`:
  ```js
  const payload = { ciphertext: newMessage.trim() };
  ```
  There is **no** client-side encrypt/decrypt logic anywhere in the frontend — no `forge`, `subtle`, `crypto`, RSA, or AES operations. The `ciphertext` field receives plaintext.
- The "End-to-end encrypted" label in the chat header is **cosmetic only**.

**Deficiency:** PKI infrastructure exists but is not wired into the actual message send/receive flow. Messages are sent and stored as plaintext.

---

### E3. Server must store only ciphertext for E2EE chats

**Status: ❌ NOT SATISFIED**

- The `Message` model column is named `ciphertext` (`backend/app/models/message.py` L57), and the docstring says "Server stores ONLY ciphertext." However, the frontend sends **plaintext** in that field (see E2). The database stores plaintext despite the column name.
- The server never encrypts message content for E2E messages (`is_server_encrypted=False` at `messages.py` L131).

**Deficiency:** Direct consequence of E2 — plaintext is stored in the `ciphertext` column.

---

### E4. Optional server-side encrypted messaging for non-sensitive announcements

**Status: ✅ SATISFIED**

- **Model:** `backend/app/models/announcement.py` — stores `title_encrypted` and `content_encrypted` (Fernet-encrypted).
- **Route:** `backend/app/routes/messages.py` L586-651 — `create_announcement` encrypts title/content with `encrypt_data()` (Fernet/AES), stores ciphertext. `list_announcements` decrypts on-the-fly.
- **Frontend:** `AdminDashboard.jsx` L490 correctly labels announcements as "server-side encrypted (AES/Fernet)."

---

## Section 2F — Authentication and Account Security

### F1. Secure user registration and login

**Status: ✅ SATISFIED**

- **Registration:** `backend/app/routes/auth.py` L35-96 — validates email uniqueness, hashes password with Argon2id, generates TOTP secret + RSA key pair.
- **Password hashing:** `backend/app/services/auth_service.py` L12-13 — `CryptContext(schemes=["argon2"])` (Argon2id).
- **JWT tokens:** `auth_service.py` L27-47 — short-lived access tokens (30 min) and long-lived refresh tokens (7 days) using `python-jose` HS256.
- **Login:** `auth.py` L136-180 — verifies password, checks account status (active/suspended), returns JWT with `totp_verified: False`.
- **Admin self-registration blocked:** `auth.py` L52 prevents admin role in public registration.

---

### F2. Essential TOTP verification after login

**Status: ✅ SATISFIED**

- **Login returns `totp_required: True`:** `auth.py` L173 — every login response sets `totp_required=True` and `totp_verified=False` in the JWT.
- **Enforcement:** `backend/app/dependencies.py` L38-43 — all protected endpoints check `totp_verified` in JWT; if `False`, returns 403 "TOTP verification required."
- **Separate pre-TOTP dependency:** `get_current_user_pre_totp` (L58-77) exists only for the `/verify-totp` endpoint itself.
- **Frontend:** `AuthContext.jsx` L39-55 — login sets `totpRequired=true`, redirecting to TOTP verification screen before granting app access.
- TOTP is **mandatory**, not optional.

---

### F3. TOTP-based verification for high-risk actions

**Status: ⚠️ PARTIALLY SATISFIED**

Actions requiring explicit TOTP re-verification:

| Action | Location |
|--------|---------|
| Post-login TOTP | `auth.py` L183-L222 |
| Password change | `auth.py` L271-L289 |
| Forgot password reset | `auth.py` L310-L352 |
| Resume download | `resumes.py` L120-L130 |
| Resume delete | `resumes.py` L233-L241 |
| Admin dashboard access | `AdminDashboard.jsx` L30-38 |

Actions **without** additional TOTP (beyond session-level):
- **Account deletion (self):** No self-deletion endpoint exists at all.
- **Admin delete/suspend user:** Relies only on `require_role("admin")` (session JWT `totp_verified`), no re-prompt.

**Deficiency:** No user-facing account deletion feature exists. Admin user management actions lack TOTP re-verification at action time.

---

## Section 2G — Admin and Moderation

### G1. Admin dashboard to view and manage all users

**Status: ✅ SATISFIED**

- **Backend:** `GET /api/admin/users` at `backend/app/routes/admin.py` L40-82 — lists all users with pagination, role filter, last IP. `GET /api/admin/dashboard` (L393-413) returns aggregate stats.
- **Frontend:** `AdminDashboard.jsx` — Tabbed UI: Overview (stats), Users (searchable table with name/email/role/status/IP/actions), Jobs, Resumes, Announcements, Audit Logs.

---

### G2. Admins can suspend or delete accounts

**Status: ✅ SATISFIED**

- **Suspend:** `PUT /api/admin/users/{user_id}/suspend` at `admin.py` L87-112 — sets `is_suspended=True`, `is_active=False`. Reactivation at L115-136.
- **Delete:** `DELETE /api/admin/users/{user_id}` at `admin.py` L139-182 — permanent deletion. Self-deletion/self-suspension prevented.
- **Login blocked:** `auth.py` L162 — `is_suspended` check returns 403 at login.
- **Frontend:** `AdminDashboard.jsx` L131-151 — Suspend/Activate and Delete buttons per user row.

---

### G3. Role-Based Access Control (RBAC): Regular User, Recruiter, Platform Admin

**Status: ✅ SATISFIED**

- **Enum:** `backend/app/models/user.py` L16-19 — `UserRole` with `USER`, `RECRUITER`, `ADMIN`.
- **Enforcement:** `backend/app/dependencies.py` L82-90 — `require_role()` checks `current_user.role.value`; returns 403 if unauthorized.
- **Admin routes** all use `Depends(require_role("admin"))`.
- **Recruiter routes:** Company/job creation restricted to recruiters. Resume download verifies recruiter posted a job the applicant applied to.
- **Admin creation:** Blocked from public registration (`auth.py` L52); only via `POST /api/admin/create-admin` or promote.

---

## Section 2H — Security Mandates

### H-PKI-1. All traffic must use HTTPS (TLS)

**Status: ⚠️ PARTIALLY SATISFIED**

| Evidence | Location |
|----------|---------|
| Vite dev server uses `basicSsl()` plugin + `https: true` | `frontend/vite.config.js` L3-8 |
| Nginx redirects HTTP→HTTPS, listens on 443 with TLS 1.2/1.3 | `nginx/nginx.conf` L17-31 |
| HSTS header set (`max-age=31536000`) | `nginx.conf` L38, `backend/app/middleware/security.py` L35 |
| Self-signed TLS cert auto-generated at startup | `backend/app/main.py` L49-59 via `pki_service.py` L137-176 |

**Deficiency:** `start.sh` launches uvicorn on plain HTTP (port 8000) and advertises `http://` URLs. In a dev setup through Nginx this works; the backend itself doesn't bind TLS.

---

### H-PKI-2. At least two functions must use PKI

**Status: ✅ SATISFIED**

| PKI Function | Location |
|-------------|---------|
| **1. Resume digital signing** — `sign_data()` signs resume content with server RSA private key on upload | `resume_service.py` L55-57 |
| **2. Resume integrity verification** — `verify_signature()` verifies resume signature with server certificate | `resumes.py` L192-220 |
| **3. Message signing** — Messages store a `signature` field (PKI-based) | `message.py` L55, `messages.py` L130 |
| **4. User RSA key pair generation** at registration | `auth.py` L57 |
| **5. Public key retrieval** endpoint for E2E encryption | `messages.py` L319-333 |
| **6. Self-signed TLS certificate generation** | `pki_service.py` L137-176 |

Well beyond the two-function minimum.

---

### H-TOTP-1. TOTP entry via virtual keyboard for at least two high-risk actions

**Status: ✅ SATISFIED**

| Action | Frontend VirtualKeyboard | Backend TOTP Check |
|--------|------------------------|--------------------|
| Password reset (forgot password) | `ForgotPasswordPage.jsx` L152 | `auth.py` L330 |
| Resume download | `ResumePage.jsx` L201 | `resumes.py` L129 |
| Password change | `SecurityPage.jsx` L182 | `auth.py` L281 |
| Admin panel access | `AdminDashboard.jsx` L214 | Admin verification |
| TOTP verification (login) | `TOTPVerifyPage.jsx` L112 | `auth.py` L203 |
| Registration TOTP setup | `RegisterPage.jsx` L138 | `auth.py` L118 |

`VirtualKeyboard.jsx` component randomizes digit layout to prevent keylogging. Used in 6+ pages.

---

### H-LOG-1. Log all critical actions

**Status: ✅ SATISFIED**

`create_audit_log()` is called across all route files:

| Category | Actions Logged |
|----------|---------------|
| **Authentication** (`auth.py`) | `user.register`, `user.login`, `user.login_failed`, `user.totp_verified`, `user.totp_failed`, `user.password_change`, `user.forgot_password_reset` |
| **Job posting** (`jobs.py`) | `job.create`, `job.update`, `job.delete` |
| **Applications** (`applications.py`) | `application.submit`, `application.status_update`, `application.withdraw` |
| **Admin moderation** (`admin.py`) | `admin.suspend_user`, `admin.reactivate_user`, `admin.delete_user`, `admin.create_admin` |
| **Messaging** (`messages.py`) | `message.send`, `group.create`, announcements |
| **Resumes** (`resumes.py`) | `resume.upload`, `resume.download`, `resume.delete` |
| **Users** (`users.py`) | `user.account_update`, `user.profile_update` |
| **Companies** (`companies.py`) | `company.create`, `company.update`, `company.delete` |

Additionally, `AuditMiddleware` (`backend/app/middleware/audit.py`) logs every HTTP request at the middleware layer.

---

### H-LOG-2. Logs must be tamper-evident using hash chaining or private blockchain

**Status: ✅ SATISFIED**

- **Model:** `AuditLog` has `entry_hash` (SHA-256) and `previous_hash` columns — `backend/app/models/audit.py` L27-28.
- **Hash chaining:** `_compute_entry_hash()` chains: `SHA256(previous_hash|action|user_id|...)` — `backend/app/services/audit_service.py` L18-31.
- **Genesis hash:** `"0" * 64` for the first entry (L16).
- **Chain verification:** `verify_audit_chain()` validates entire chain integrity (L87-116).
- **Admin endpoint:** `GET /admin/audit-logs/verify-integrity` exposed in `admin.py` L356-361.
- **Frontend:** Admin dashboard shows per-entry integrity status (Valid/Tampered).

---

### H-ATK-1. Protection against SQL injection

**Status: ✅ SATISFIED**

- All database queries use SQLAlchemy ORM with parameterized `select().where()`.
- No raw SQL (`text()`) found anywhere in application code.
- Consistent ORM usage across all route files.

---

### H-ATK-2. Protection against XSS

**Status: ✅ SATISFIED**

- No `dangerouslySetInnerHTML` or `innerHTML` usage in any frontend component.
- React's default JSX escaping handles output encoding.
- Security headers: `X-Content-Type-Options: nosniff`, `X-XSS-Protection: 1; mode=block` — `backend/app/middleware/security.py` L22-23.
- `Content-Security-Policy` header set — `security.py` L26-32.
- Nginx also adds `X-XSS-Protection` header — `nginx.conf` L37.

---

### H-ATK-3. Protection against CSRF

**Status: ✅ SATISFIED**

- API uses Bearer JWT tokens (not cookies) for auth — inherently CSRF-resistant.
- Tokens stored in `localStorage`, sent via `Authorization` header — `frontend/src/services/api.js` L12-18.
- CORS configured with specific origin whitelist (not `*`) — `backend/app/main.py` L93-98.
- No cookie-based session auth used.

---

### H-ATK-4. Protection against session fixation

**Status: ✅ SATISFIED**

- Login issues new JWT tokens (access + refresh) on each login — `auth.py` L169-172.
- TOTP verification issues **new** tokens with `totp_verified=True` — `auth.py` L215-224.
- Purely stateless JWT — no server-side session IDs that could be fixated.

---

### H-ATK-5. Protection against session hijacking

**Status: ⚠️ PARTIALLY SATISFIED**

| Control | Status |
|---------|--------|
| Short-lived access tokens (30 min) | ✅ Present — `config.py` L18 |
| Refresh tokens (7 days) | ✅ Present — `config.py` L19 |
| HSTS enforced | ✅ Present — `security.py` L35, `nginx.conf` L38 |
| Rate limiting (60 req/min per IP) | ✅ Present — `security.py` L62 |
| IP binding in JWT | ❌ Missing — JWT has no IP claim |
| httpOnly secure cookies | ❌ Not applicable — tokens in `localStorage` |

**Deficiency:** Tokens stored in `localStorage` (vulnerable to XSS-based theft, though XSS is well-mitigated). No IP binding of sessions.

---

### H-DATA-1. Passwords hashed and salted (bcrypt or Argon2)

**Status: ✅ SATISFIED**

- `CryptContext(schemes=["argon2"])` — Argon2id hashing — `backend/app/services/auth_service.py` L13.
- `hash_password()` called at registration, password change, and forgot-password reset.
- Argon2 includes automatic salting.

---

### H-DATA-2. Plaintext passwords never stored

**Status: ✅ SATISFIED**

- User model stores `hashed_password` (String(512)) — no plaintext column — `backend/app/models/user.py` L28.
- All password storage paths hash before persisting.
- No plaintext password storage found anywhere in codebase.

---

### H-DATA-3. Sensitive documents encrypted with strict access control

**Status: ✅ SATISFIED**

- Resumes encrypted with Fernet (AES-128-CBC + HMAC-SHA256) before disk write.
- Download requires TOTP + role-based access (owner/admin/authorized recruiter).
- Digital signature for integrity verification.
- (Already covered in detail under D2, D3, D4.)

---

### H-SCALE-1. Multiple concurrent users without compromising security

**Status: ✅ SATISFIED**

| Control | Evidence |
|---------|---------|
| Async FastAPI | All route handlers are `async` |
| Async SQLAlchemy | `AsyncSession` — `backend/app/database.py` L6-11 |
| Connection pooling | `pool_size=20, max_overflow=10, pool_pre_ping=True` — `database.py` L11-14 |
| Session isolation | Each request gets own `AsyncSession` with commit/rollback/close |
| Stateless JWT | No server-side session state contention |
| Per-IP rate limiting | 60 req/min — `security.py` L62-90 |

---

## Section 3 — User Roles

### 3A. Regular Users (Job Seekers)

| # | Requirement | Status | How Satisfied |
|---|-------------|--------|---------------|
| 1 | Sign up and log in using TOTP | ✅ SATISFIED | Registration generates TOTP secret + QR code (`auth.py` L57). Login requires TOTP step (`TOTPVerifyPage.jsx`). VirtualKeyboard used for entry. |
| 2 | Manage profiles and privacy settings | ✅ SATISFIED | `ProfilePage.jsx` — Full editing of all fields. Per-field privacy dropdowns (Public/Connections/Private). |
| 3 | Upload resumes and apply for jobs | ✅ SATISFIED | `ResumePage.jsx` — Upload with encryption. `JobsPage.jsx` — Apply with resume selection + cover letter. |
| 4 | Track application status | ✅ SATISFIED | `ApplicationsPage.jsx` — Lists applications with status badges, dates, cover letters. Supports withdrawal. |
| 5 | Send and receive encrypted messages | ⚠️ PARTIALLY SATISFIED | Messaging works fully (`MessagesPage.jsx`). However, messages are not actually E2E encrypted — plaintext stored in `ciphertext` field. Labeled "encrypted" cosmetically. |

### 3B. Recruiter / Company Admin

| # | Requirement | Status | How Satisfied |
|---|-------------|--------|---------------|
| 1 | Create and manage company pages | ✅ SATISFIED | `CompanyPage.jsx` "My Companies" tab with create form. Backend CRUD at `companies.py`. |
| 2 | Post and manage job listings | ✅ SATISFIED | "Post a Job" from company card, edit/delete on "My Job Postings" tab. Backend at `jobs.py`. |
| 3 | View applicants and update status | ✅ SATISFIED | Expandable applicants panel per job. Status dropdown + recruiter notes. Backend at `applications.py`. |
| 4 | Message candidates securely | ✅ SATISFIED | "Message" button per applicant navigates to messaging page. |

### 3C. Platform Admin

| # | Requirement | Status | How Satisfied |
|---|-------------|--------|---------------|
| 1 | View, suspend, or delete accounts | ✅ SATISFIED | `AdminDashboard.jsx` Users tab with full management. Backend admin routes with RBAC. |
| 2 | Moderate content and handle reports | ⚠️ PARTIALLY SATISFIED | Admin can delist jobs (`admin.py` L437-465), manage announcements, view resumes. But **no user reporting/flagging system** exists — no report buttons, no report queue, no moderation workflow. |
| 3 | Access secure audit logs | ✅ SATISFIED | "Audit Logs" tab with paginated table, integrity status per entry, chain verification button. |

---

## Section 4 — Programming Languages and Frameworks

| # | Requirement | Status | How Satisfied |
|---|-------------|--------|---------------|
| 1 | Operating System: Ubuntu | ✅ SATISFIED | Running on Ubuntu 22.04.5 LTS. |
| 2 | Database: PostgreSQL | ✅ SATISFIED | `database.py` — `postgresql+asyncpg://` URL. `asyncpg` + `psycopg2-binary` in `requirements.txt`. |
| 3 | Web Server: Nginx | ✅ SATISFIED | `nginx/nginx.conf` — Full config with HTTPS, reverse proxy, security headers. |
| 4 | Backend: Python (FastAPI) | ✅ SATISFIED | `fastapi==0.109.2` + `uvicorn[standard]==0.27.1` in `requirements.txt`. |
| 5 | Frontend: React | ✅ SATISFIED | `react: ^18.2.0`, `react-dom: ^18.2.0` in `package.json`. Vite as build tool. Tailwind CSS. |

---

## Section 5 — Milestones

### February Milestone 2 (February 27)

| # | Requirement | Status | How Satisfied |
|---|-------------|--------|---------------|
| 1 | Secure user registration and login | ✅ SATISFIED | Argon2id hashing, JWT tokens, TOTP-gated flow, account suspension checks, rate limiting, security headers. |
| 2 | TOTP verification | ✅ SATISFIED | Full TOTP: `pyotp` RFC 6238, QR code generation, ±1 window. Used at login, registration, resume download, password change/reset, admin access. |
| 3 | User profile management | ✅ SATISFIED | All fields (education, experience, skills, bio, headline, location, picture), per-field privacy, view tracking. |
| 4 | Secure resume upload with encryption | ✅ SATISFIED | Fernet/AES encryption at rest, SHA-256 integrity hash, PKI digital signature, TOTP for download. |
| 5 | Basic admin dashboard | ✅ SATISFIED | Overview stats, user management, job management, resume management, announcements, audit logs. TOTP-protected. |

### March Milestone (March 31)

| # | Requirement | Status | How Satisfied |
|---|-------------|--------|---------------|
| 1 | Company pages and job postings | ✅ SATISFIED | Full company CRUD for recruiters. Job posting with all fields (title, description, location, salary, type, deadline). |
| 2 | Job search and application workflow | ✅ SATISFIED | Keyword search with job display. Application with optional resume + cover letter. Already-applied tracking. |
| 3 | Application status tracking | ✅ SATISFIED | Backend enum with 5 correct statuses. Recruiter updates via dropdown. User sees status badges. |
| 4 | Encrypted 1-to-1 and group messaging | ⚠️ PARTIALLY SATISFIED | 1-to-1 and group messaging fully functional. Group creation, member management, deletion all work. However, **actual E2E encryption is not implemented** — PKI infrastructure exists (`pki_service.py`) but is not wired into message send/receive flow. Messages stored as plaintext. Announcements use server-side Fernet encryption correctly. |
| 5 | Initial admin logging | ✅ SATISFIED | Comprehensive audit logging (`audit_service.py`): all user actions, admin actions, resume operations, messages, jobs, companies. Middleware-level HTTP request logging. |

### April Milestone — Final Evaluation (April 30)

| # | Requirement | Status | How Satisfied |
|---|-------------|--------|---------------|
| 1 | PKI integration for ≥2 security-critical functions | ✅ SATISFIED | (1) Resume signing/verification with RSA. (2) TLS certificate generation. (3) User RSA key pairs. (4) Message signing field. |
| 2 | TOTP with virtual keyboard for high-risk actions | ✅ SATISFIED | `VirtualKeyboard.jsx` with randomized digits used in 6+ pages: login, registration, password reset, resume download, password change, admin access. |
| 3 | Tamper-evident secure audit logs | ✅ SATISFIED | SHA-256 hash chaining with genesis hash, chain verification function, admin endpoint + UI. |
| 4 | Defenses against common web attacks | ✅ SATISFIED | SQL injection (ORM), XSS (CSP, security headers, React escaping), CSRF (Bearer tokens), clickjacking (X-Frame-Options), MITM (HSTS, TLS), rate limiting, input validation (Pydantic). |
| 5 | Final system demo and documentation | ⚠️ PARTIALLY SATISFIED | `README.md`, `ARCHITECTURE.md`, `DEV_LOG.md` exist. `start.sh`/`stop.sh` for deployment. No formal demo presentation artifact yet (expected at deadline). |

---

## Section 6 — Bonus Features

### Bonus 1. Blockchain-based tamper-evident logging (+6%)

**Status: ❌ NOT SATISFIED**

The audit log system uses **SHA-256 hash chaining** (`audit_service.py`), which is conceptually similar but is **not blockchain**. There is no distributed ledger, no consensus mechanism, no blocks of transactions, no Merkle trees, no proof-of-work/stake. The base requirement for "hash chaining or a private blockchain" (Section 2H) is satisfied, but the bonus explicitly requires "blockchain-based" which goes beyond hash chaining.

---

### Bonus 2. Resume parsing and intelligent matching (+2%)

**Status: ❌ NOT SATISFIED**

No resume parsing (text extraction from PDF/DOCX) or intelligent job-resume matching exists. Resumes are encrypted and stored as binary blobs. Job search is keyword-based only. No NLP, skill extraction, or matching algorithms. No relevant libraries (PyPDF2, pdfminer, docx2txt, spaCy, etc.) in `requirements.txt`.

---

## Critical Gaps Summary

| Priority | Gap | Impact |
|----------|-----|--------|
| **HIGH** | E2E message encryption not implemented (E2, E3) | Messages stored as plaintext despite "encrypted" labels. PKI infrastructure exists but not connected to messaging flow. |
| **MEDIUM** | Job search filters missing from frontend (C1) | Backend supports company/location/skills/type filters but frontend only exposes keyword search. |
| **MEDIUM** | `required_skills` field missing from job posting UI (B2) | Backend model supports it but frontend form doesn't collect it. |
| **MEDIUM** | `ApplicationsPage.jsx` STATUS_COLORS key mismatch (C3) | 3 of 5 statuses use wrong keys (`pending`/`shortlisted`/`accepted` vs `applied`/`interviewed`/`offer`). |
| **MEDIUM** | No user reporting/flagging system (G2 content moderation) | Admin can delist jobs but users cannot report content or profiles. |
| **LOW** | Backend `skills` search filter unimplemented (C1) | Parameter accepted but silently ignored. |
| **LOW** | Uvicorn runs plain HTTP behind Nginx (H-PKI-1) | Acceptable in reverse-proxy setup but `start.sh` advertises HTTP URLs. |
| **LOW** | No IP binding for JWT sessions (H-ATK-5) | Tokens in `localStorage` without IP verification; mitigated by short expiry + HSTS. |
| **BONUS** | No blockchain implementation (Bonus 1) | Hash chaining only, not full blockchain. |
| **BONUS** | No resume parsing/matching (Bonus 2) | Not implemented at all. |
