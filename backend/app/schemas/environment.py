"""
Pydantic schemas for Environment and EnvironmentVariable endpoints.
"""
from datetime import datetime
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Environment schemas
# ---------------------------------------------------------------------------

class EnvironmentCreate(BaseModel):
    """POST /api/workspaces/{id}/environments"""
    name: str = Field(..., min_length=1, max_length=80, examples=["development"])
    is_default: bool = Field(False, description="Mark this as the active default environment")


class EnvironmentUpdate(BaseModel):
    """PATCH /api/environments/{id}"""
    name: str | None = Field(None, min_length=1, max_length=80)
    is_default: bool | None = None


class EnvironmentResponse(BaseModel):
    id: int
    workspace_id: int
    name: str
    is_default: bool
    created_by: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# EnvironmentVariable schemas
# ---------------------------------------------------------------------------

class VariableCreate(BaseModel):
    """POST /api/environments/{id}/variables"""
    key: str = Field(..., min_length=1, max_length=120, examples=["base_url"])
    value: str | None = Field(None, examples=["https://api.dev.nexgrid.io"])
    is_secret: bool = Field(
        False, description="Secrets are masked (***) in GET responses"
    )


class VariableUpdate(BaseModel):
    """PATCH /api/variables/{id}"""
    key: str | None = Field(None, min_length=1, max_length=120)
    value: str | None = None
    is_secret: bool | None = None


class VariableResponse(BaseModel):
    """
    Secret values are replaced with '***' so tokens never leak through the API.
    The real value is still stored in the DB and used during execution.
    """
    id: int
    environment_id: int
    key: str
    value: str | None = None   # masked to '***' server-side when is_secret=True
    is_secret: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EnvironmentWithVariablesResponse(EnvironmentResponse):
    """Environment + all its variables in one response."""
    variables: list[VariableResponse] = []
