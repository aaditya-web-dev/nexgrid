"""
Testing models: AI-generated test cases, their results, and raw execution history.
"""
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    Float,
    ForeignKey,
    DateTime,
    JSON,
    Enum as SAEnum,
)
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin, utcnow
from app.models.enums import TestCaseCategory, TestResultStatus


class TestCase(Base, TimestampMixin):
    """
    A single test scenario for an API request — typically AI-generated,
    then reviewed/approved by a user before execution.
    """
    __tablename__ = "test_cases"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(
        Integer, ForeignKey("api_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(
        SAEnum(TestCaseCategory, native_enum=False, length=30), nullable=False, index=True
    )

    # Overrides applied on top of the base request when running this test case,
    # e.g. {"headers": {...}, "body": "...", "query_params": {...}}
    request_overrides = Column(JSON, default=dict, nullable=True)

    expected_status_code = Column(Integer, nullable=True)
    # Additional assertions, e.g. [{"type": "body_contains", "value": "error"}]
    assertions = Column(JSON, default=list, nullable=True)

    is_ai_generated = Column(Boolean, default=True, nullable=False)
    is_approved = Column(Boolean, default=False, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    request = relationship("ApiRequest", back_populates="test_cases")
    results = relationship(
        "TestResult", back_populates="test_case", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<TestCase id={self.id} category={self.category} name={self.name!r}>"


class TestResult(Base):
    """Outcome of executing a single test case."""
    __tablename__ = "test_results"

    id = Column(Integer, primary_key=True, index=True)
    test_case_id = Column(
        Integer, ForeignKey("test_cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    executed_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    status = Column(
        SAEnum(TestResultStatus, native_enum=False, length=20), nullable=False, index=True
    )
    actual_status_code = Column(Integer, nullable=True)
    response_time_ms = Column(Float, nullable=True)
    response_body = Column(Text, nullable=True)
    failure_reason = Column(Text, nullable=True)

    executed_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    test_case = relationship("TestCase", back_populates="results")

    def __repr__(self):
        return f"<TestResult id={self.id} status={self.status}>"


class RequestExecution(Base):
    """
    History of raw (non-test) API request executions — what the user sees
    in the response panel after clicking Send.
    """
    __tablename__ = "request_executions"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(
        Integer, ForeignKey("api_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    executed_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    environment_id = Column(
        Integer, ForeignKey("environments.id", ondelete="SET NULL"), nullable=True
    )

    status_code = Column(Integer, nullable=True)
    response_time_ms = Column(Float, nullable=True)
    response_headers = Column(JSON, default=dict, nullable=True)
    response_body = Column(Text, nullable=True)
    response_size_bytes = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)

    executed_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    request = relationship("ApiRequest", back_populates="executions")

    def __repr__(self):
        return f"<RequestExecution id={self.id} status={self.status_code}>"
