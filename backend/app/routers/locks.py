"""
Locking router — request-level editing locks.

Endpoints
---------
POST   /api/requests/{request_id}/lock       Acquire lock (fails if locked by another user)
DELETE /api/requests/{request_id}/lock       Release lock (only lock holder or owner can release)
GET    /api/requests/{request_id}/lock       Check current lock state

Lock timeout: 5 minutes of inactivity auto-expires the lock.
Acquiring a lock broadcasts a "locked" event via WebSocket.
Releasing broadcasts an "unlocked" event.
"""
from datetime import datetime, timezone, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.models.user import User
from app.models.workspace import WorkspaceMember
from app.models.collection import Collection
from app.models.api_request import ApiRequest
from app.schemas.collaboration import LockResponse
from app.websocket.manager import manager

router = APIRouter(tags=["collaboration - locks"])

CurrentUser = Annotated[User, Depends(get_current_active_user)]

LOCK_TIMEOUT_MINUTES = 5


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


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


def _is_lock_expired(locked_at: datetime | None) -> bool:
    if locked_at is None:
        return True
    # Make locked_at timezone-aware if naive
    if locked_at.tzinfo is None:
        locked_at = locked_at.replace(tzinfo=timezone.utc)
    return (_utcnow() - locked_at) > timedelta(minutes=LOCK_TIMEOUT_MINUTES)


def _build_lock_response(req: ApiRequest, db: Session) -> LockResponse:
    is_locked = req.locked_by is not None and not _is_lock_expired(req.locked_at)
    username: str | None = None
    if is_locked and req.locked_by:
        holder = db.query(User).filter(User.id == req.locked_by).first()
        username = holder.username if holder else None
    return LockResponse(
        request_id=req.id,
        locked_by=req.locked_by if is_locked else None,
        locked_by_username=username,
        locked_at=req.locked_at if is_locked else None,
        is_locked=is_locked,
    )


@router.get(
    "/api/requests/{request_id}/lock",
    response_model=LockResponse,
    summary="Get the current lock state of a request",
)
def get_lock_state(
    request_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    req, _ = _get_request_and_assert_member(request_id, current_user, db)
    return _build_lock_response(req, db)


@router.post(
    "/api/requests/{request_id}/lock",
    response_model=LockResponse,
    summary="Acquire an editing lock on a request",
)
async def acquire_lock(
    request_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Acquire the lock to signal exclusive editing intent.
    - If the request is unlocked or the lock has expired (>5 min), the lock is granted.
    - If another user holds an active lock, returns 423 Locked.
    - If the current user already holds the lock, it's refreshed (locked_at reset).
    """
    req, col = _get_request_and_assert_member(request_id, current_user, db)

    active_lock = req.locked_by is not None and not _is_lock_expired(req.locked_at)

    if active_lock and req.locked_by != current_user.id:
        holder = db.query(User).filter(User.id == req.locked_by).first()
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"Request is currently being edited by '{holder.username if holder else 'another user'}'. Lock expires in {LOCK_TIMEOUT_MINUTES} minutes of inactivity.",
        )

    # Grant or refresh the lock
    req.locked_by = current_user.id
    req.locked_at = _utcnow()
    db.commit()
    db.refresh(req)

    lock_resp = _build_lock_response(req, db)

    # Broadcast to workspace
    await manager.broadcast(
        col.workspace_id,
        {
            "type": "locked",
            "user_id": current_user.id,
            "username": current_user.username,
            "request_id": request_id,
            "locked_at": req.locked_at.isoformat(),
        },
    )

    return lock_resp


@router.delete(
    "/api/requests/{request_id}/lock",
    response_model=LockResponse,
    summary="Release the editing lock on a request",
)
async def release_lock(
    request_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Release the lock.
    - The lock holder can always release.
    - Workspace owners can forcefully release any lock.
    - Others get 403.
    """
    req, col = _get_request_and_assert_member(request_id, current_user, db)

    if req.locked_by is None:
        # Nothing to do — already unlocked
        return _build_lock_response(req, db)

    # Check permission to release
    is_owner = (
        db.query(WorkspaceMember)
        .filter(
            WorkspaceMember.workspace_id == col.workspace_id,
            WorkspaceMember.user_id == current_user.id,
            WorkspaceMember.role == "owner",
        )
        .first()
    ) is not None

    if req.locked_by != current_user.id and not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the lock holder or a workspace owner can release this lock",
        )

    req.locked_by = None
    req.locked_at = None
    db.commit()
    db.refresh(req)

    # Broadcast unlock event to workspace
    await manager.broadcast(
        col.workspace_id,
        {
            "type": "unlocked",
            "request_id": request_id,
        },
    )

    return _build_lock_response(req, db)
