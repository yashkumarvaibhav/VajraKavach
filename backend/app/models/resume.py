"""
VajraKavach — Resume Model
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Resume(Base):
    __tablename__ = "resumes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    original_filename = Column(String(255), nullable=False)
    encrypted_path = Column(String(512), nullable=False)       # path to encrypted file on disk
    file_hash = Column(String(128), nullable=False)            # SHA-256 of original file (integrity)
    digital_signature = Column(Text, nullable=True)            # PKI signature for integrity verification
    file_size = Column(String(20), nullable=True)
    mime_type = Column(String(100), nullable=True)

    uploaded_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    owner = relationship("User", back_populates="resumes")

    def __repr__(self):
        return f"<Resume {self.original_filename} user={self.user_id}>"
