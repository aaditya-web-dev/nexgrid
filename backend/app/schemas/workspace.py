"""
Pydantic schemas for Workspace and WorkspaceMember endpoints.
"""
from datetime import datetime
from pydantic import BaseModel, Field
from app.models.enums import WorkspaceRole


# ---------------------------------------------------------------------------
# Workspace schemas
# ---------------------------------------------------------------------------

class WorkspaceCreate(BaseModel):
    """POST /api/workspaces — request body."""
    name: str = Field(..., min_length=1, max_length=120, examples=["My API Project"])
    description: str | None = Field(None, examples=["Workspace for the Nexgrid API"])


class WorkspaceUpdate(BaseModel):
    """PATCH /api/workspaces/{id} — request body (all fields optional)."""
    name: str | None = Field(None, min_length=1, max_length=120)
    description: str | None = None


class WorkspaceResponse(BaseModel):
    """Returned for any workspace read."""
    id: int
    name: str
    description: str | None = None
    owner_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Member schemas
# ---------------------------------------------------------------------------

class MemberInvite(BaseModel):
    """POST /api/workspaces/{id}/members — request body."""
    user_id: int = Field(..., examples=[2])
    role: WorkspaceRole = Field(WorkspaceRole.VIEWER, examples=[WorkspaceRole.EDITOR])


class MemberRoleUpdate(BaseModel):
    """PATCH /api/workspaces/{id}/members/{user_id} — change a member's role."""
    role: WorkspaceRole


class MemberResponse(BaseModel):
    """Returned for any workspace-member read."""
    id: int
    workspace_id: int
    user_id: int
    role: WorkspaceRole
    joined_at: datetime

    model_config = {"from_attributes": True}
