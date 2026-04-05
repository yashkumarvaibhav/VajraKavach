# VajraKavach Requirement Verification

Last updated: 2026-03-30

## Scope

This report checks the functional and non-functional requirements listed in [`project-details.md`](/home/iiitd/Desktop/vajrakavach-v01/project-details.md), using:

- backend/frontend code review
- live backend runtime verification
- targeted API flow tests
- frontend production build verification

Professor-approved exception:
- Public registration of the read-only `admin` role is intentional for testing.
- Write/moderation actions remain restricted to `platform_admin`.

## Summary

| Result | Count |
|---|---:|
| PASS | 40 |
| PARTIAL | 0 |
| FAIL | 0 |

## Runtime Evidence Collected

- Backend startup verified successfully.
- `DEBUG=release` no longer crashes config parsing.
- Frontend `vite build` passes.
- HTTPS backend responds correctly with HSTS, and a plain HTTP probe to port `8000` fails while the HTTPS server is active.
- Register -> setup verify -> login -> TOTP verify -> `/api/auth/me` passes for fresh browser-managed-key accounts.
- Login/refresh now issue `Secure`, `HttpOnly`, `SameSite=strict` cookies instead of relying on `localStorage`.
- Fresh accounts report `has_server_private_key=false`, confirming the server no longer stores browser users' private E2EE keys.
- Legacy accounts can migrate their server-stored private key once, after which `has_server_private_key=false` and the old `/api/messages/my-private-key` path is disabled.
- Public read-only `admin` cannot suspend users: API returns `403`, while platform-admin-only restrictions remain in place.
- Recruiter create company -> create job passes.
- Job search with keyword/company/location/skills/type filters passes.
- User apply flow passes.
- Resume upload, owner download, and authorized recruiter download pass.
- Plaintext direct-message submission is now rejected by the API.
- Plaintext group-message submission is now rejected by the API.
- Account deletion now requires the explicit phrase plus TOTP; wrong confirmation returns `400`, successful deletion clears the session and removes further access.

## Functional Requirements

### A. User Profiles and Connections

| ID | Requirement | Status | Notes |
|---|---|---|---|
| A1 | Users can create and edit profiles, including name, headline, location, education, experience, skills, profile picture, and bio. | PASS | Implemented in [`backend/app/routes/users.py`](/home/iiitd/Desktop/vajrakavach-v01/backend/app/routes/users.py) and [`frontend/src/pages/ProfilePage.jsx`](/home/iiitd/Desktop/vajrakavach-v01/frontend/src/pages/ProfilePage.jsx). |
| A2 | Field-level privacy controls: Public / Connections-only / Private. | PASS | Backend enforces field visibility during profile view; frontend exposes per-field selectors. |
| A3 | Users can send, accept, and remove professional connection requests. | PASS | Connection request lifecycle is implemented and wired to the UI. |
| A4 | Users can view a limited connection graph restricted to their connections. | PASS | `/api/users/connections/graph` returns a scoped network graph; frontend renders it. |
| A5 | Profile viewer count and recent viewers list with opt-out privacy controls. | PASS | Viewers are tracked, counts are computed, and viewer visibility can be opted out. |

### B. Company Pages and Job Posting

| ID | Requirement | Status | Notes |
|---|---|---|---|
| B1 | Recruiters can create company pages with company name, description, location, and website. | PASS | Runtime-tested successfully. |
| B2 | Companies can post job listings with title, description, required skills, location, salary range, and application deadline. | PASS | Backend and frontend both support the required fields. |
| B3 | Company administrators can manage job listings, view applicants, and message candidates. | PASS | Job CRUD, applicant review, and messaging entry points are present. |

### C. Job Search and Application Tracking

| ID | Requirement | Status | Notes |
|---|---|---|---|
| C1 | Job search by keywords, company, location, skill tags, and filters (remote, internship, full-time). | PASS | Runtime-tested with combined filters. |
| C2 | Users can apply to jobs by submitting a resume and a short cover note. | PASS | API flow works and the user-facing applications page now renders `cover_note` correctly. |
| C3 | Application status tracking: Applied, Reviewed, Interviewed, Rejected, Offer. | PASS | Runtime-tested status update flow; enum and UI are aligned. |
| C4 | Recruiters can shortlist candidates, add notes, and update application status. | PASS | Recruiter notes and status updates are supported through the current workflow. |

### D. Secure Resume Upload and Storage

| ID | Requirement | Status | Notes |
|---|---|---|---|
| D1 | Resume upload in PDF or DOCX format. | PASS | Runtime-tested. Frontend validation/copy was aligned to backend enforcement in this pass. |
| D2 | All resumes must be encrypted at rest. | PASS | Resume bytes are encrypted before being written to disk. |
| D3 | Strict access control: only owner, authorized recruiters, and admins may access resumes. | PASS | Runtime-tested for owner and authorized recruiter access paths. |
| D4 | Uploaded resumes must be treated as sensitive assets. | PASS | Encryption, TOTP gating, integrity metadata, and audit logs are all present. |

### E. Secure Messaging

