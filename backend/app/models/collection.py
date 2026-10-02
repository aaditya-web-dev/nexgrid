"""
Collection and Folder models.

A Collection groups related API requests inside a workspace.
Folders allow nested organisation inside a collection (self-referencing tree).
"""
from sqlalchemy import Column, Integer, String, Text, ForeignKey
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin


class Collection(Base, TimestampMixin):
    __tablename__ = "collections"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(
        Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    workspace = relationship("Workspace", back_populates="collections")
    folders = relationship(
        "Folder", back_populates="collection", cascade="all, delete-orphan"
    )
    requests = relationship(
        "ApiRequest", back_populates="collection", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Collection id={self.id} name={self.name!r}>"


class Folder(Base, TimestampMixin):
    """Self-referencing folder tree inside a collection."""
    __tablename__ = "folders"

    id = Column(Integer, primary_key=True, index=True)
    collection_id = Column(
        Integer, ForeignKey("collections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    parent_folder_id = Column(
        Integer, ForeignKey("folders.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name = Column(String(120), nullable=False)
    position = Column(Integer, default=0, nullable=False)

    # Relationships
    collection = relationship("Collection", back_populates="folders")
    children = relationship(
        "Folder",
        back_populates="parent",
        cascade="all, delete-orphan",
        remote_side=None,
    )
    parent = relationship("Folder", back_populates="children", remote_side=[id])
    requests = relationship("ApiRequest", back_populates="folder")

    def __repr__(self):
        return f"<Folder id={self.id} name={self.name!r}>"
