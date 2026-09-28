"""
VajraKavach — Demo data seeder for vajrakavach.yashkumarvaibhav.me

Creates a populated, browsable instance: job seekers, recruiters, admins,
companies, jobs, resumes (really encrypted + signed), applications, and a
connection graph.

Run:  cd backend && ./venv/bin/python ../deploy/seed_demo_data.py [--reset]

Notes
-----
* Every demo account shares ONE TOTP secret. Each account otherwise needs its
  own authenticator entry, which makes a 20-account demo unusable; with a shared
  secret a single entry logs in as anybody. Real accounts registered through the
  UI still get their own per-user secret.
* Rows are written straight to the DB (like seed_admin.py), so the registration
  password-strength validator is bypassed on purpose — see DEMO_PASSWORD.
* No messages are seeded. Message bodies are end-to-end encrypted against RSA
  private keys that only ever exist in a browser's IndexedDB, so any ciphertext
  written here would be undecryptable by every client. Demo accounts get public
  keys; conversations are meant to be created live in the browser.
"""

import argparse
import asyncio
import os
import random
import sys
import uuid
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + "/backend")

from sqlalchemy import select, delete

from app.database import async_session, init_db
from app.models.user import User, UserProfile, UserRole, PrivacyLevel
from app.models.company import Company
from app.models.job import Job, JobType, LocationType
from app.models.application import Application, ApplicationStatus
from app.models.resume import Resume
from app.models.connection import Connection, ConnectionStatus
from app.services.auth_service import hash_password
from app.services.totp_service import generate_totp_secret, encrypt_totp_secret, get_totp_uri
from app.services.encryption_service import encrypt_data, compute_sha256
from app.services.pki_service import generate_rsa_key_pair, sign_data
from app.config import settings

# Password requested for every demo account. Note it has no digit, so the
# registration schema would reject it — login only checks length, so seeded
# accounts sign in fine, but "change password" to this value would fail.
DEMO_PASSWORD = "Demo@vajrakawach"
DEMO_DOMAIN = "@demo.vajrakavach.in"

random.seed(20260731)

SEEKERS = [
    ("Aarav Sharma", "Backend Engineer", "Bengaluru, India", ["Python", "FastAPI", "PostgreSQL", "Docker"]),
    ("Diya Nair", "Frontend Engineer", "Kochi, India", ["React", "TypeScript", "Tailwind", "Vite"]),
    ("Kabir Singh", "Security Analyst", "Delhi, India", ["Threat Modelling", "Burp Suite", "SIEM", "Python"]),
    ("Ananya Rao", "Data Scientist", "Hyderabad, India", ["PyTorch", "Pandas", "SQL", "Statistics"]),
    ("Rohan Mehta", "DevOps Engineer", "Pune, India", ["Kubernetes", "Terraform", "AWS", "Prometheus"]),
    ("Ishita Verma", "Product Designer", "Mumbai, India", ["Figma", "Design Systems", "User Research"]),
    ("Vivaan Gupta", "ML Engineer", "Bengaluru, India", ["TensorFlow", "MLOps", "Airflow", "Python"]),
    ("Meera Iyer", "Full Stack Developer", "Chennai, India", ["Node.js", "React", "MongoDB", "GraphQL"]),
    ("Arjun Patel", "Cloud Architect", "Ahmedabad, India", ["Azure", "Networking", "IaC", "Go"]),
    ("Sara Khan", "QA Engineer", "Noida, India", ["Selenium", "PyTest", "CI/CD", "API Testing"]),
    ("Aditya Joshi", "Site Reliability Engineer", "Gurugram, India", ["Linux", "eBPF", "Grafana", "Go"]),
    ("Nisha Reddy", "Cryptography Researcher", "Hyderabad, India", ["Applied Crypto", "Rust", "Zero Knowledge"]),
    ("Yuvraj Bose", "Android Developer", "Kolkata, India", ["Kotlin", "Jetpack Compose", "Room"]),
]

RECRUITERS = [
    ("Priya Malhotra", "Talent Lead", "Bengaluru, India"),
    ("Rahul Deshpande", "Technical Recruiter", "Pune, India"),
    ("Fatima Sheikh", "Head of Hiring", "Mumbai, India"),
    ("Karan Bajaj", "Campus Recruiter", "Delhi, India"),
    ("Sneha Kulkarni", "Engineering Recruiter", "Hyderabad, India"),
]

