"""
Pydantic schemas for Collection and Folder endpoints.
"""
from datetime import datetime
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Collection schemas
# ---------------------------------------------------------------------------

class CollectionCreate(BaseModel):
    """POST /api/workspaces/{id}/collections — request body."""
    name: str = Field(..., min_length=1, max_length=120, examples=["Auth Endpoints"])
    description: str | None = Field(None, examples=["All authentication-related requests"])


class CollectionUpdate(BaseModel):
    """PATCH /api/collections/{id} — all fields optional."""
    name: str | None = Field(None, min_length=1, max_length=120)
    description: str | None = None


class CollectionResponse(BaseModel):
    id: int
    workspace_id: int
    name: str
    description: str | None = None
    created_by: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Folder schemas
# ---------------------------------------------------------------------------

class FolderCreate(BaseModel):
    """POST /api/collections/{id}/folders — request body."""
    name: str = Field(..., min_length=1, max_length=120, examples=["Login Flow"])
    parent_folder_id: int | None = Field(
        None, examples=[None], description="Leave null to create a root-level folder"
    )
    position: int = Field(0, ge=0, examples=[0])


class FolderUpdate(BaseModel):
    """PATCH /api/folders/{id} — all fields optional."""
    name: str | None = Field(None, min_length=1, max_length=120)
    parent_folder_id: int | None = None
    position: int | None = Field(None, ge=0)


class FolderResponse(BaseModel):
    id: int
    collection_id: int
    parent_folder_id: int | None = None
    name: str
    position: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
