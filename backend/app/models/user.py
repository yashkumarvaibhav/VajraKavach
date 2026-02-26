"""
VajraKavach — User & UserProfile Models
"""

import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Boolean, DateTime, Text, Enum as SAEnum, ForeignKey, JSON
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class UserRole(str, enum.Enum):
    USER = "user"
    RECRUITER = "recruiter"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(512), nullable=False)
    full_name = Column(String(255), nullable=False)
    phone = Column(String(20), nullable=True)
    role = Column(SAEnum(UserRole), default=UserRole.USER, nullable=False)

    # TOTP
    totp_secret = Column(String(64), nullable=True)
    totp_verified = Column(Boolean, default=False)

    # PKI — user's public key for E2E encryption / message signing
    public_key = Column(Text, nullable=True)

    # Account state
    is_active = Column(Boolean, default=True)
    is_suspended = Column(Boolean, default=False)
    last_login = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    profile = relationship("UserProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    resumes = relationship("Resume", back_populates="owner", cascade="all, delete-orphan")
    sent_messages = relationship("Message", foreign_keys="Message.sender_id", back_populates="sender")
    applications = relationship("Application", back_populates="applicant", cascade="all, delete-orphan")
    companies = relationship("Company", back_populates="admin", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User {self.email} role={self.role}>"


class PrivacyLevel(str, enum.Enum):
    PUBLIC = "public"
    CONNECTIONS = "connections"
    PRIVATE = "private"


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)

    headline = Column(String(255), nullable=True)
    location = Column(String(255), nullable=True)
    bio = Column(Text, nullable=True)
    education = Column(JSON, nullable=True)       # list of dicts
    experience = Column(JSON, nullable=True)       # list of dicts
    skills = Column(JSON, nullable=True)           # list of strings
    profile_picture_url = Column(String(512), nullable=True)

    # Privacy settings per field
    privacy_settings = Column(JSON, default={
        "email": "private",
        "phone": "private",
        "headline": "public",
        "location": "public",
        "bio": "public",
        "education": "connections",
        "experience": "connections",
        "skills": "public",
    })

    # Profile viewers
    view_count = Column(JSON, default=0)
    show_viewers = Column(Boolean, default=True)   # opt-out for profile viewers

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="profile")

    def __repr__(self):
        return f"<UserProfile user_id={self.user_id}>"