ADMINS = [
    ("Devika Menon", UserRole.ADMIN, "Compliance Auditor"),
    ("Siddharth Rana", UserRole.PLATFORM_ADMIN, "Platform Operations"),
]

COMPANIES = [
    ("Kavach Systems", "Security tooling for regulated industries.", "Bengaluru, India", "Cybersecurity", "51-200"),
    ("Indus Analytics", "Data platforms for retail and logistics.", "Hyderabad, India", "Data & Analytics", "201-500"),
    ("Tarang Cloud", "Managed Kubernetes and platform engineering.", "Pune, India", "Cloud Infrastructure", "51-200"),
    ("Meridian Fintech", "Payments infrastructure for South Asia.", "Mumbai, India", "Fintech", "501-1000"),
    ("Nabha Robotics", "Warehouse automation and computer vision.", "Chennai, India", "Robotics", "11-50"),
    ("Prahari Labs", "Threat intelligence and detection engineering.", "Delhi, India", "Cybersecurity", "11-50"),
    ("Vayu Mobility", "Fleet telematics and EV charging networks.", "Gurugram, India", "Mobility", "201-500"),
    ("Chitrakala Studios", "Design systems and product studios.", "Kochi, India", "Design", "11-50"),
    ("Setu Health", "Clinical data interoperability.", "Ahmedabad, India", "HealthTech", "51-200"),
    ("Ojas Semiconductors", "EDA tooling and silicon verification.", "Noida, India", "Semiconductors", "501-1000"),
]

JOB_TEMPLATES = [
    ("Senior Backend Engineer", ["Python", "FastAPI", "PostgreSQL"], JobType.FULL_TIME, LocationType.HYBRID, "2200000", "3400000"),
    ("Frontend Engineer (React)", ["React", "TypeScript", "CSS"], JobType.FULL_TIME, LocationType.REMOTE, "1600000", "2600000"),
    ("Application Security Engineer", ["Threat Modelling", "SAST", "Python"], JobType.FULL_TIME, LocationType.ONSITE, "2400000", "3800000"),
    ("Data Scientist", ["Python", "Statistics", "SQL"], JobType.FULL_TIME, LocationType.HYBRID, "1800000", "3000000"),
    ("Platform / DevOps Engineer", ["Kubernetes", "Terraform", "AWS"], JobType.FULL_TIME, LocationType.REMOTE, "2000000", "3200000"),
    ("Security Research Intern", ["Reverse Engineering", "C", "Linux"], JobType.INTERNSHIP, LocationType.ONSITE, "60000", "90000"),
    ("Machine Learning Engineer", ["PyTorch", "MLOps", "Airflow"], JobType.FULL_TIME, LocationType.HYBRID, "2400000", "4000000"),
    ("Site Reliability Engineer", ["Linux", "Observability", "Go"], JobType.FULL_TIME, LocationType.REMOTE, "2600000", "4200000"),
    ("Product Designer", ["Figma", "Design Systems", "Prototyping"], JobType.FULL_TIME, LocationType.HYBRID, "1400000", "2400000"),
    ("QA Automation Engineer", ["Selenium", "PyTest", "CI/CD"], JobType.CONTRACT, LocationType.REMOTE, "1200000", "1900000"),
    ("Cloud Solutions Architect", ["Azure", "Networking", "IaC"], JobType.FULL_TIME, LocationType.ONSITE, "3000000", "4600000"),
    ("Android Engineer", ["Kotlin", "Jetpack Compose"], JobType.FULL_TIME, LocationType.HYBRID, "1800000", "2800000"),
    ("Cryptography Engineer", ["Applied Crypto", "Rust"], JobType.FULL_TIME, LocationType.ONSITE, "2800000", "4400000"),
    ("Data Engineering Intern", ["SQL", "Python", "Spark"], JobType.INTERNSHIP, LocationType.HYBRID, "50000", "80000"),
    ("Full Stack Developer", ["Node.js", "React", "MongoDB"], JobType.FULL_TIME, LocationType.REMOTE, "1700000", "2900000"),
    ("Detection Engineer", ["SIEM", "Sigma Rules", "Python"], JobType.FULL_TIME, LocationType.REMOTE, "2100000", "3300000"),
    ("Embedded Systems Engineer", ["C", "RTOS", "Firmware"], JobType.FULL_TIME, LocationType.ONSITE, "1900000", "3100000"),
    ("Technical Program Manager", ["Roadmapping", "Agile", "Stakeholder Mgmt"], JobType.FULL_TIME, LocationType.HYBRID, "2500000", "3900000"),
    ("Part-time Security Trainer", ["Teaching", "OWASP", "Labs"], JobType.PART_TIME, LocationType.REMOTE, "600000", "1000000"),
    ("Graduate Software Engineer", ["DSA", "Python", "Git"], JobType.FULL_TIME, LocationType.ONSITE, "1200000", "1800000"),
    ("Observability Engineer", ["Prometheus", "Grafana", "OpenTelemetry"], JobType.FULL_TIME, LocationType.HYBRID, "2200000", "3500000"),
    ("Verification Engineer", ["SystemVerilog", "UVM"], JobType.FULL_TIME, LocationType.ONSITE, "2000000", "3200000"),
]

