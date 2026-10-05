"""
Pydantic schemas for ApiRequest endpoints.
"""
from datetime import datetime
from pydantic import BaseModel, Field
from app.models.enums import HttpMethod, BodyType, AuthType


# ---------------------------------------------------------------------------
# Request schemas (what the client sends)
# ---------------------------------------------------------------------------

class ApiRequestCreate(BaseModel):
    """POST /api/collections/{id}/requests"""
    name: str = Field(..., min_length=1, max_length=150, examples=["Login"])
    description: str | None = None
    method: HttpMethod = Field(HttpMethod.GET, examples=[HttpMethod.POST])
    url: str = Field(..., min_length=1, examples=["{{base_url}}/auth/login"])
    query_params: dict = Field(default_factory=dict, examples=[{"page": "1"}])
    headers: dict = Field(default_factory=dict, examples=[{"Content-Type": "application/json"}])
    body_type: BodyType = Field(BodyType.NONE)
    body: str | None = Field(None, examples=['{"username": "ashok"}'])
    auth_type: AuthType = Field(AuthType.NONE)
    auth_config: dict = Field(default_factory=dict, examples=[{"token": "{{api_token}}"}])
    position: int = Field(0, ge=0)
    folder_id: int | None = Field(None, description="Place inside a folder (optional)")


class ApiRequestUpdate(BaseModel):
    """PATCH /api/requests/{id} — all fields optional"""
    name: str | None = Field(None, min_length=1, max_length=150)
    description: str | None = None
    method: HttpMethod | None = None
    url: str | None = Field(None, min_length=1)
    query_params: dict | None = None
    headers: dict | None = None
    body_type: BodyType | None = None
    body: str | None = None
    auth_type: AuthType | None = None
    auth_config: dict | None = None
    position: int | None = Field(None, ge=0)
    folder_id: int | None = None


# ---------------------------------------------------------------------------
# Response schemas (what the API returns)
# ---------------------------------------------------------------------------

class ApiRequestResponse(BaseModel):
    """Full ApiRequest representation."""
    id: int
    collection_id: int
    folder_id: int | None = None
    name: str
    description: str | None = None
    method: HttpMethod
    url: str
    query_params: dict
    headers: dict
    body_type: BodyType
    body: str | None = None
    auth_type: AuthType
    auth_config: dict
    position: int
    created_by: int | None = None
    # Lock fields — exposed so the frontend can show who is editing
    locked_by: int | None = None
    locked_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ResolvedApiRequestResponse(ApiRequestResponse):
    """
    Same as ApiRequestResponse but URL / headers / body already have
    {{variable}} placeholders resolved against an environment.
    Returned by GET /api/requests/{id}/resolve?environment_id=...
    """
    resolved_url: str
    resolved_headers: dict
    resolved_body: str | None = None
