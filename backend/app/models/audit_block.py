"""
VajraKavach — Blockchain Audit Block Model
Groups audit log entries into immutable blocks with Merkle roots.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Integer
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class AuditBlock(Base):
    __tablename__ = "audit_blocks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    block_number = Column(Integer, nullable=False, unique=True, index=True)
    previous_block_hash = Column(String(64), nullable=False)
    merkle_root = Column(String(64), nullable=False)
    nonce = Column(Integer, nullable=False, default=0)
    block_hash = Column(String(64), nullable=False, unique=True)
    entry_count = Column(Integer, nullable=False)
    entry_ids = Column(Text, nullable=False)   # comma-separated audit log IDs
    timestamp = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<AuditBlock #{self.block_number} entries={self.entry_count} hash={self.block_hash[:12]}...>"
