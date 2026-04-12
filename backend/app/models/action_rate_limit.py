"""
VajraKavach — Action Rate Limit Model
DB-backed daily/weekly rate limiting for user actions.
"""

import uuid
from datetime import date

from sqlalchemy import Column, String, Integer, Date
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class ActionRateLimit(Base):
    """Tracks daily action counts per user/IP for rate limiting."""

    __tablename__ = "action_rate_limits"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    identifier = Column(String(255), nullable=False, index=True)  # user_id or IP
    action = Column(String(100), nullable=False, index=True)
    action_date = Column(Date, nullable=False, default=date.today, index=True)
    count = Column(Integer, nullable=False, default=0)
