"""
Pydantic schemas for real-time collaboration:
- Request-level editing locks
- Comments (threaded)
- Notifications
"""
from datetime import datetime
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Lock schemas
# ---------------------------------------------------------------------------

class LockResponse(BaseModel):
    """Current lock state of an API request."""
    request_id: int
    locked_by: int | None = None
    locked_by_username: str | None = None
    locked_at: datetime | None = None
    is_locked: bool = False

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Comment schemas
# ---------------------------------------------------------------------------

class CommentCreate(BaseModel):
    """POST /api/requests/{id}/comments"""
    content: str = Field(..., min_length=1, max_length=5000)
    parent_comment_id: int | None = Field(
        None, description="ID of parent comment for threading (1 level deep)"
    )


class CommentUpdate(BaseModel):
    """PATCH /api/comments/{id}"""
    content: str = Field(..., min_length=1, max_length=5000)


class CommentResponse(BaseModel):
    id: int
    request_id: int
    user_id: int
    username: str | None = None     # resolved from User join
    parent_comment_id: int | None = None
    content: str
    is_edited: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Notification schemas
# ---------------------------------------------------------------------------

class NotificationResponse(BaseModel):
    id: int
    user_id: int
    workspace_id: int | None = None
    type: str
    message: str
    is_read: bool
    resource_type: str | None = None
    resource_id: int | None = None
    actor_id: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class NotificationMarkRead(BaseModel):
    """PATCH /api/notifications/mark-read"""
    notification_ids: list[int] = Field(..., min_length=1)
