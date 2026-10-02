"""
Shared enumerations used across the Nexgrid data model.
"""
import enum


class WorkspaceRole(str, enum.Enum):
    """Role a user holds within a workspace."""
    OWNER = "owner"
    EDITOR = "editor"
    VIEWER = "viewer"


class HttpMethod(str, enum.Enum):
    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    PATCH = "PATCH"
    DELETE = "DELETE"
    HEAD = "HEAD"
    OPTIONS = "OPTIONS"


class BodyType(str, enum.Enum):
    NONE = "none"
    JSON = "json"
    FORM_DATA = "form_data"
    X_WWW_FORM_URLENCODED = "x_www_form_urlencoded"
    RAW = "raw"


class AuthType(str, enum.Enum):
    NONE = "none"
    BEARER = "bearer"
    BASIC = "basic"
    API_KEY = "api_key"


class TestCaseCategory(str, enum.Enum):
    """Categories of AI-generated test cases (per project synopsis)."""
    POSITIVE = "positive"
    NEGATIVE = "negative"
    BOUNDARY = "boundary"
    VALIDATION = "validation"
    AUTHENTICATION = "authentication"
    AUTHORIZATION = "authorization"


class TestResultStatus(str, enum.Enum):
    PASSED = "passed"
    FAILED = "failed"
    ERROR = "error"
    SKIPPED = "skipped"


class NotificationType(str, enum.Enum):
    WORKSPACE_INVITE = "workspace_invite"
    REQUEST_UPDATED = "request_updated"
    REQUEST_CREATED = "request_created"
    ENVIRONMENT_UPDATED = "environment_updated"
    COMMENT_ADDED = "comment_added"
    MENTION = "mention"
    MEMBER_JOINED = "member_joined"
