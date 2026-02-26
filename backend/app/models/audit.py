"""
VajraKavach — AuditLog Model
Tamper-evident audit logging with hash chaining.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    action = Column(String(100), nullable=False, index=True)    # e.g., "user.login", "job.create"
    resource = Column(String(100), nullable=True)               # e.g., "user", "job", "resume"
    resource_id = Column(String(64), nullable=True)             # ID of affected resource
    details = Column(Text, nullable=True)                       # JSON string with extra info
    ip_address = Column(String(45), nullable=True)

    # Hash-chain fields for tamper evidence
    entry_hash = Column(String(64), nullable=False)             # SHA-256 hash of this entry
    previous_hash = Column(String(64), nullable=False)          # Hash of previous entry (or "GENESIS")

    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<AuditLog {self.action} user={self.user_id} at={self.created_at}>"
