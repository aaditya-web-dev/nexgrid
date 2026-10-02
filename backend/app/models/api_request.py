"""
API request model — the core entity users build and execute.

Also carries the collaborative editing lock fields (locked_by / locked_at)
used by the Week 8 real-time locking feature.
"""
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    ForeignKey,
    DateTime,
    JSON,
    Enum as SAEnum,
)
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin
from app.models.enums import HttpMethod, BodyType, AuthType


class ApiRequest(Base, TimestampMixin):
    __tablename__ = "api_requests"

    id = Column(Integer, primary_key=True, index=True)
    collection_id = Column(
        Integer, ForeignKey("collections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    folder_id = Column(
        Integer, ForeignKey("folders.id", ondelete="SET NULL"), nullable=True, index=True
    )

    name = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    method = Column(
        SAEnum(HttpMethod, native_enum=False, length=10),
        default=HttpMethod.GET,
        nullable=False,
    )
    url = Column(Text, nullable=False)

    # Stored as JSON so the shape stays flexible across DB backends
    query_params = Column(JSON, default=dict, nullable=True)   # {"key": "value"}
    headers = Column(JSON, default=dict, nullable=True)        # {"Header": "value"}

    body_type = Column(
        SAEnum(BodyType, native_enum=False, length=30),
        default=BodyType.NONE,
        nullable=False,
    )
    body = Column(Text, nullable=True)

    auth_type = Column(
        SAEnum(AuthType, native_enum=False, length=20),
        default=AuthType.NONE,
        nullable=False,
    )
    auth_config = Column(JSON, default=dict, nullable=True)    # {"token": "..."} etc.

    position = Column(Integer, default=0, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # --- Collaborative editing lock (Week 8) ---
    locked_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    locked_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    collection = relationship("Collection", back_populates="requests")
    folder = relationship("Folder", back_populates="requests")
    comments = relationship(
        "Comment", back_populates="request", cascade="all, delete-orphan"
    )
    test_cases = relationship(
        "TestCase", back_populates="request", cascade="all, delete-orphan"
    )
    executions = relationship(
        "RequestExecution", back_populates="request", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<ApiRequest id={self.id} {self.method} {self.name!r}>"
