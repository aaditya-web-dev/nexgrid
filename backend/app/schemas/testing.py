"""
Pydantic schemas for AI-powered test case management.
Covers generation, CRUD, approval lifecycle, and execution results.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Test Case schemas
# ---------------------------------------------------------------------------

class TestCaseCreate(BaseModel):
    """Manually created test case (non-AI)."""
    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="")
    category: str
    expected_status_code: int | None = None
    request_overrides: dict[str, Any] = Field(default_factory=dict)
    assertions: list[dict[str, Any]] = Field(default_factory=list)


class TestCaseUpdate(BaseModel):
    """PATCH /api/test-cases/{id}"""
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    category: str | None = None
    expected_status_code: int | None = None
    request_overrides: dict[str, Any] | None = None
    assertions: list[dict[str, Any]] | None = None


class TestCaseResponse(BaseModel):
    id: int
    request_id: int
    name: str
    description: str | None
    category: str
    request_overrides: dict[str, Any]
    expected_status_code: int | None
    assertions: list[dict[str, Any]]
    is_ai_generated: bool
    is_approved: bool
    created_by: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# AI generation request / response
# ---------------------------------------------------------------------------

class GenerateTestsRequest(BaseModel):
    """Optional body — future-proof if the user wants to add API schema hints."""
    api_schema_hint: str | None = Field(
        None,
        description="Optional OpenAPI snippet or description to help the LLM understand expected responses.",
    )


class GenerateTestsResponse(BaseModel):
    generated: int
    test_cases: list[TestCaseResponse]


# ---------------------------------------------------------------------------
# Test execution result schemas
# ---------------------------------------------------------------------------

class AssertionResultSchema(BaseModel):
    type: str
    passed: bool
    message: str
    actual: Any = None
    expected: Any = None


class TestResultResponse(BaseModel):
    id: int
    test_case_id: int
    executed_by: int | None
    status: str                    # passed | failed | error | skipped
    actual_status_code: int | None
    response_time_ms: float | None
    response_body: str | None
    failure_reason: str | None
    assertion_results: list[AssertionResultSchema] = Field(default_factory=list)
    executed_at: datetime

    model_config = {"from_attributes": True}


class RunTestsRequest(BaseModel):
    """Body for POST /api/requests/{id}/run-tests or /api/test-cases/{id}/run."""
    environment_id: int | None = None
    timeout_seconds: float = Field(default=30.0, gt=0, le=300)


class BulkRunRequest(BaseModel):
    """POST /api/requests/{request_id}/run-tests — run multiple approved tests."""
    environment_id: int | None = None
    timeout_seconds: float = Field(default=30.0, gt=0, le=300)
    # Optionally restrict to specific test case ids (default: all approved)
    test_case_ids: list[int] | None = None


class BulkRunResponse(BaseModel):
    executed: int
    passed: int
    failed: int
    errored: int
    results: list[TestResultResponse]
