"""
Pydantic schemas for Request Execution.
"""
from datetime import datetime
from pydantic import BaseModel, Field


class ExecutionTrigger(BaseModel):
    """Optional payload when triggering request execution with overrides."""
    environment_id: int | None = Field(
        None,
        description="Environment to use for {{variable}} substitution. Falls back to workspace default if omitted.",
    )


class RequestExecutionResponse(BaseModel):
    """Execution result representation returned to the client and saved in history."""
    id: int
    request_id: int
    executed_by: int | None = None
    environment_id: int | None = None
    status_code: int | None = None
    response_time_ms: float | None = None
    response_headers: dict | None = Field(default_factory=dict)
    response_body: str | None = None
    response_size_bytes: int | None = None
    error_message: str | None = None
    executed_at: datetime

    model_config = {"from_attributes": True}


class DirectExecutionRequest(BaseModel):
    """Payload to test any HTTP URL directly without saving it first."""
    url: str = Field(..., examples=["https://httpbin.org/get"])
    method: str = Field("GET", examples=["GET"])
    headers: dict = Field(default_factory=dict, examples=[{"Accept": "application/json"}])
    query_params: dict = Field(default_factory=dict, examples=[{}])
    body: str | None = Field(None, examples=[None])


class DirectExecutionResponse(BaseModel):
    """Direct live execution response with metrics and response data."""
    status_code: int | None = None
    response_time_ms: float | None = None
    response_headers: dict | None = Field(default_factory=dict)
    response_body: str | None = None
    response_size_bytes: int | None = None
    error_message: str | None = None
