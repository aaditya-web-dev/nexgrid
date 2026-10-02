"""
Environment models.

An Environment (e.g. dev / staging / prod) holds key-value variables that get
substituted into request URLs, headers and bodies via {{variable}} syntax.
"""
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    ForeignKey,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin


class Environment(Base, TimestampMixin):
    __tablename__ = "environments"
    __table_args__ = (
        UniqueConstraint("workspace_id", "name", name="uq_workspace_env_name"),
    )

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(
        Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name = Column(String(80), nullable=False)
    is_default = Column(Boolean, default=False, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    workspace = relationship("Workspace", back_populates="environments")
    variables = relationship(
        "EnvironmentVariable",
        back_populates="environment",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<Environment id={self.id} name={self.name!r}>"


class EnvironmentVariable(Base, TimestampMixin):
    __tablename__ = "environment_variables"
    __table_args__ = (
        UniqueConstraint("environment_id", "key", name="uq_env_variable_key"),
    )

    id = Column(Integer, primary_key=True, index=True)
    environment_id = Column(
        Integer, ForeignKey("environments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key = Column(String(120), nullable=False)
    value = Column(Text, nullable=True)
    # Secrets (tokens, passwords) can be masked in the UI
    is_secret = Column(Boolean, default=False, nullable=False)

    environment = relationship("Environment", back_populates="variables")

    def __repr__(self):
        return f"<EnvironmentVariable {self.key!r}>"
