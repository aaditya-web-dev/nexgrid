"""
API execution engine service using httpx.AsyncClient.

Handles:
- Full variable resolution (URL, params, headers, body, auth)
- Authentication schemes (Bearer, Basic, API Key)
- Content-type and payload structuring (JSON, form-urlencoded, raw)
- Response timing and metrics (status, headers, body, size, time in ms)
- Graceful error handling for timeouts, connection failures, and invalid URLs
- History persistence via RequestExecution database records
"""
import time
from typing import Any
import httpx
from sqlalchemy.orm import Session

from app.models.api_request import ApiRequest
from app.models.enums import AuthType, BodyType
from app.models.testing import RequestExecution
from app.services.variables import resolve_full_request


async def execute_api_request(
    request: ApiRequest,
    db: Session,
    environment_id: int | None = None,
    executed_by_id: int | None = None,
    timeout_seconds: float = 30.0,
) -> RequestExecution:
    """
    Execute an ApiRequest using an asynchronous HTTP client, record metrics,
    save the execution history in the database, and return the RequestExecution record.
    """
    # 1. Resolve variables with environment if provided
    (
        resolved_url,
        resolved_params,
        resolved_headers,
        resolved_body,
        resolved_auth_config,
    ) = resolve_full_request(
        url=request.url,
        query_params=request.query_params or {},
        headers=request.headers or {},
        body=request.body,
        auth_config=request.auth_config or {},
        environment_id=environment_id,
        db=db,
    )

    # Make working copies of headers and query parameters
    headers: dict[str, str] = {str(k): str(v) for k, v in resolved_headers.items()}
    params: dict[str, Any] = dict(resolved_params)
    basic_auth: httpx.BasicAuth | None = None

    # 2. Process authentication
    auth_type = request.auth_type
    if auth_type == AuthType.BEARER:
        token = resolved_auth_config.get("token", "")
        if token:
            headers["Authorization"] = f"Bearer {token}"

    elif auth_type == AuthType.BASIC:
        username = resolved_auth_config.get("username", "")
        password = resolved_auth_config.get("password", "")
        basic_auth = httpx.BasicAuth(username=username, password=password)

    elif auth_type == AuthType.API_KEY:
        key = resolved_auth_config.get("key", "X-API-Key")
        value = resolved_auth_config.get("value", "")
        add_to = str(resolved_auth_config.get("add_to", "header")).lower()
        if add_to in ("query", "query_params", "param"):
            params[key] = value
        else:
            headers[key] = value

    # 3. Structure payload and content-type
    content: bytes | None = None
    body_type = request.body_type

    # Case-insensitive check for Content-Type
    header_keys_lower = {k.lower(): k for k in headers}

    if body_type == BodyType.JSON:
        if "content-type" not in header_keys_lower:
            headers["Content-Type"] = "application/json"
        if resolved_body:
            content = resolved_body.encode("utf-8")

    elif body_type == BodyType.X_WWW_FORM_URLENCODED:
        if "content-type" not in header_keys_lower:
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        if resolved_body:
            content = resolved_body.encode("utf-8")

    elif body_type in (BodyType.RAW, BodyType.FORM_DATA):
        if resolved_body:
            content = resolved_body.encode("utf-8")

    elif body_type == BodyType.NONE:
        content = None

    # Ensure URL has an HTTP scheme if none provided
    target_url = resolved_url.strip()
    if target_url and not target_url.startswith(("http://", "https://")):
        target_url = f"https://{target_url}"

    # 4. Perform execution and measure time
    status_code: int | None = None
    response_time_ms: float | None = None
    response_headers: dict[str, str] = {}
    response_body: str | None = None
    response_size_bytes: int | None = None
    error_message: str | None = None

    start_time = time.perf_counter()

    try:
        async with httpx.AsyncClient(
            timeout=timeout_seconds,
            follow_redirects=True,
            verify=True,
        ) as client:
            response = await client.request(
                method=request.method.value,
                url=target_url,
                params=params,
                headers=headers,
                content=content,
                auth=basic_auth,
            )

        elapsed = time.perf_counter() - start_time
        response_time_ms = round(elapsed * 1000, 2)
        status_code = response.status_code
        response_headers = dict(response.headers)
        response_size_bytes = len(response.content)

        # Attempt to decode text response (limit to max 2MB for storage safety)
        try:
            raw_text = response.text
            response_body = raw_text[:2_000_000] if len(raw_text) > 2_000_000 else raw_text
        except Exception:
            response_body = f"<Binary data: {response_size_bytes} bytes>"

    except httpx.TimeoutException:
        elapsed = time.perf_counter() - start_time
        response_time_ms = round(elapsed * 1000, 2)
        error_message = f"Request timed out after {timeout_seconds} seconds"

    except httpx.ConnectError as exc:
        elapsed = time.perf_counter() - start_time
        response_time_ms = round(elapsed * 1000, 2)
        error_message = f"Connection failed: {exc}"

    except (httpx.InvalidURL, httpx.UnsupportedProtocol) as exc:
        response_time_ms = 0.0
        error_message = f"Invalid URL '{target_url}': {exc}"

    except httpx.HTTPError as exc:
        elapsed = time.perf_counter() - start_time
        response_time_ms = round(elapsed * 1000, 2)
        error_message = f"HTTP transport error: {exc}"

    except Exception as exc:
        elapsed = time.perf_counter() - start_time
        response_time_ms = round(elapsed * 1000, 2)
        error_message = f"Unexpected execution error: {exc}"

    # 5. Persist RequestExecution to database
    execution = RequestExecution(
        request_id=request.id,
        executed_by=executed_by_id,
        environment_id=environment_id,
        status_code=status_code,
        response_time_ms=response_time_ms,
        response_headers=response_headers,
        response_body=response_body,
        response_size_bytes=response_size_bytes,
        error_message=error_message,
    )
    db.add(execution)
    db.commit()
    db.refresh(execution)

    return execution


