"""
VajraKavach — Seed Platform Admin User
Creates the platform admin account: vajrakavach@iiitd.ac.in
Run: cd backend && source venv/bin/activate && python seed_admin.py
"""

import asyncio
import uuid
import sys
import os

# Ensure the app module is importable
sys.path.insert(0, os.path.dirname(__file__))

from app.database import async_session, init_db
from app.models.user import User, UserProfile, UserRole
from app.services.auth_service import hash_password
from app.services.totp_service import generate_totp_secret, get_totp_uri, generate_qr_code_base64

# ─── Seed Admin Credentials ──────────────────────────────────────────
ADMIN_EMAIL = "vajrakavach@iiitd.ac.in"
ADMIN_PASSWORD = "Admin@12345"
ADMIN_NAME = "VajraKavach Admin"


async def seed():
    await init_db()

    async with async_session() as db:
        from sqlalchemy import select

        # Check if admin already exists
        result = await db.execute(select(User).where(User.email == ADMIN_EMAIL))
        existing = result.scalar_one_or_none()

        if existing:
            print(f"✅ Admin user already exists: {ADMIN_EMAIL} (id={existing.id})")
            print(f"   Role: {existing.role.value}, TOTP verified: {existing.totp_verified}")
            return

        # Hash password with Argon2
        hashed_pw = hash_password(ADMIN_PASSWORD)

        # Generate TOTP secret (admin must scan QR on first login)
        totp_secret = generate_totp_secret()

        admin_id = uuid.uuid4()
        admin = User(
            id=admin_id,
            email=ADMIN_EMAIL,
            hashed_password=hashed_pw,
            full_name=ADMIN_NAME,
            role=UserRole.PLATFORM_ADMIN,
            totp_secret=totp_secret,
            totp_verified=False,   # Must verify TOTP on first login
            public_key=None,
            encrypted_private_key=None,
            is_active=True,
            is_suspended=False,
        )
        db.add(admin)

        profile = UserProfile(
            id=uuid.uuid4(),
            user_id=admin_id,
        )
        db.add(profile)

        await db.commit()

        # Print setup info
        totp_uri = get_totp_uri(totp_secret, ADMIN_EMAIL)
        qr_b64 = generate_qr_code_base64(totp_uri)

        print("=" * 60)
        print("🛡️  VajraKavach SEED ADMIN CREATED")
        print("=" * 60)
        print(f"  Email    : {ADMIN_EMAIL}")
        print(f"  Password : {ADMIN_PASSWORD}")
        print(f"  Role     : platform_admin")
        print(f"  ID       : {admin_id}")
        print(f"  TOTP Sec : {totp_secret}")
        print(f"  TOTP URI : {totp_uri}")
        print("=" * 60)
        print("⚠️  On first login, TOTP verification is required.")
        print("   Use the TOTP secret above in Google Authenticator / Authy.")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(seed())
