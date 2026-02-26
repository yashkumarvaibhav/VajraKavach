"""
VajraKavach — Report Model
User reporting / flagging system for moderation.
"""

import uuid
import enum
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class ReportStatus(str, enum.Enum):
    PENDING = "pending"
    REVIEWED = "reviewed"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class ReportCategory(str, enum.Enum):
    SPAM = "spam"
    HARASSMENT = "harassment"
    FRAUD = "fraud"
    INAPPROPRIATE = "inappropriate"
    IMPERSONATION = "impersonation"
    OTHER = "other"


class Report(Base):
    __tablename__ = "reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reporter_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    reported_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)

    category = Column(SAEnum(ReportCategory), nullable=False)
    description = Column(Text, nullable=False)
    resource_type = Column(String(50), nullable=True)   # 'user', 'message', 'job'
    resource_id = Column(String(255), nullable=True)     # ID of the flagged entity

    status = Column(SAEnum(ReportStatus), default=ReportStatus.PENDING, nullable=False)
    admin_notes = Column(Text, nullable=True)
    resolved_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    reporter = relationship("User", foreign_keys=[reporter_id])
    reported_user = relationship("User", foreign_keys=[reported_user_id])

    def __repr__(self):
        return f"<Report {self.id} category={self.category} status={self.status}>"
