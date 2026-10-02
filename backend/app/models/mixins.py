"""
Reusable mixins for SQLAlchemy models.
"""
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime


def utcnow():
    return datetime.now(timezone.utc)


class TimestampMixin:
    """Adds created_at / updated_at columns to a model."""
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        nullable=False,
    )