| ID | Requirement | Status | Notes |
|---|---|---|---|
| E1 | One-to-one and small group messaging. | PASS | DMs and groups are implemented in backend and frontend. |
| E2 | End-to-end encryption (E2EE) for private conversations. | PASS | Private keys are now browser-managed for active accounts, new registrations upload only the public key, and legacy server-held keys are migrated once and then cleared. |
| E3 | The server must store only ciphertext for E2EE chats. | PASS | Backend now rejects plaintext submissions for both DM and group paths. Runtime-tested. |
| E4 | Optional server-side encrypted messaging for non-sensitive announcements. | PASS | Announcements are stored encrypted at rest and decrypted on read. |

### F. Authentication and Account Security

| ID | Requirement | Status | Notes |
|---|---|---|---|
| F1 | Secure user registration and login. | PASS | Runtime-tested. Public read-only `admin` registration is treated as an approved exception; destructive privileges remain restricted. |
| F2 | Essential TOTP verification after login. | PASS | Runtime-tested; protected endpoints require a TOTP-verified token. |
| F3 | TOTP-based verification for high-risk actions. | PASS | Implemented for password reset, password change, resume download, resume deletion, and account deletion. |

### G. Admin and Moderation

| ID | Requirement | Status | Notes |
|---|---|---|---|
| G1 | Admin dashboard to view and manage all users. | PASS | Backend exists and the audit-log pagination wiring was fixed in the admin UI. |
| G2 | Admins can suspend or delete accounts violating platform policies. | PASS | Platform-admin-only destructive actions remain enforced. |
| G3 | RBAC: Regular User / Recruiter-Company Admin / Platform Admin. | PASS | Role boundaries are enforced, with the professor-approved public read-only `admin` exception explicitly preserved. |

## Non-Functional / Security Requirements

### H. Security Mandates

| ID | Requirement | Status | Notes |
|---|---|---|---|
| H1 | All traffic must use HTTPS (TLS). | PASS | Local runtime now uses [`backend/serve_https.py`](/home/iiitd/Desktop/vajrakavach-v01/backend/serve_https.py) plus HTTPS-enabled Vite proxying, and direct HTTP access to port `8000` fails while HTTPS succeeds. |
| H2 | At least two functions must use PKI. | PASS | Resume signing/integrity verification and user RSA messaging keys satisfy this. |
| H3 | TOTP entry via virtual keyboard for at least two high-risk actions. | PASS | Present across login verification, registration verification, password reset, and security flows. |
| H4 | Log all critical actions. | PASS | Auth, jobs, applications, resumes, messaging, reports, and admin actions are audit logged. |
| H5 | Logs must be tamper-evident using hash chaining or a private blockchain. | PASS | Hash-chained audit logs are implemented; blockchain-style block sealing is also present. |
| H6 | Protection against SQL injection. | PASS | ORM-based query usage is consistent. |
| H7 | Protection against XSS. | PASS | React escaping plus CSP/security headers are present. |
| H8 | Protection against CSRF. | PASS | Same-origin API use plus `SameSite=strict` auth cookies and restricted CORS configuration provide CSRF resistance. |
| H9 | Protection against session fixation. | PASS | Fresh tokens are issued on login and after TOTP verification. |
| H10 | Protection against session hijacking. | PASS | IP binding remains in place, and auth now uses `Secure`, `HttpOnly`, `SameSite=strict` cookies instead of `localStorage` token storage. |
| H11 | Passwords must be hashed and salted (bcrypt or Argon2). | PASS | Argon2 is used. |
| H12 | Plaintext passwords must never be stored. | PASS | No plaintext storage path was found. |
| H13 | Sensitive documents must be encrypted with strict access control. | PASS | Resume handling satisfies this. |
| H14 | The system must support multiple concurrent users without compromising security. | PASS | Async FastAPI, async DB sessions, and connection pooling support this design goal. |

## Fixes Completed During This Audit

1. Hardened config parsing so inherited env values like `DEBUG=release` no longer break startup.
2. Enforced ciphertext-only messaging at the API boundary.
3. Moved E2EE private-key ownership to the browser for active users and added one-time legacy key migration that clears server-side copies.
4. Replaced `localStorage` token handling with `Secure`, `HttpOnly`, `SameSite=strict` cookie sessions.
5. Added a local HTTPS development runner and updated the Vite dev server to proxy over HTTPS.
6. Added user account deletion with explicit warning text plus TOTP confirmation.
7. Extended client-side encryption to group conversations and removed plaintext fallback behavior.
8. Fixed applications-page rendering so submitted cover notes show correctly.
9. Fixed admin audit-log pagination wiring.
10. Aligned resume-upload UI validation and copy with actual backend policy.

## Final Assessment

The checked requirements in [`project-details.md`](/home/iiitd/Desktop/vajrakavach-v01/project-details.md) are now fully satisfied in the current codebase state, including the previously partial security items and the new user account deletion flow.

The main follow-up consideration is operational rather than functional: legacy accounts need to complete their one-time key migration on the next authenticated session so the old server-held private-key copy can be cleared for those users as well.