COVER_NOTES = [
    "I have shipped and operated systems close to this role's scope and would value the chance to go deeper.",
    "My recent work overlaps strongly with your stack; happy to walk through the architecture in detail.",
    "Long-time follower of your engineering blog — the reliability posts in particular. I'd love to contribute.",
    "I led a similar migration end to end last year and can share the postmortem during an interview.",
    "Attaching my resume; the last two projects listed map almost directly onto this job description.",
]

RECRUITER_NOTES = [
    "Strong fundamentals in the screening call. Moving to the technical round.",
    "Good depth on system design; needs a second opinion on the security portion.",
    "Profile is promising but timelines don't line up with our start date.",
    "Excellent take-home submission — one of the cleanest this cycle.",
]


def build_pdf(name: str, headline: str, skills, lines) -> bytes:
    """Minimal single-page PDF. Hand-built (no reportlab dependency) with a
    correct xref table so PyPDF2 text extraction in the app still works."""
    def esc(s):
        return s.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")

    body = [f"{name} — {headline}", "", "Skills: " + ", ".join(skills), ""] + list(lines)
    text_ops = ["BT", "/F1 16 Tf", "72 760 Td", f"({esc(body[0])}) Tj", "/F1 11 Tf"]
    for line in body[1:]:
        text_ops += ["0 -18 Td", f"({esc(line)}) Tj"]
    text_ops.append("ET")
    stream = "\n".join(text_ops).encode("latin-1", "replace")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref_at = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += (f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_at}\n%%EOF\n").encode()
    return bytes(out)


def store_resume(content: bytes, user_id, server_key):
    """Mirror of resume_service.save_encrypted_resume for offline seeding:
    Fernet-encrypt to disk, SHA-256 the plaintext, PKI-sign it."""
    upload_dir = os.path.join(settings.UPLOAD_DIR, str(user_id))
    os.makedirs(upload_dir, exist_ok=True)
    path = os.path.join(upload_dir, f"{uuid.uuid4()}.enc")
    with open(path, "wb") as f:
        f.write(encrypt_data(content))
    return {
        "encrypted_path": path,
        "file_hash": compute_sha256(content),
        "digital_signature": sign_data(content, server_key) if server_key else None,
        "file_size": str(len(content)),
    }


def load_server_key():
    key_path = settings.PKI_PRIVATE_KEY_PATH
    if not os.path.exists(key_path):
        return None
    with open(key_path, "r") as f:
        return f.read()


async def wipe(db):
    result = await db.execute(select(User).where(User.email.like(f"%{DEMO_DOMAIN}")))
    users = result.scalars().all()
    ids = [u.id for u in users]
    if not ids:
        print("Nothing to reset.")
        return
    # Remove encrypted resume blobs from disk before the rows cascade away.
    res = await db.execute(select(Resume).where(Resume.user_id.in_(ids)))
    for r in res.scalars().all():
        if r.encrypted_path and os.path.exists(r.encrypted_path):
            os.remove(r.encrypted_path)
    await db.execute(delete(User).where(User.id.in_(ids)))
    await db.commit()
    print(f"Reset: removed {len(ids)} demo users and their cascaded data.")


