"""
Test Cases router — AI test generation, CRUD, approval, and execution.

Endpoints
---------
POST   /api/requests/{request_id}/generate-tests   Generate AI test cases
GET    /api/requests/{request_id}/test-cases        List test cases
POST   /api/requests/{request_id}/test-cases        Manually create test case
PATCH  /api/test-cases/{test_id}                   Edit test case
POST   /api/test-cases/{test_id}/approve            Approve test case
POST   /api/test-cases/{test_id}/reject             Reset to pending
DELETE /api/test-cases/{test_id}                   Hard delete
POST   /api/test-cases/{test_id}/run               Execute a single test case
GET    /api/test-cases/{test_id}/results            List execution results
POST   /api/requests/{request_id}/run-tests         Bulk run all approved tests
"""
from __future__ import annotations

import base64
import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.models.user import User
from app.models.workspace import WorkspaceMember
from app.models.collection import Collection
from app.models.api_request import ApiRequest
from app.models.testing import TestCase, TestResult
from app.models.enums import TestCaseCategory, TestResultStatus
from app.schemas.testing import (
    TestCaseCreate,
    TestCaseUpdate,
    TestCaseResponse,
    GenerateTestsRequest,
    GenerateTestsResponse,
    TestResultResponse,
    AssertionResultSchema,
    RunTestsRequest,
    BulkRunRequest,
    BulkRunResponse,
)
from app.services.ai_generator import generate_test_cases
from app.services.assertion_engine import evaluate_all_assertions
from app.services.executor import execute_direct_request
from app.services.variables import resolve_full_request

logger = logging.getLogger(__name__)

router = APIRouter(tags=["test-cases"])

