"""
Workspace and workspace membership models.

A Workspace is the top-level collaboration container. Users join a workspace
through WorkspaceMember, which also carries their role (owner/editor/viewer).
"""
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    ForeignKey,
    Enum as SAEnum,
    UniqueConstraint,
    DateTime,
)
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin, utcnow
from app.models.enums import WorkspaceRole


class Workspace(Base, TimestampMixin):
    __tablename__ = "workspaces"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    owner_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Relationships
    owner = relationship("User", back_populates="owned_workspaces", foreign_keys=[owner_id])
    members = relationship(
        "WorkspaceMember", back_populates="workspace", cascade="all, delete-orphan"
    )
    collections = relationship(
        "Collection", back_populates="workspace", cascade="all, delete-orphan"
    )
    environments = relationship(
        "Environment", back_populates="workspace", cascade="all, delete-orphan"
    )
    notifications = relationship(
        "Notification", back_populates="workspace", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Workspace id={self.id} name={self.name!r}>"


class WorkspaceMember(Base):
    """Join table between users and workspaces, carrying the member's role."""
    __tablename__ = "workspace_members"
    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_workspace_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(
        Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role = Column(
        SAEnum(WorkspaceRole, native_enum=False, length=20),
        default=WorkspaceRole.VIEWER,
        nullable=False,
    )

    joined_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Relationships
    workspace = relationship("Workspace", back_populates="members")
    user = relationship("User", back_populates="memberships")

    def __repr__(self):
        return f"<WorkspaceMember ws={self.workspace_id} user={self.user_id} role={self.role}>"