async def seed(reset: bool):
    await init_db()
    async with async_session() as db:
        if reset:
            await wipe(db)

        existing = await db.execute(select(User).where(User.email.like(f"%{DEMO_DOMAIN}")))
        if existing.scalars().first():
            print("Demo data already present. Re-run with --reset to rebuild it.")
            return

        server_key = load_server_key()
        shared_secret = generate_totp_secret()
        stored_secret = encrypt_totp_secret(shared_secret)
        pw_hash = hash_password(DEMO_PASSWORD)  # Argon2id; ~1 hash reused for all demo rows
        now = datetime.utcnow()

        def make_user(full_name, role, days_ago):
            handle = full_name.lower().replace(" ", ".")
            pub, _priv = generate_rsa_key_pair(key_size=2048)
            u = User(
                id=uuid.uuid4(),
                email=f"{handle}{DEMO_DOMAIN}",
                hashed_password=pw_hash,
                full_name=full_name,
                phone=f"+91{random.randint(7000000000, 9999999999)}",
                role=role,
                totp_secret=stored_secret,
                totp_verified=True,
                public_key=pub,
                encrypted_private_key=None,  # lives in the browser's IndexedDB, never server-side
                is_active=True,
                is_suspended=False,
                created_at=now - timedelta(days=days_ago),
                last_login=now - timedelta(hours=random.randint(1, 200)),
            )
            db.add(u)
            return u

        seekers, recruiters, admins = [], [], []

        for i, (name, headline, location, skills) in enumerate(SEEKERS):
            u = make_user(name, UserRole.USER, 180 - i * 7)
            db.add(UserProfile(
                id=uuid.uuid4(), user_id=u.id, headline=headline, location=location,
                bio=f"{headline} focused on shipping dependable systems. Open to roles across India.",
                website=f"https://{name.split()[0].lower()}.example.in",
                skills=skills,
                education=[{"school": random.choice(["IIIT-Delhi", "NIT Trichy", "BITS Pilani", "IIT Kanpur", "VIT Vellore"]),
                            "degree": random.choice(["B.Tech Computer Science", "M.Tech Information Security", "B.E. Electronics"]),
                            "year": str(random.randint(2016, 2024))}],
                experience=[{"company": random.choice([c[0] for c in COMPANIES]),
                             "title": headline,
                             "duration": f"{random.randint(1, 5)} years"}],
                view_count=random.randint(4, 240),
            ))
            seekers.append(u)

        for name, headline, location in RECRUITERS:
            u = make_user(name, UserRole.RECRUITER, random.randint(60, 200))
            db.add(UserProfile(
                id=uuid.uuid4(), user_id=u.id, headline=headline, location=location,
                bio="Hiring across engineering and security. Always happy to talk to strong candidates.",
                skills=["Sourcing", "Interviewing", "Employer Branding"],
                view_count=random.randint(20, 400),
            ))
            recruiters.append(u)

        for name, role, headline in ADMINS:
            u = make_user(name, role, 240)
            db.add(UserProfile(id=uuid.uuid4(), user_id=u.id, headline=headline,
                               location="Delhi, India", bio="Platform staff account."))
            admins.append(u)

        await db.flush()

        companies = []
        for i, (cname, desc, loc, industry, size) in enumerate(COMPANIES):
            c = Company(
                id=uuid.uuid4(), name=cname, description=desc, location=loc,
                website=f"https://{cname.split()[0].lower()}.example.in",
                industry=industry, size=size,
                is_verified=i % 3 != 2,
                admin_id=recruiters[i % len(recruiters)].id,
                created_at=now - timedelta(days=random.randint(30, 220)),
            )
            db.add(c)
            companies.append(c)
        await db.flush()

        jobs = []
        for i, (title, skills, jtype, ltype, smin, smax) in enumerate(JOB_TEMPLATES):
            c = companies[i % len(companies)]
            j = Job(
                id=uuid.uuid4(), company_id=c.id, title=title,
                description=(
                    f"{c.name} is hiring a {title}.\n\n"
                    f"You will work alongside a small team on {c.description.lower()} "
                    "Expect ownership from design through production support.\n\n"
                    "Responsibilities:\n"
                    f"- Build and operate services using {', '.join(skills)}\n"
                    "- Review designs and code with security in mind\n"
                    "- Partner with product and design on scope\n\n"
                    "Requirements:\n"
                    f"- Practical experience with {skills[0]}\n"
                    "- Clear written communication\n"
                ),
                required_skills=skills, location=c.location, location_type=ltype, job_type=jtype,
                salary_min=smin, salary_max=smax, salary_currency="INR",
                application_deadline=(now + timedelta(days=random.randint(7, 75))).date(),
                is_active=i % 11 != 10,
                created_at=now - timedelta(days=random.randint(2, 60)),
            )
            db.add(j)
            jobs.append(j)
        await db.flush()

        resumes = {}
        for u, (name, headline, _loc, skills) in zip(seekers, SEEKERS):
            pdf = build_pdf(name, headline, skills, [
                "Experience",
                f"- {headline} building production systems in Python, Go and TypeScript.",
                "- Led migrations, on-call rotations and security reviews.",
                "",
                "Education",
                "- B.Tech, Computer Science",
                "",
                "Projects",
                "- VajraKavach: secure job search and networking platform.",
            ])
            meta = store_resume(pdf, u.id, server_key)
            r = Resume(
                id=uuid.uuid4(), user_id=u.id,
                original_filename=f"{name.replace(' ', '_')}_Resume.pdf",
                mime_type="application/pdf",
                uploaded_at=now - timedelta(days=random.randint(1, 90)),
                **meta,
            )
            db.add(r)
            resumes[u.id] = r
        await db.flush()

        statuses = ([ApplicationStatus.APPLIED] * 10 + [ApplicationStatus.REVIEWED] * 7 +
                    [ApplicationStatus.INTERVIEWED] * 6 + [ApplicationStatus.OFFER] * 3 +
                    [ApplicationStatus.REJECTED] * 6)
        random.shuffle(statuses)

        pairs = set()
        app_count = 0
        for st in statuses:
            for _ in range(20):  # retry until an unused (seeker, job) pair turns up
                seeker = random.choice(seekers)
                job = random.choice(jobs)
                if (seeker.id, job.id) not in pairs:
                    break
            else:
                continue
            pairs.add((seeker.id, job.id))
            applied_at = now - timedelta(days=random.randint(1, 45))
            db.add(Application(
                id=uuid.uuid4(), job_id=job.id, user_id=seeker.id,
                resume_id=resumes[seeker.id].id,
                cover_note=random.choice(COVER_NOTES),
                status=st,
                recruiter_notes=(random.choice(RECRUITER_NOTES)
                                 if st != ApplicationStatus.APPLIED else None),
                created_at=applied_at,
                updated_at=applied_at + timedelta(days=random.randint(0, 9)),
            ))
            app_count += 1

        everyone = seekers + recruiters
        conn_pairs = set()
        accepted = pending = 0
        while accepted < 26 or pending < 8:
            a, b = random.sample(everyone, 2)
            key = tuple(sorted([str(a.id), str(b.id)]))
            if key in conn_pairs:
                continue
            conn_pairs.add(key)
            if accepted < 26:
                status_val, accepted = ConnectionStatus.ACCEPTED, accepted + 1
            else:
                status_val, pending = ConnectionStatus.PENDING, pending + 1
            db.add(Connection(
                id=uuid.uuid4(), requester_id=a.id, addressee_id=b.id, status=status_val,
                created_at=now - timedelta(days=random.randint(1, 120)),
            ))

        await db.commit()

        print("=" * 66)
        print("  VajraKavach demo data seeded")
        print("=" * 66)
        print(f"  Users        : {len(seekers)} job seekers, {len(recruiters)} recruiters, {len(admins)} admins")
        print(f"  Companies    : {len(companies)}")
        print(f"  Jobs         : {len(jobs)}")
        print(f"  Resumes      : {len(resumes)} (Fernet-encrypted on disk, PKI-signed)")
        print(f"  Applications : {app_count}")
        print(f"  Connections  : {accepted} accepted, {pending} pending")
        print("-" * 66)
        print(f"  Password (all demo accounts): {DEMO_PASSWORD}")
        print(f"  Shared TOTP secret          : {shared_secret}")
        print(f"  TOTP URI                    : {get_totp_uri(shared_secret, 'demo' + DEMO_DOMAIN)}")
        print("-" * 66)
        print("  Sample logins:")
        for u in [seekers[0], seekers[2], recruiters[0], admins[0], admins[1]]:
            print(f"    {u.email:<48} {u.role.value}")
        print("=" * 66)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true", help="delete existing demo data first")
    asyncio.run(seed(ap.parse_args().reset))
