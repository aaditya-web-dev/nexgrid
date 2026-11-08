"""
Notifications router — In-app notification management.

Endpoints
---------
GET    /api/notifications                  List user's notifications
PATCH  /api/notifications/mark-read        Mark specified notifications as read
POST   /api/notifications/mark-all-read    Mark all user's notifications as read
DELETE /api/notifications/{id}             Dismiss a notification
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.models.user import User
from app.models.collaboration import Notification
from app.schemas.collaboration import NotificationResponse, NotificationMarkRead

router = APIRouter(tags=["collaboration - notifications"])

CurrentUser = Annotated[User, Depends(get_current_active_user)]


@router.get(
    "/api/notifications",
    response_model=list[NotificationResponse],
    summary="List current user's notifications",
)
def list_notifications(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    workspace_id: int | None = Query(None, description="Optional workspace filter"),
    unread_only: bool = Query(False, description="Filter for unread notifications only"),
    limit: int = Query(50, ge=1, le=100),
):
    q = db.query(Notification).filter(Notification.user_id == current_user.id)

    if workspace_id is not None:
        q = q.filter(Notification.workspace_id == workspace_id)

    if unread_only:
        q = q.filter(Notification.is_read == False)  # noqa: E712

    return q.order_by(Notification.created_at.desc()).limit(limit).all()


@router.patch(
    "/api/notifications/mark-read",
    summary="Mark specific notifications as read",
)
def mark_notifications_read(
    payload: NotificationMarkRead,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    updated = (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.id,
            Notification.id.in_(payload.notification_ids),
        )
        .update({"is_read": True}, synchronize_session=False)
    )
    db.commit()
    return {"message": f"Marked {updated} notification(s) as read", "updated_count": updated}


@router.post(
    "/api/notifications/mark-all-read",
    summary="Mark all notifications as read",
)
def mark_all_read(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    workspace_id: int | None = Query(None, description="Optional workspace filter"),
):
    q = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False,  # noqa: E712
    )
    if workspace_id is not None:
        q = q.filter(Notification.workspace_id == workspace_id)

    updated = q.update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"message": f"Marked {updated} notification(s) as read", "updated_count": updated}


@router.delete(
    "/api/notifications/{notification_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a notification",
)
def delete_notification(
    notification_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    notif = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
        .first()
    )
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    db.delete(notif)
    db.commit()