CurrentUser = Annotated[User, Depends(get_current_active_user)]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_request_and_assert_member(
    request_id: int, user: User, db: Session
) -> tuple[ApiRequest, Collection]:
    req = db.query(ApiRequest).filter(ApiRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    col = db.query(Collection).filter(Collection.id == req.collection_id).first()
    if not col:
        raise HTTPException(status_code=404, detail="Collection not found")

    membership = (
        db.query(WorkspaceMember)
        .filter(
            WorkspaceMember.workspace_id == col.workspace_id,
            WorkspaceMember.user_id == user.id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this workspace",
        )
    return req, col


def _get_test_case_and_assert_member(
    test_id: int, user: User, db: Session
) -> tuple[TestCase, ApiRequest, Collection]:
    tc = db.query(TestCase).filter(TestCase.id == test_id).first()
    if not tc:
        raise HTTPException(status_code=404, detail="Test case not found")
    req, col = _get_request_and_assert_member(tc.request_id, user, db)
    return tc, req, col


def _serialize_assertions(assertion_results: list[dict], failure_reason: str | None) -> str:
    """Store assertion results + reason as a JSON string in failure_reason column."""
    return json.dumps({"reason": failure_reason, "assertions": assertion_results})


def _deserialize_failure_reason(raw: str | None) -> tuple[str | None, list[dict]]:
    """Parse stored failure_reason back into (plain_reason, assertion_results_list)."""
    if not raw:
        return None, []
    if raw.strip().startswith("{"):
        try:
            obj = json.loads(raw)
            return obj.get("reason"), obj.get("assertions", [])
        except json.JSONDecodeError:
            pass
    return raw, []


def _build_test_result_response(tr: TestResult) -> TestResultResponse:
    reason, assertion_dicts = _deserialize_failure_reason(tr.failure_reason)
    assertion_results = [AssertionResultSchema(**a) for a in assertion_dicts]
    return TestResultResponse(
        id=tr.id,
        test_case_id=tr.test_case_id,
        executed_by=tr.executed_by,
        status=tr.status.value if hasattr(tr.status, "value") else str(tr.status),
        actual_status_code=tr.actual_status_code,
        response_time_ms=tr.response_time_ms,
        response_body=tr.response_body,
        failure_reason=reason,
        assertion_results=assertion_results,
        executed_at=tr.executed_at,
    )


async def _run_test_case(
    tc: TestCase,
    req: ApiRequest,
    db: Session,
    executed_by_id: int,
    environment_id: int | None,
    timeout_seconds: float,
) -> TestResult:
    """Execute a single test case against the real endpoint and persist a TestResult."""

    # Resolve variables on the base request
    try:
        (
            resolved_url,
            resolved_params,
            resolved_headers,
            resolved_body,
            resolved_auth_config,
        ) = resolve_full_request(
            url=req.url,
            query_params=req.query_params or {},
            headers=req.headers or {},
            body=req.body,
            auth_config=req.auth_config or {},
            environment_id=environment_id,
            db=db,
        )
    except Exception as exc:
        logger.warning("Variable resolution failed for test case %s: %s", tc.id, exc)
        resolved_url = req.url or ""
        resolved_params = req.query_params or {}
        resolved_headers = req.headers or {}
        resolved_body = req.body
        resolved_auth_config = req.auth_config or {}

    # Apply test case overrides on top of resolved values
    overrides = tc.request_overrides or {}
    merged_headers: dict = {**resolved_headers, **(overrides.get("headers") or {})}
    merged_params: dict = {**resolved_params, **(overrides.get("query_params") or {})}
    merged_body: str | None = overrides.get("body", resolved_body)

    # Apply auth headers from base request
    auth_type = req.auth_type
    if hasattr(auth_type, "value"):
        auth_type_str = auth_type.value
    else:
        auth_type_str = str(auth_type or "").lower()

    if auth_type_str == "bearer":
        token = resolved_auth_config.get("token", "")
        if token:
            merged_headers["Authorization"] = f"Bearer {token}"
    elif auth_type_str == "api_key":
        key = resolved_auth_config.get("key", "X-API-Key")
        value = resolved_auth_config.get("value", "")
        add_to = str(resolved_auth_config.get("add_to", "header")).lower()
        if add_to in ("query", "query_params", "param"):
            merged_params[key] = value
        else:
            merged_headers[key] = value
    elif auth_type_str == "basic":
        username = resolved_auth_config.get("username", "")
        password = resolved_auth_config.get("password", "")
        if username or password:
            creds = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("utf-8")
            merged_headers["Authorization"] = f"Basic {creds}"

    method_str = req.method.value if hasattr(req.method, "value") else str(req.method)

    # Execute
    result = await execute_direct_request(
        url=resolved_url,
        method=method_str,
        headers=merged_headers,
        params=merged_params,
        body=merged_body,
        timeout_seconds=timeout_seconds,
    )

    # Evaluate assertions
    if result.get("error_message"):
        # Network/timeout error — cannot evaluate assertions
        test_result_status = TestResultStatus.ERROR
        failure_stored = _serialize_assertions([], result["error_message"])
        tr = TestResult(
            test_case_id=tc.id,
            executed_by=executed_by_id,
            status=test_result_status,
            actual_status_code=result.get("status_code"),
            response_time_ms=result.get("response_time_ms"),
            response_body=result.get("response_body"),
            failure_reason=failure_stored,
        )
    else:
        all_passed, assertion_results, failure_reason = evaluate_all_assertions(
            tc.assertions or [],
            tc.expected_status_code,
            actual_status_code=result.get("status_code"),
            response_body=result.get("response_body"),
            response_headers=result.get("response_headers") or {},
            response_time_ms=result.get("response_time_ms"),
        )
        test_result_status = TestResultStatus.PASSED if all_passed else TestResultStatus.FAILED
        failure_stored = _serialize_assertions(assertion_results, failure_reason)

        tr = TestResult(
            test_case_id=tc.id,
            executed_by=executed_by_id,
            status=test_result_status,
            actual_status_code=result.get("status_code"),
            response_time_ms=result.get("response_time_ms"),
            response_body=result.get("response_body"),
            failure_reason=failure_stored,
        )

    db.add(tr)
    db.commit()
    db.refresh(tr)
    return tr


# ---------------------------------------------------------------------------
# AI Generation
# ---------------------------------------------------------------------------

@router.post(
    "/api/requests/{request_id}/generate-tests",
    response_model=GenerateTestsResponse,
    summary="Generate AI test cases for a request",
)
async def generate_tests(
    request_id: int,
    current_user: CurrentUser,
    body: GenerateTestsRequest = GenerateTestsRequest(),
    db: Session = Depends(get_db),
):
    req, _ = _get_request_and_assert_member(request_id, current_user, db)

    try:
        generated = await generate_test_cases(req, api_schema_hint=body.api_schema_hint)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error("AI generation failed for request %s: %s", request_id, exc)
        raise HTTPException(status_code=502, detail=f"AI provider error: {exc}")

    saved: list[TestCase] = []
    for gtc in generated:
        tc = TestCase(
            request_id=request_id,
            name=gtc.name,
            description=gtc.description or "",
            category=gtc.category,
            expected_status_code=gtc.expected_status_code,
            request_overrides=gtc.request_overrides or {},
            assertions=[a.model_dump() for a in gtc.assertions],
            is_ai_generated=True,
            is_approved=False,
            created_by=current_user.id,
        )
        db.add(tc)
        saved.append(tc)

    db.commit()
    for tc in saved:
        db.refresh(tc)

    return GenerateTestsResponse(
        generated=len(saved),
        test_cases=[TestCaseResponse.model_validate(tc) for tc in saved],
    )


# ---------------------------------------------------------------------------
# List & Create
# ---------------------------------------------------------------------------

@router.get(
    "/api/requests/{request_id}/test-cases",
    response_model=list[TestCaseResponse],
    summary="List test cases for a request",
)
def list_test_cases(
    request_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    _get_request_and_assert_member(request_id, current_user, db)
    test_cases = (
        db.query(TestCase)
        .filter(TestCase.request_id == request_id)
        .order_by(TestCase.created_at)
        .all()
    )
    return [TestCaseResponse.model_validate(tc) for tc in test_cases]


@router.post(
    "/api/requests/{request_id}/test-cases",
    response_model=TestCaseResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Manually create a test case",
)
def create_test_case(
    request_id: int,
    payload: TestCaseCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    _get_request_and_assert_member(request_id, current_user, db)

    try:
        category = TestCaseCategory(payload.category)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid category '{payload.category}'")

    tc = TestCase(
        request_id=request_id,
        name=payload.name,
        description=payload.description or "",
        category=category,
        expected_status_code=payload.expected_status_code,
        request_overrides=payload.request_overrides or {},
        assertions=payload.assertions or [],
        is_ai_generated=False,
        is_approved=False,
        created_by=current_user.id,
    )
    db.add(tc)
    db.commit()
    db.refresh(tc)
    return TestCaseResponse.model_validate(tc)


# ---------------------------------------------------------------------------
# Update / Approve / Reject / Delete
# ---------------------------------------------------------------------------

@router.patch(
    "/api/test-cases/{test_id}",
    response_model=TestCaseResponse,
    summary="Update a test case",
)
def update_test_case(
    test_id: int,
    payload: TestCaseUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    tc, _, _ = _get_test_case_and_assert_member(test_id, current_user, db)

    if payload.name is not None:
        tc.name = payload.name
    if payload.description is not None:
        tc.description = payload.description
    if payload.category is not None:
        try:
            tc.category = TestCaseCategory(payload.category)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid category '{payload.category}'")
    if payload.expected_status_code is not None:
        tc.expected_status_code = payload.expected_status_code
    if payload.request_overrides is not None:
        tc.request_overrides = payload.request_overrides
    if payload.assertions is not None:
        tc.assertions = payload.assertions

    db.commit()
    db.refresh(tc)
    return TestCaseResponse.model_validate(tc)


@router.post(
    "/api/test-cases/{test_id}/approve",
    response_model=TestCaseResponse,
    summary="Approve a test case",
)
def approve_test_case(
    test_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    tc, _, _ = _get_test_case_and_assert_member(test_id, current_user, db)
    tc.is_approved = True
    db.commit()
    db.refresh(tc)
    return TestCaseResponse.model_validate(tc)


@router.post(
    "/api/test-cases/{test_id}/reject",
    response_model=TestCaseResponse,
    summary="Reset a test case to pending (unapprove)",
)
def reject_test_case(
    test_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    tc, _, _ = _get_test_case_and_assert_member(test_id, current_user, db)
    tc.is_approved = False
    db.commit()
    db.refresh(tc)
    return TestCaseResponse.model_validate(tc)


@router.delete(
    "/api/test-cases/{test_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a test case",
)
def delete_test_case(
    test_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    tc, _, _ = _get_test_case_and_assert_member(test_id, current_user, db)
    db.delete(tc)
    db.commit()


# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------

@router.post(
    "/api/test-cases/{test_id}/run",
    response_model=TestResultResponse,
    summary="Run a single test case",
)
async def run_test_case(
    test_id: int,
    current_user: CurrentUser,
    payload: RunTestsRequest = RunTestsRequest(),
    db: Session = Depends(get_db),
):
    tc, req, _ = _get_test_case_and_assert_member(test_id, current_user, db)

    tr = await _run_test_case(
        tc=tc,
        req=req,
        db=db,
        executed_by_id=current_user.id,
        environment_id=payload.environment_id,
        timeout_seconds=payload.timeout_seconds,
    )
    return _build_test_result_response(tr)


@router.get(
    "/api/test-cases/{test_id}/results",
    response_model=list[TestResultResponse],
    summary="Get execution results for a test case",
)
def get_test_results(
    test_id: int,
    current_user: CurrentUser,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    tc, _, _ = _get_test_case_and_assert_member(test_id, current_user, db)
    results = (
        db.query(TestResult)
        .filter(TestResult.test_case_id == tc.id)
        .order_by(TestResult.executed_at.desc())
        .limit(limit)
        .all()
    )
    return [_build_test_result_response(tr) for tr in results]


@router.post(
    "/api/requests/{request_id}/run-tests",
    response_model=BulkRunResponse,
    summary="Bulk-run all approved test cases for a request",
)
async def bulk_run_tests(
    request_id: int,
    current_user: CurrentUser,
    payload: BulkRunRequest = BulkRunRequest(),
    db: Session = Depends(get_db),
):
    req, _ = _get_request_and_assert_member(request_id, current_user, db)

    query = db.query(TestCase).filter(
        TestCase.request_id == request_id,
        TestCase.is_approved == True,  # noqa: E712
    )
    if payload.test_case_ids:
        query = query.filter(TestCase.id.in_(payload.test_case_ids))

    test_cases = query.order_by(TestCase.created_at).all()

    results: list[TestResultResponse] = []
    passed = failed = errored = 0

    for tc in test_cases:
        try:
            tr = await _run_test_case(
                tc=tc,
                req=req,
                db=db,
                executed_by_id=current_user.id,
                environment_id=payload.environment_id,
                timeout_seconds=payload.timeout_seconds,
            )
            resp = _build_test_result_response(tr)
            results.append(resp)
            if resp.status == "passed":
                passed += 1
            elif resp.status == "failed":
                failed += 1
            else:
                errored += 1
        except Exception as exc:
            logger.error("Error running test case %s: %s", tc.id, exc)
            errored += 1

    return BulkRunResponse(
        executed=len(results),
        passed=passed,
        failed=failed,
        errored=errored,
        results=results,
    )
