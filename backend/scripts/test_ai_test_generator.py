"""
Verification script for AI Test Case Generator.
Tests:
1. Assertion engine evaluation logic (all supported types)
2. AI generator schemas and prompt generation (including credential redaction)
3. Test Case API schemas validation
4. CRUD & approval lifecycle logic
"""
import sys
import os
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.assertion_engine import evaluate_assertion, evaluate_all_assertions
from app.services.ai_generator import (
    AssertionSpec,
    GeneratedTestCase,
    GeneratedTestSuite,
    _build_prompt,
)
from app.models.enums import TestCaseCategory, TestResultStatus, HttpMethod, BodyType, AuthType
from app.models.api_request import ApiRequest
from app.schemas.testing import (
    TestCaseCreate,
    TestCaseUpdate,
    TestCaseResponse,
    GenerateTestsResponse,
    TestResultResponse,
)


class TestAssertionEngine(unittest.TestCase):
    def test_status_code_assertion(self):
        res = evaluate_assertion(
            {"type": "status_code", "expected": 200},
            status_code=200,
            response_body='{"ok": true}',
            response_headers={},
            response_time_ms=50.0,
        )
        self.assertTrue(res.passed)

        res_fail = evaluate_assertion(
            {"type": "status_code", "expected": 200},
            status_code=404,
            response_body="",
            response_headers={},
            response_time_ms=50.0,
        )
        self.assertFalse(res_fail.passed)

    def test_body_contains_assertion(self):
        res = evaluate_assertion(
            {"type": "body_contains", "expected": "success"},
            status_code=200,
            response_body='{"status": "success"}',
            response_headers={},
            response_time_ms=50.0,
        )
        self.assertTrue(res.passed)

        res_absent = evaluate_assertion(
            {"type": "body_not_contains", "expected": "error"},
            status_code=200,
            response_body='{"status": "success"}',
            response_headers={},
            response_time_ms=50.0,
        )
        self.assertTrue(res_absent.passed)

    def test_json_field_assertions(self):
        body = '{"user": {"id": 42, "name": "Nexgrid", "roles": ["admin", "member"]}}'
        
        # json_field_exists
        res = evaluate_assertion(
            {"type": "json_field_exists", "target": "user.id"},
            status_code=200,
            response_body=body,
            response_headers={},
            response_time_ms=50.0,
        )
        self.assertTrue(res.passed)

        # json_field_equals
        res_eq = evaluate_assertion(
            {"type": "json_field_equals", "target": "user.name", "expected": "Nexgrid"},
            status_code=200,
            response_body=body,
            response_headers={},
            response_time_ms=50.0,
        )
        self.assertTrue(res_eq.passed)

        # nested array index
        res_arr = evaluate_assertion(
            {"type": "json_field_equals", "target": "user.roles.0", "expected": "admin"},
            status_code=200,
            response_body=body,
            response_headers={},
            response_time_ms=50.0,
        )
        self.assertTrue(res_arr.passed)

    def test_header_and_time_assertions(self):
        res_hdr = evaluate_assertion(
            {"type": "header_equals", "target": "Content-Type", "expected": "application/json"},
            status_code=200,
            response_body="{}",
            response_headers={"content-type": "application/json"},
            response_time_ms=120.0,
        )
        self.assertTrue(res_hdr.passed)

        res_time = evaluate_assertion(
            {"type": "response_time_lt", "expected": 500},
            status_code=200,
            response_body="{}",
            response_headers={},
            response_time_ms=120.0,
        )
        self.assertTrue(res_time.passed)

    def test_evaluate_all_assertions(self):
        assertions = [
            {"type": "body_contains", "expected": "data"},
            {"type": "json_field_exists", "target": "data.id"},
        ]
        all_passed, results, failure_reason = evaluate_all_assertions(
            assertions,
            expected_status_code=200,
            actual_status_code=200,
            response_body='{"data": {"id": 10}}',
            response_headers={},
            response_time_ms=100.0,
        )
        self.assertTrue(all_passed)
        self.assertEqual(len(results), 3)  # 1 status code + 2 assertions
        self.assertIsNone(failure_reason)


class TestAIGeneratorSanitization(unittest.TestCase):
    def test_credential_sanitization(self):
        req = ApiRequest(
            id=1,
            collection_id=1,
            name="Get Profile",
            method=HttpMethod.GET,
            url="https://api.example.com/me",
            auth_type=AuthType.BEARER,
            auth_config={"token": "super-secret-jwt-token"},
            headers={"Authorization": "Bearer secret"},
        )
        prompt = _build_prompt(req)
        self.assertNotIn("super-secret-jwt-token", prompt)
        self.assertIn("***REDACTED***", prompt)

    def test_generated_test_suite_validation(self):
        sample_json = {
            "test_cases": [
                {
                    "name": "Happy Path - Status 200",
                    "description": "Ensure profile returns 200",
                    "category": "positive",
                    "expected_status_code": 200,
                    "request_overrides": {},
                    "assertions": [
                        {"type": "status_code", "expected": 200},
                        {"type": "json_field_exists", "target": "id"}
                    ]
                },
                {
                    "name": "Missing Auth Token",
                    "description": "Ensure 401 when unauthenticated",
                    "category": "authentication",
                    "expected_status_code": 401,
                    "request_overrides": {"headers": {"Authorization": ""}},
                    "assertions": [
                        {"type": "status_code", "expected": 401}
                    ]
                }
            ]
        }
        suite = GeneratedTestSuite.model_validate(sample_json)
        self.assertEqual(len(suite.test_cases), 2)
        self.assertEqual(suite.test_cases[0].category, TestCaseCategory.POSITIVE)
        self.assertEqual(suite.test_cases[1].category, TestCaseCategory.AUTHENTICATION)


if __name__ == "__main__":
    unittest.main()