async def execute_direct_request(
    url: str,
    method: str = "GET",
    headers: dict | None = None,
    params: dict | None = None,
    body: str | None = None,
    timeout_seconds: float = 30.0,
) -> dict[str, Any]:
    """
    Execute any HTTP URL directly without requiring a saved database record.
    Returns status, response_time_ms, headers, body, size, and error_message.
    """
    target_url = url.strip()
    if target_url and not target_url.startswith(("http://", "https://")):
        target_url = f"https://{target_url}"

    req_headers: dict[str, str] = {str(k): str(v) for k, v in (headers or {}).items()}
    req_params: dict[str, Any] = dict(params or {})
    content: bytes | None = body.encode("utf-8") if body else None

    # Auto set JSON content-type if body is JSON string and not present
    if content and "content-type" not in {k.lower() for k in req_headers}:
        if body and body.strip().startswith(("{", "[")):
            req_headers["Content-Type"] = "application/json"

    status_code: int | None = None
    response_time_ms: float | None = None
    response_headers: dict[str, str] = {}
    response_body: str | None = None
    response_size_bytes: int | None = None
    error_message: str | None = None

    start_time = time.perf_counter()

    try:
        async with httpx.AsyncClient(
            timeout=timeout_seconds,
            follow_redirects=True,
            verify=True,
        ) as client:
            response = await client.request(
                method=method.upper(),
                url=target_url,
                params=req_params,
                headers=req_headers,
                content=content,
            )

        elapsed = time.perf_counter() - start_time
        response_time_ms = round(elapsed * 1000, 2)
        status_code = response.status_code
        response_headers = dict(response.headers)
        response_size_bytes = len(response.content)

        try:
            raw_text = response.text
            response_body = raw_text[:2_000_000] if len(raw_text) > 2_000_000 else raw_text
        except Exception:
            response_body = f"<Binary data: {response_size_bytes} bytes>"

    except httpx.TimeoutException:
        elapsed = time.perf_counter() - start_time
        response_time_ms = round(elapsed * 1000, 2)
        error_message = f"Request timed out after {timeout_seconds} seconds"

    except httpx.ConnectError as exc:
        elapsed = time.perf_counter() - start_time
        response_time_ms = round(elapsed * 1000, 2)
        error_message = f"Connection failed: {exc}"

    except (httpx.InvalidURL, httpx.UnsupportedProtocol) as exc:
        response_time_ms = 0.0
        error_message = f"Invalid URL '{target_url}': {exc}"

    except httpx.HTTPError as exc:
        elapsed = time.perf_counter() - start_time
        response_time_ms = round(elapsed * 1000, 2)
        error_message = f"HTTP transport error: {exc}"

    except Exception as exc:
        elapsed = time.perf_counter() - start_time
        response_time_ms = round(elapsed * 1000, 2)
        error_message = f"Unexpected execution error: {exc}"

    return {
        "status_code": status_code,
        "response_time_ms": response_time_ms,
        "response_headers": response_headers,
        "response_body": response_body,
        "response_size_bytes": response_size_bytes,
        "error_message": error_message,
    }
