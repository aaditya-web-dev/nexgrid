"""
AI Test Case Generator Service.

Calls OpenAI (gpt-4o-mini) or Google Gemini to analyse an API request
definition and produce structured JSON test cases.

Flow:
  1. Build a detailed prompt from the ApiRequest fields.
  2. Call the LLM provider configured in settings.
  3. Parse + validate JSON output with Pydantic.
  4. Return a list of GeneratedTestCase objects — the router persists them.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import httpx
from pydantic import BaseModel, Field, ValidationError

from app.core.config import settings
from app.models.api_request import ApiRequest
from app.models.enums import TestCaseCategory

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Internal structured output schema (what the LLM must return)
# ---------------------------------------------------------------------------

class AssertionSpec(BaseModel):
    """A single assertion applied during test execution."""
    type: str = Field(
        ...,
        description=(
            "One of: status_code | body_contains | body_not_contains | "
            "json_field_equals | json_field_exists | header_equals | "
            "header_exists | response_time_lt"
        ),
    )
    target: str | None = Field(
        None,
        description="JSON path like 'data.id', header name, or key — depends on type.",
    )
    expected: Any = Field(
        None,
        description="Expected value. Omit for existence checks.",
    )

    class Config:
        extra = "ignore"


class GeneratedTestCase(BaseModel):
    """One AI-generated test case — mirrors the TestCase model closely."""
    name: str = Field(..., min_length=3, max_length=200)
    description: str = Field(default="")
    category: TestCaseCategory
    expected_status_code: int | None = None
    request_overrides: dict[str, Any] = Field(default_factory=dict)
    assertions: list[AssertionSpec] = Field(default_factory=list)

    class Config:
        extra = "ignore"


class GeneratedTestSuite(BaseModel):
    """Root wrapper the LLM must produce."""
    test_cases: list[GeneratedTestCase]


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

def _build_prompt(request: ApiRequest, api_schema_hint: str | None = None) -> str:
    """Compose the system + user prompt sent to the LLM."""
    # Sanitise auth so we never send real tokens to the LLM
    auth_config_safe: dict = {}
    if request.auth_config:
        for k, v in (request.auth_config or {}).items():
            auth_config_safe[k] = "***REDACTED***" if k.lower() in ("token", "password", "value") else v

    request_summary = json.dumps(
        {
            "method": str(request.method),
            "url": request.url,
            "headers": request.headers or {},
            "query_params": request.query_params or {},
            "body_type": str(request.body_type),
            "body": request.body or "",
            "auth_type": str(request.auth_type),
            "auth_config": auth_config_safe,
        },
        indent=2,
    )

    schema_section = ""
    if api_schema_hint:
        schema_section = f"\nAdditional API Schema / Hints:\n{api_schema_hint}\n"

    max_cases = settings.AI_MAX_TEST_CASES

    return f"""You are an expert API test engineer. Analyse the following API request and generate up to {max_cases} comprehensive test cases covering as many of these categories as are applicable:

- positive (happy path — expect 2xx)
- negative (bad input — expect 4xx/5xx)
- boundary (edge values, empty strings, max lengths)
- validation (missing required fields, wrong types)
- authentication (missing/invalid credentials)
- authorization (insufficient permissions if applicable)

