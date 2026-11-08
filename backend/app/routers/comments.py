"""
Comments router — Threaded comments on API requests with real-time WebSocket broadcast.

Endpoints
---------
GET    /api/requests/{request_id}/comments       List all comments for a request
POST   /api/requests/{request_id}/comments       Add a comment (or reply to parent)
PATCH  /api/comments/{comment_id}                Edit an existing comment
DELETE /api/comments/{comment_id}                Delete a comment
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.models.user import User
from app.models.workspace import WorkspaceMember
from app.models.collection import Collection
from app.models.api_request import ApiRequest
from app.models.collaboration import Comment, Notification
from app.models.enums import NotificationType
from app.schemas.collaboration import CommentCreate, CommentUpdate, CommentResponse
from app.websocket.manager import manager

router = APIRouter(tags=["collaboration - comments"])

CurrentUser = Annotated[User, Depends(get_current_active_user)]


def _get_request_and_assert_member(
    request_id: int, user: User, db: Session
) -> tuple[ApiRequest, Collection]:
    req = db.query(ApiRequest).filter(ApiRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    col = db.query(Collection).filter(Collection.id == req.collection_id).first()
    if not col:
        raise HTTPException(status_code=404, detail="Collection not found")

    membership = (
        db.query(WorkspaceMember)
        .filter(
            WorkspaceMember.workspace_id == col.workspace_id,
            WorkspaceMember.user_id == user.id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this workspace",
        )
    return req, col


def _format_comment_response(comment: Comment, username: str | None = None) -> CommentResponse:
    uname = username or (comment.user.username if comment.user else None)
    return CommentResponse(
        id=comment.id,
        request_id=comment.request_id,
        user_id=comment.user_id,
        username=uname,
        parent_comment_id=comment.parent_comment_id,
        content=comment.content,
        is_edited=comment.is_edited,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


@router.get(
    "/api/requests/{request_id}/comments",
    response_model=list[CommentResponse],
    summary="List all comments for an API request",
)
def list_comments(
    request_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Returns all comments on this request ordered chronologically."""
    _get_request_and_assert_member(request_id, current_user, db)

    comments = (
        db.query(Comment)
        .filter(Comment.request_id == request_id)
        .order_by(Comment.created_at.asc())
        .all()
    )

    return [_format_comment_response(c) for c in comments]


@router.post(
    "/api/requests/{request_id}/comments",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a comment to an API request",
)
async def create_comment(
    request_id: int,
    payload: CommentCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Creates a new comment or a threaded reply.
    Broadcasts the new comment and notifies relevant workspace members.
    """
    req, col = _get_request_and_assert_member(request_id, current_user, db)

    if payload.parent_comment_id:
        parent = (
            db.query(Comment)
            .filter(
                Comment.id == payload.parent_comment_id,
                Comment.request_id == request_id,
            )
            .first()
        )
        if not parent:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Parent comment does not exist or belongs to another request",
            )

    comment = Comment(
        request_id=request_id,
        user_id=current_user.id,
        parent_comment_id=payload.parent_comment_id,
        content=payload.content,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    response_data = _format_comment_response(comment, current_user.username)

    # 1. Broadcast the new comment event to the workspace WebSocket room
    await manager.broadcast(
        col.workspace_id,
        {
            "type": "comment",
            "comment": response_data.model_dump(mode="json"),
        },
    )

    # 2. Generate in-app notification for the request creator if someone else commented
    if req.created_by and req.created_by != current_user.id:
        notif = Notification(
            user_id=req.created_by,
            workspace_id=col.workspace_id,
            type=NotificationType.COMMENT_ADDED,
            message=f"{current_user.username} commented on '{req.name}'",
            resource_type="api_request",
            resource_id=req.id,
            actor_id=current_user.id,
        )
        db.add(notif)
        db.commit()
        db.refresh(notif)

        await manager.broadcast(
            col.workspace_id,
            {
                "type": "notification",
                "notification": {
                    "id": notif.id,
                    "user_id": notif.user_id,
                    "workspace_id": notif.workspace_id,
                    "type": str(notif.type),
                    "message": notif.message,
                    "is_read": notif.is_read,
                    "resource_type": notif.resource_type,
                    "resource_id": notif.resource_id,
                    "created_at": notif.created_at.isoformat(),
                },
            },
        )

    return response_data


@router.patch(
    "/api/comments/{comment_id}",
    response_model=CommentResponse,
    summary="Edit an existing comment",
)
async def update_comment(
    comment_id: int,
    payload: CommentUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    _, col = _get_request_and_assert_member(comment.request_id, current_user, db)

    if comment.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own comments",
        )

    comment.content = payload.content
    comment.is_edited = True
    db.commit()
    db.refresh(comment)

    response_data = _format_comment_response(comment, current_user.username)

    # Broadcast updated comment
    await manager.broadcast(
        col.workspace_id,
        {
            "type": "comment_updated",
            "comment": response_data.model_dump(mode="json"),
        },
    )

    return response_data


@router.delete(
    "/api/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a comment",
)
async def delete_comment(
    comment_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    _, col = _get_request_and_assert_member(comment.request_id, current_user, db)

    is_owner = (
        db.query(WorkspaceMember)
        .filter(
            WorkspaceMember.workspace_id == col.workspace_id,
            WorkspaceMember.user_id == current_user.id,
            WorkspaceMember.role == "owner",
        )
        .first()
    ) is not None

    if comment.user_id != current_user.id and not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the author or workspace owner can delete this comment",
        )

    req_id = comment.request_id
    db.delete(comment)
    db.commit()

    # Broadcast delete event
    await manager.broadcast(
        col.workspace_id,
        {
            "type": "comment_deleted",
            "comment_id": comment_id,
            "request_id": req_id,
        },
    )
