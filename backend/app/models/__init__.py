"""
Import all models here so SQLAlchemy's registry and Alembic's autogenerate
can discover them from a single import.
"""
from app.models.enums import (  # noqa: F401
    WorkspaceRole,
    HttpMethod,
    BodyType,
    AuthType,
    TestCaseCategory,
    TestResultStatus,
    NotificationType,
)
from app.models.user import User  # noqa: F401
from app.models.workspace import Workspace, WorkspaceMember  # noqa: F401
from app.models.collection import Collection, Folder  # noqa: F401
from app.models.api_request import ApiRequest  # noqa: F401
from app.models.environment import Environment, EnvironmentVariable  # noqa: F401
from app.models.collaboration import Comment, Notification  # noqa: F401
from app.models.testing import TestCase, TestResult, RequestExecution  # noqa: F401

__all__ = [
    "User",
    "Workspace",
    "WorkspaceMember",
    "Collection",
    "Folder",
    "ApiRequest",
    "Environment",
    "EnvironmentVariable",
    "Comment",
    "Notification",
    "TestCase",
    "TestResult",
    "RequestExecution",
]
