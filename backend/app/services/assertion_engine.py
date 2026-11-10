"""
Assertion evaluation engine for test case execution.

Evaluates structured assertions against an HTTP response and returns
pass/fail per assertion plus an overall result.

Supported assertion types:
  status_code         – exact match against HTTP status (uses expected_status_code on TestCase)
  body_contains       – substring present in response body
  body_not_contains   – substring absent from response body
  json_field_equals   – dot-notation path value equals expected
  json_field_exists   – dot-notation path is present in response JSON
  header_equals       – response header value equals expected (case-insensitive header name)
  header_exists       – response header present
  response_time_lt    – response_time_ms < expected (milliseconds)
"""
from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_nested(obj: Any, path: str) -> tuple[bool, Any]:
    """
    Traverse a dot-notation path in a nested dict/list structure.
    Returns (found, value).
    """
    keys = path.split(".")
    current = obj
    for key in keys:
        if isinstance(current, dict):
            if key not in current:
                return False, None
            current = current[key]
        elif isinstance(current, list):
            try:
                idx = int(key)
                current = current[idx]
            except (ValueError, IndexError):
                return False, None
        else:
            return False, None
    return True, current


# ---------------------------------------------------------------------------
# Single assertion evaluation
# ---------------------------------------------------------------------------

class AssertionResult:
    __slots__ = ("type", "passed", "message", "actual", "expected")

    def __init__(
        self,
        type: str,
        passed: bool,
        message: str,
        actual: Any = None,
        expected: Any = None,
    ):
        self.type = type
        self.passed = passed
        self.message = message
        self.actual = actual
        self.expected = expected

    def to_dict(self) -> dict:
        return {
            "type": self.type,
            "passed": self.passed,
            "message": self.message,
            "actual": self.actual,
            "expected": self.expected,
        }


def evaluate_assertion(
    assertion: dict,
    *,
    status_code: int | None,
    response_body: str | None,
    response_headers: dict[str, str],
    response_time_ms: float | None,
) -> AssertionResult:
    """Evaluate a single assertion dict against the HTTP response."""
    atype = (assertion.get("type") or "").lower()
    target = assertion.get("target")
    expected = assertion.get("expected")

    # -- status_code --
    if atype == "status_code":
        actual = status_code
        passed = actual == expected
        return AssertionResult(
            type=atype,
            passed=passed,
            message=f"Status code {'matched' if passed else 'did not match'}: expected {expected}, got {actual}",
            actual=actual,
            expected=expected,
        )

    # -- body_contains / body_not_contains --
    if atype in ("body_contains", "body_not_contains"):
        body = response_body or ""
        needle = str(expected or "")
        found = needle in body
        if atype == "body_contains":
            passed = found
            msg = f"Body {'contains' if passed else 'does not contain'} '{needle}'"
        else:
            passed = not found
            msg = f"Body {'does not contain' if passed else 'contains'} '{needle}' (expected absent)"
        return AssertionResult(type=atype, passed=passed, message=msg, actual=found, expected=needle)

    # -- json_field_equals / json_field_exists --
    if atype in ("json_field_equals", "json_field_exists"):
        try:
            parsed = json.loads(response_body or "{}")
        except json.JSONDecodeError:
            return AssertionResult(
                type=atype,
                passed=False,
                message="Response body is not valid JSON",
                actual=response_body,
                expected=expected,
            )

        found, actual_value = _get_nested(parsed, target or "")

        if atype == "json_field_exists":
            return AssertionResult(
                type=atype,
                passed=found,
                message=f"JSON field '{target}' {'exists' if found else 'not found'}",
                actual=found,
                expected=True,
            )
        else:  # json_field_equals
            passed = found and actual_value == expected
            return AssertionResult(
                type=atype,
                passed=passed,
                message=(
                    f"JSON field '{target}': expected {expected!r}, got {actual_value!r}"
                    if not passed
                    else f"JSON field '{target}' matched {expected!r}"
                ),
                actual=actual_value,
                expected=expected,
            )

    # -- header_equals / header_exists --
    if atype in ("header_equals", "header_exists"):
        header_name = (target or "").lower()
        # Normalise headers to lower-case keys
        headers_lower = {k.lower(): v for k, v in response_headers.items()}
        actual_value = headers_lower.get(header_name)
        found = actual_value is not None

        if atype == "header_exists":
            return AssertionResult(
                type=atype,
                passed=found,
                message=f"Header '{target}' {'present' if found else 'missing'}",
                actual=found,
                expected=True,
            )
        else:
            passed = found and str(actual_value) == str(expected)
            return AssertionResult(
                type=atype,
                passed=passed,
                message=f"Header '{target}': expected {expected!r}, got {actual_value!r}",
                actual=actual_value,
                expected=expected,
            )

    # -- response_time_lt --
    if atype == "response_time_lt":
        actual = response_time_ms
        threshold = int(expected or 0)
        passed = actual is not None and actual < threshold
        return AssertionResult(
            type=atype,
            passed=passed,
            message=f"Response time {actual}ms {'<' if passed else '>='} {threshold}ms",
            actual=actual,
            expected=threshold,
        )

    # Unknown assertion type — skip gracefully
    return AssertionResult(
        type=atype,
        passed=False,
        message=f"Unknown assertion type '{atype}' — skipped",
        actual=None,
        expected=expected,
    )


# ---------------------------------------------------------------------------
# Evaluate all assertions for a test case execution
# ---------------------------------------------------------------------------

def evaluate_all_assertions(
    test_case_assertions: list[dict],
    expected_status_code: int | None,
    *,
    actual_status_code: int | None,
    response_body: str | None,
    response_headers: dict[str, str],
    response_time_ms: float | None,
) -> tuple[bool, list[dict], str | None]:
    """
    Evaluate status code + all assertion specs.

    Returns:
        (overall_passed, assertion_results_list, failure_reason_or_None)
    """
    results: list[AssertionResult] = []

    # Always check expected status code if set on the test case
    if expected_status_code is not None:
        results.append(
            evaluate_assertion(
                {"type": "status_code", "expected": expected_status_code},
                status_code=actual_status_code,
                response_body=response_body,
                response_headers=response_headers,
                response_time_ms=response_time_ms,
            )
        )

    for assertion in (test_case_assertions or []):
        results.append(
            evaluate_assertion(
                assertion,
                status_code=actual_status_code,
                response_body=response_body,
                response_headers=response_headers,
                response_time_ms=response_time_ms,
            )
        )

    all_passed = all(r.passed for r in results)
    failures = [r.message for r in results if not r.passed]
    failure_reason = "; ".join(failures) if failures else None

    return all_passed, [r.to_dict() for r in results], failure_reason
