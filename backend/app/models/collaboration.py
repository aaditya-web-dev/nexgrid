"""
Collaboration models: comments (threaded) and notifications.
"""
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    ForeignKey,
    Enum as SAEnum,
)
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin
from app.models.enums import NotificationType


class Comment(Base, TimestampMixin):
    """A comment on an API request. Supports one level of threading via parent_comment_id."""
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(
        Integer, ForeignKey("api_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    parent_comment_id = Column(
        Integer, ForeignKey("comments.id", ondelete="CASCADE"), nullable=True, index=True
    )
    content = Column(Text, nullable=False)
    is_edited = Column(Boolean, default=False, nullable=False)

    # Relationships
    request = relationship("ApiRequest", back_populates="comments")
    user = relationship("User", back_populates="comments")
    replies = relationship(
        "Comment",
        back_populates="parent",
        cascade="all, delete-orphan",
    )
    parent = relationship("Comment", back_populates="replies", remote_side=[id])

    def __repr__(self):
        return f"<Comment id={self.id} request={self.request_id}>"


class Notification(Base, TimestampMixin):
    """In-app notification delivered to a user, optionally scoped to a workspace."""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    workspace_id = Column(
        Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, index=True
    )
    type = Column(
        SAEnum(NotificationType, native_enum=False, length=40), nullable=False
    )
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False, index=True)

    # Generic pointer to the resource this notification is about
    resource_type = Column(String(50), nullable=True)   # e.g. "api_request"
    resource_id = Column(Integer, nullable=True)

    # Who triggered it (nullable for system notifications)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    user = relationship("User", back_populates="notifications", foreign_keys=[user_id])
    workspace = relationship("Workspace", back_populates="notifications")

    def __repr__(self):
        return f"<Notification id={self.id} type={self.type} user={self.user_id}>"
