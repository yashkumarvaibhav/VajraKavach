"""
VajraKavach — Announcement Model
Server-side encrypted announcements by admin.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Announcement(Base):
    __tablename__ = "announcements"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sender_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title_encrypted = Column(Text, nullable=False)       # Fernet-encrypted title
    content_encrypted = Column(Text, nullable=False)      # Fernet-encrypted content
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    sender = relationship("User")

    def __repr__(self):
        return f"<Announcement {self.id} by={self.sender_id}>"