API Request Definition:
``````json
{request_summary}
`````{schema_section}

Rules:
- Return ONLY valid JSON — no markdown fences, no commentary outside JSON.
- Root object must have key "test_cases" containing an array.
- Each test case must have: name, description, category, expected_status_code (integer or null), request_overrides (object — only fields that differ from the base request), assertions (array).
- request_overrides keys: "headers", "query_params", "body", "body_type" — omit keys that don't change.
- Assertion types: status_code | body_contains | body_not_contains | json_field_equals | json_field_exists | header_equals | header_exists | response_time_lt
- You have NOT seen any response from this API. Therefore NEVER guess response field names, nested paths, or error message text.
- Unless "Additional API Schema / Hints" above describes the response format, use ONLY these assertions: status_code and response_time_lt. Do not use body_contains, body_not_contains, json_field_equals, json_field_exists, header_equals or header_exists.
- Put the expected HTTP status in expected_status_code. Do NOT repeat it as a status_code assertion.
- Each negative, validation and boundary test must change exactly ONE thing from the base request, so the API fails for that one reason.
- For the positive (happy path) test, use brand new unique values for any field that must be unique (username, email, id), and do not reuse the base request values.
- For negative, validation and boundary tests, keep all other fields valid and unique, so a duplicate-value error does not hide the intended error.
- For response_time_lt: set "expected" to milliseconds (integer).
- Keep descriptions concise but informative.

Respond with the JSON object only."""


# ---------------------------------------------------------------------------
# Provider integrations
# ---------------------------------------------------------------------------

async def _call_openai(prompt: str) -> str:
    """Call OpenAI Chat Completions API and return the raw text content."""
    openai_key = getattr(settings, "OPENAI_API_KEY", "")
    if not openai_key:
        raise ValueError("OPENAI_API_KEY is not configured in .env")

    payload = {
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
        "response_format": {"type": "json_object"},
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {openai_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


async def _call_gemini(prompt: str) -> str:
    """Call Gemini with retries, falling back to other models if one is busy."""

    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured in .env")

    api_key = settings.GEMINI_API_KEY.strip()
    primary = settings.GEMINI_MODEL.strip().replace("models/", "")

    # Models tried in order. The one from .env goes first.
    fallbacks = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
    models = [primary] + [m for m in fallbacks if m != primary]

    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json"},
    }
    timeout = httpx.Timeout(90.0, connect=15.0)
    last_error = "unknown error"

    async with httpx.AsyncClient(timeout=timeout) as client:
        for model in models:
            url = (
                "https://generativelanguage.googleapis.com/"
                f"v1beta/models/{model}:generateContent"
            )
            for attempt in range(2):  # 2 tries per model
                try:
                    response = await client.post(url, headers=headers, json=payload)
                except httpx.RequestError as exc:
                    last_error = f"{model}: {exc!r}"
                    logger.warning("Gemini request failed (%s), trying next", last_error)
                    break  # go to next model

                if response.status_code == 200:
                    data = response.json()
                    candidates = data.get("candidates", [])
                    if not candidates:
                        raise ValueError(f"Gemini returned no candidates: {data}")
                    parts = candidates[0].get("content", {}).get("parts", [])
                    text_parts = [
                        p["text"] for p in parts
                        if "text" in p and not p.get("thought", False)
                    ]
                    if not text_parts:
                        raise ValueError("Gemini returned no text content")
                    logger.info("Gemini success with model=%s", model)
                    return "".join(text_parts)

                last_error = f"{model}: {response.status_code} {response.text[:200]}"
                logger.warning("Gemini error: %s", last_error)

                if response.status_code in (429, 500, 503):
                    await asyncio.sleep(2)  # short wait, then retry / next model
                    continue
                # 400/401/403/404 won't fix themselves, so stop immediately
                raise RuntimeError(f"Gemini API Error: {last_error}")

    raise RuntimeError(f"All Gemini models were busy or unreachable. Last error: {last_error}")


# ---------------------------------------------------------------------------
# Output cleanup
# ---------------------------------------------------------------------------

def _clean_cases(
    cases: list[GeneratedTestCase],
    allow_body_checks: bool,
) -> list[GeneratedTestCase]:
    """Remove guessed body assertions and duplicate assertions."""
    for tc in cases:
        seen = set()
        cleaned = []
        for a in tc.assertions:
            # status code already lives in expected_status_code
            if a.type == "status_code" and tc.expected_status_code is not None:
                continue
            # drop guessed body/header checks unless the response format was provided
            if not allow_body_checks and a.type not in ("status_code", "response_time_lt"):
                continue
            key = (a.type, a.target, str(a.expected))
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(a)
        tc.assertions = cleaned
    return cases


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def generate_test_cases(
    request: ApiRequest,
    api_schema_hint: str | None = None,
) -> list[GeneratedTestCase]:
    """
    Generate AI test cases for an ApiRequest.

    Raises:
        ValueError  – provider not configured or invalid JSON from LLM.
        RuntimeError / httpx.HTTPStatusError – provider API returned an error.
    """
    prompt = _build_prompt(request, api_schema_hint=api_schema_hint)

    provider = (settings.AI_PROVIDER or "gemini").lower()
    logger.info("AI test generation using provider=%s for request_id=%s", provider, request.id)

    if provider == "openai":
        raw_text = await _call_openai(prompt)
    elif provider == "gemini":
        raw_text = await _call_gemini(prompt)
    else:
        raise ValueError(f"Unknown AI_PROVIDER '{provider}'. Set to 'openai' or 'gemini'.")

    # Strip stray markdown fences the model may still emit despite instructions
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        cleaned = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    try:
        raw_obj = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.error("LLM returned invalid JSON: %s\nRaw: %s", exc, cleaned[:500])
        raise ValueError(f"LLM returned invalid JSON: {exc}") from exc

    try:
        suite = GeneratedTestSuite.model_validate(raw_obj)
    except ValidationError as exc:
        logger.error("LLM JSON failed Pydantic validation: %s", exc)
        raise ValueError(f"LLM output did not match expected schema: {exc}") from exc

    logger.info(
        "AI generated %d test cases for request_id=%s",
        len(suite.test_cases),
        request.id,
    )
    return _clean_cases(suite.test_cases, allow_body_checks=bool(api_schema_hint))