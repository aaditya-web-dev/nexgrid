"""
API Requests router — CRUD for API requests within collections.

Endpoints
---------
POST   /api/collections/{collection_id}/requests        create request
GET    /api/collections/{collection_id}/requests        list requests in collection
GET    /api/requests/{request_id}                       get one request
GET    /api/requests/{request_id}/resolve               get request with {{vars}} resolved
PATCH  /api/requests/{request_id}                       update request
DELETE /api/requests/{request_id}                       delete request
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.models.user import User
from app.models.workspace import WorkspaceMember
from app.models.collection import Collection, Folder
from app.models.api_request import ApiRequest
from app.models.environment import Environment
from app.models.testing import RequestExecution
from app.schemas.request import (
    ApiRequestCreate,
    ApiRequestUpdate,
    ApiRequestResponse,
    ResolvedApiRequestResponse,
)
from app.schemas.execution import (
    RequestExecutionResponse,
    DirectExecutionRequest,
    DirectExecutionResponse,
)
from app.services.variables import resolve_request
from app.services.executor import execute_api_request, execute_direct_request

router = APIRouter(tags=["requests"])

CurrentUser = Annotated[User, Depends(get_current_active_user)]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_collection_or_404(collection_id: int, db: Session) -> Collection:
    col = db.query(Collection).filter(Collection.id == collection_id).first()
    if not col:
        raise HTTPException(status_code=404, detail="Collection not found")
    return col


def assert_member(workspace_id: int, user: User, db: Session) -> None:
    m = (
        db.query(WorkspaceMember)
        .filter(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user.id,
        )
        .first()
    )
    if not m:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this workspace",
        )


def get_request_or_404(request_id: int, db: Session) -> ApiRequest:
    req = db.query(ApiRequest).filter(ApiRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    return req


def validate_folder(folder_id: int | None, collection_id: int, db: Session) -> None:
    """If a folder_id is given, make sure it belongs to the same collection."""
    if folder_id is None:
        return
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    if folder.collection_id != collection_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Folder does not belong to this collection",
        )


# ===========================================================================
# Endpoints
# ===========================================================================

@router.post(
    "/api/collections/{collection_id}/requests",
    response_model=ApiRequestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an API request inside a collection",
)
def create_request(
    collection_id: int,
    payload: ApiRequestCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Creates a new API request under the given collection.
    Optionally place it inside a folder via ``folder_id``.
    """
    col = get_collection_or_404(collection_id, db)
    assert_member(col.workspace_id, current_user, db)
    validate_folder(payload.folder_id, collection_id, db)

    req = ApiRequest(
        collection_id=collection_id,
        folder_id=payload.folder_id,
        name=payload.name,
        description=payload.description,
        method=payload.method,
        url=payload.url,
        query_params=payload.query_params,
        headers=payload.headers,
        body_type=payload.body_type,
        body=payload.body,
        auth_type=payload.auth_type,
        auth_config=payload.auth_config,
        position=payload.position,
        created_by=current_user.id,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


@router.get(
    "/api/collections/{collection_id}/requests",
    response_model=list[ApiRequestResponse],
    summary="List all requests in a collection",
)
def list_requests(
    collection_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    folder_id: int | None = Query(None, description="Filter by folder (omit for all)"),
):
    """
    Returns all API requests in the collection, ordered by position.
    Pass ``?folder_id=`` to filter to a specific folder.
    Pass ``?folder_id=0`` is NOT supported — use the collection root listing.
    """
    col = get_collection_or_404(collection_id, db)
    assert_member(col.workspace_id, current_user, db)

    q = db.query(ApiRequest).filter(ApiRequest.collection_id == collection_id)

    if folder_id is not None:
        q = q.filter(ApiRequest.folder_id == folder_id)

    return q.order_by(ApiRequest.position).all()


@router.get(
    "/api/requests/{request_id}",
    response_model=ApiRequestResponse,
    summary="Get a single API request",
)
def get_request(
    request_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    req = get_request_or_404(request_id, db)
    col = get_collection_or_404(req.collection_id, db)
    assert_member(col.workspace_id, current_user, db)
    return req


@router.get(
    "/api/requests/{request_id}/resolve",
    response_model=ResolvedApiRequestResponse,
    summary="Get request with {{variables}} resolved against an environment",
)
def get_resolved_request(
    request_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    environment_id: int | None = Query(
        None,
        description="Environment to resolve variables from. "
                    "If omitted, placeholders are left as-is.",
    ),
):
    """
    Returns the request with ``resolved_url``, ``resolved_headers``, and
    ``resolved_body`` fields populated after substituting ``{{variable}}``
    placeholders with values from the specified environment.

    Example: if ``url = "{{base_url}}/login"`` and the environment has
    ``base_url = "https://api.dev"``, ``resolved_url`` will be
    ``"https://api.dev/login"``.
    """
    req = get_request_or_404(request_id, db)
    col = get_collection_or_404(req.collection_id, db)
    assert_member(col.workspace_id, current_user, db)

    resolved_url, resolved_headers, resolved_body = resolve_request(
        url=req.url,
        headers=req.headers or {},
        body=req.body,
        environment_id=environment_id,
        db=db,
    )

    # Build response by merging base fields + resolved fields
    return ResolvedApiRequestResponse(
        **{c.name: getattr(req, c.name) for c in req.__table__.columns},
        resolved_url=resolved_url,
        resolved_headers=resolved_headers,
        resolved_body=resolved_body,
    )


@router.patch(
    "/api/requests/{request_id}",
    response_model=ApiRequestResponse,
    summary="Update an API request",
)
def update_request(
    request_id: int,
    payload: ApiRequestUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    req = get_request_or_404(request_id, db)
    col = get_collection_or_404(req.collection_id, db)
    assert_member(col.workspace_id, current_user, db)

    # Validate new folder if provided
    if payload.folder_id is not None:
        validate_folder(payload.folder_id, req.collection_id, db)

    # Apply only the fields that were actually sent (exclude_unset)
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(req, field, value)

    db.commit()
    db.refresh(req)
    return req


@router.delete(
    "/api/requests/{request_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an API request",
)
def delete_request(
    request_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    req = get_request_or_404(request_id, db)
    col = get_collection_or_404(req.collection_id, db)
    assert_member(col.workspace_id, current_user, db)
    db.delete(req)
    db.commit()


# ===========================================================================
# Execution Endpoints (Week 6)
# ===========================================================================

@router.post(
    "/api/requests/{request_id}/execute",
    response_model=RequestExecutionResponse,
    summary="Execute an API request and record execution metrics",
)
async def execute_request(
    request_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    environment_id: int | None = Query(
        None,
        description="Environment ID for {{variable}} resolution. If omitted, uses default workspace environment if configured.",
    ),
    timeout_seconds: float = Query(
        30.0,
        ge=1.0,
        le=120.0,
        description="Request timeout in seconds (1 to 120s).",
    ),
):
    """
    Execute the API request using an asynchronous HTTP client:
    - Resolves all {{variable}} placeholders with the given or default environment.
    - Applies authentication (Bearer, Basic, API Key).
    - Sets appropriate Content-Type and payload.
    - Measures elapsed response time in milliseconds.
    - Captures status code, response headers, response body, and byte size.
    - Handles timeouts and network connection errors gracefully.
    - Records the result in the RequestExecution history table.
    """
    req = get_request_or_404(request_id, db)
    col = get_collection_or_404(req.collection_id, db)
    assert_member(col.workspace_id, current_user, db)

    # If environment_id was not explicitly specified, check for workspace default environment
    effective_env_id = environment_id
    if effective_env_id is None:
        default_env = (
            db.query(Environment)
            .filter(
                Environment.workspace_id == col.workspace_id,
                Environment.is_default == True,  # noqa: E712
            )
            .first()
        )
        if default_env:
            effective_env_id = default_env.id
    elif effective_env_id is not None:
        # Validate that specified environment belongs to the workspace
        env = (
            db.query(Environment)
            .filter(
                Environment.id == effective_env_id,
                Environment.workspace_id == col.workspace_id,
            )
            .first()
        )
        if not env:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Environment {effective_env_id} does not exist in this workspace",
            )

    execution = await execute_api_request(
        request=req,
        db=db,
        environment_id=effective_env_id,
        executed_by_id=current_user.id,
        timeout_seconds=timeout_seconds,
    )

    return execution


@router.get(
    "/api/requests/{request_id}/executions",
    response_model=list[RequestExecutionResponse],
    summary="List execution history for a request",
)
def list_request_executions(
    request_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    limit: int = Query(20, ge=1, le=100, description="Max number of execution logs to return"),
):
    """Return historical execution records for this request, most recent first."""
    req = get_request_or_404(request_id, db)
    col = get_collection_or_404(req.collection_id, db)
    assert_member(col.workspace_id, current_user, db)

    return (
        db.query(RequestExecution)
        .filter(RequestExecution.request_id == request_id)
        .order_by(RequestExecution.executed_at.desc())
        .limit(limit)
        .all()
    )


@router.get(
    "/api/executions/{execution_id}",
    response_model=RequestExecutionResponse,
    summary="Get details of a single execution",
)
def get_execution_detail(
    execution_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Fetch details of a specific execution event."""
    execution = db.query(RequestExecution).filter(RequestExecution.id == execution_id).first()
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    req = get_request_or_404(execution.request_id, db)
    col = get_collection_or_404(req.collection_id, db)
    assert_member(col.workspace_id, current_user, db)

    return execution


@router.post(
    "/api/requests/quick-run",
    response_model=DirectExecutionResponse,
    summary="Directly test any HTTP endpoint without saving it first",
)
async def quick_run_endpoint(
    payload: DirectExecutionRequest,
    current_user: CurrentUser,
    timeout_seconds: float = Query(
        30.0,
        ge=1.0,
        le=120.0,
        description="Timeout in seconds",
    ),
):
    """
    Instantly sends an HTTP request to any target URL and returns live response metrics.
    No workspace or collection setup required.
    """
    result = await execute_direct_request(
        url=payload.url,
        method=payload.method,
        headers=payload.headers,
        params=payload.query_params,
        body=payload.body,
        timeout_seconds=timeout_seconds,
    )
    return result


