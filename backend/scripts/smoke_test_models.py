"""
Week 2 smoke test: creates one row in every table and walks the relationships
to prove the schema and ORM mappings actually work end-to-end.

Run with:  python scripts/smoke_test_models.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    User,
    Workspace,
    WorkspaceMember,
    Collection,
    Folder,
    ApiRequest,
    Environment,
    EnvironmentVariable,
    Comment,
    Notification,
    TestCase,
    TestResult,
    RequestExecution,
    WorkspaceRole,
    HttpMethod,
    BodyType,
    AuthType,
    TestCaseCategory,
    TestResultStatus,
    NotificationType,
)

db = SessionLocal()

try:
    # --- Users ---
    owner = User(
        username="aaditya",
        email="aaditya@example.com",
        full_name="Aaditya Pandey",
        hashed_password="not-a-real-hash",
    )
    tester = User(
        username="qa_riya",
        email="riya@example.com",
        full_name="Riya QA",
        hashed_password="not-a-real-hash",
    )
    db.add_all([owner, tester])
    db.flush()

    # --- Workspace + members ---
    ws = Workspace(name="Payments API", description="Team workspace", owner_id=owner.id)
    db.add(ws)
    db.flush()

    db.add_all([
        WorkspaceMember(workspace_id=ws.id, user_id=owner.id, role=WorkspaceRole.OWNER),
        WorkspaceMember(workspace_id=ws.id, user_id=tester.id, role=WorkspaceRole.EDITOR),
    ])

    # --- Collection + nested folders ---
    coll = Collection(workspace_id=ws.id, name="Auth Endpoints", created_by=owner.id)
    db.add(coll)
    db.flush()

    parent_folder = Folder(collection_id=coll.id, name="v1")
    db.add(parent_folder)
    db.flush()
    child_folder = Folder(
        collection_id=coll.id, name="login", parent_folder_id=parent_folder.id
    )
    db.add(child_folder)
    db.flush()

    # --- API request ---
    req = ApiRequest(
        collection_id=coll.id,
        folder_id=child_folder.id,
        name="Login User",
        method=HttpMethod.POST,
        url="{{base_url}}/api/v1/login",
        query_params={"verbose": "true"},
        headers={"Content-Type": "application/json"},
        body_type=BodyType.JSON,
        body='{"username": "test", "password": "secret"}',
        auth_type=AuthType.BEARER,
        auth_config={"token": "{{auth_token}}"},
        created_by=owner.id,
    )
    db.add(req)
    db.flush()

    # --- Environment + variables ---
    env = Environment(workspace_id=ws.id, name="dev", is_default=True, created_by=owner.id)
    db.add(env)
    db.flush()
    db.add_all([
        EnvironmentVariable(environment_id=env.id, key="base_url", value="http://localhost:8000"),
        EnvironmentVariable(environment_id=env.id, key="auth_token", value="abc123", is_secret=True),
    ])

    # --- Comment + threaded reply ---
    c1 = Comment(request_id=req.id, user_id=tester.id, content="Should this return 401 or 403?")
    db.add(c1)
    db.flush()
    db.add(Comment(
        request_id=req.id, user_id=owner.id,
        parent_comment_id=c1.id, content="401 — fixing it now.",
    ))

    # --- Notification ---
    db.add(Notification(
        user_id=tester.id,
        workspace_id=ws.id,
        type=NotificationType.COMMENT_ADDED,
        message="Aaditya replied to your comment",
        resource_type="api_request",
        resource_id=req.id,
        actor_id=owner.id,
    ))

    # --- Test case + result ---
    tc = TestCase(
        request_id=req.id,
        name="Login with missing password",
        description="Omit the password field",
        category=TestCaseCategory.NEGATIVE,
        request_overrides={"body": '{"username": "test"}'},
        expected_status_code=422,
        assertions=[{"type": "body_contains", "value": "password"}],
        is_ai_generated=True,
        is_approved=True,
        created_by=owner.id,
    )
    db.add(tc)
    db.flush()

    db.add(TestResult(
        test_case_id=tc.id,
        executed_by=tester.id,
        status=TestResultStatus.PASSED,
        actual_status_code=422,
        response_time_ms=134.5,
        response_body='{"detail": "password is required"}',
    ))

    # --- Raw execution history ---
    db.add(RequestExecution(
        request_id=req.id,
        executed_by=owner.id,
        environment_id=env.id,
        status_code=200,
        response_time_ms=98.2,
        response_headers={"content-type": "application/json"},
        response_body='{"token": "xyz"}',
        response_size_bytes=18,
    ))

    db.commit()

    # ----------------------------------------------------------------
    # Walk the relationships to verify they resolve
    # ----------------------------------------------------------------
    ws = db.query(Workspace).first()
    print(f"Workspace: {ws.name}  (owner: {ws.owner.username})")
    print(f"  Members: {[(m.user.username, m.role.value) for m in ws.members]}")

    coll = ws.collections[0]
    print(f"  Collection: {coll.name}")

    root = [f for f in coll.folders if f.parent_folder_id is None][0]
    print(f"    Folder: {root.name} -> children: {[c.name for c in root.children]}")

    r = coll.requests[0]
    print(f"    Request: [{r.method.value}] {r.name} -> {r.url}")
    print(f"      headers={r.headers}  auth={r.auth_type.value}")
    print(f"      comments: {len(r.comments)} (top-level: "
          f"{[c.content[:30] for c in r.comments if c.parent_comment_id is None]})")

    top = [c for c in r.comments if c.parent_comment_id is None][0]
    print(f"      reply: {top.replies[0].content}")

    e = ws.environments[0]
    print(f"  Environment: {e.name} -> vars: "
          f"{[(v.key, '***' if v.is_secret else v.value) for v in e.variables]}")

    t = r.test_cases[0]
    print(f"  TestCase [{t.category.value}]: {t.name} -> expected {t.expected_status_code}")
    print(f"    Result: {t.results[0].status.value} "
          f"(actual {t.results[0].actual_status_code}, {t.results[0].response_time_ms}ms)")

    ex = r.executions[0]
    print(f"  Execution: {ex.status_code} in {ex.response_time_ms}ms")

    print("\nAll models and relationships verified successfully.")

except Exception:
    db.rollback()
    raise
finally:
    db.close()
