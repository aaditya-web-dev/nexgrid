"""
WebSocket endpoint for real-time collaboration.

URL: ws://host/ws/{workspace_id}?token=<access_token>

Authentication
--------------
Browsers cannot send Authorization headers over WebSocket.
The JWT access token is passed as a query parameter and validated on connect.
Invalid/missing token causes the connection to be closed with code 1008 (Policy Violation).

Message Protocol
----------------
All messages are JSON objects with a required "type" field.

Client → Server:
  { "type": "typing",     "request_id": 5 }
  { "type": "stop_typing","request_id": 5 }
  { "type": "ping" }

Server → Client (broadcasts):
  { "type": "presence",    "user_id": 1, "username": "ashok", "status": "online" }
  { "type": "presence",    "user_id": 1, "username": "ashok", "status": "offline" }
  { "type": "typing",      "user_id": 1, "username": "ashok", "request_id": 5 }
  { "type": "stop_typing", "user_id": 1, "request_id": 5 }
  { "type": "locked",      "user_id": 1, "username": "ashok", "request_id": 5, "locked_at": "..." }
  { "type": "unlocked",    "request_id": 5 }
  { "type": "comment",     "comment": { ... } }
  { "type": "notification","notification": { ... } }

Server → Client (personal only, on connect):
  { "type": "online_users", "users": [{ "user_id": 1, "username": "ashok" }, ...] }
  { "type": "pong" }
"""
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User
from app.models.workspace import WorkspaceMember
from app.websocket.manager import manager

router = APIRouter(tags=["websocket"])


def _get_db_session() -> Session:
    """Helper to get a raw DB session outside of FastAPI's DI (for WebSocket use)."""
    from app.core.database import SessionLocal
    return SessionLocal()


async def _authenticate_ws(token: str | None) -> dict | None:
    """
    Decode the JWT access token from the query parameter.
    Returns the payload dict on success, None on failure.
    """
    if not token:
        return None
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None


@router.websocket("/ws/{workspace_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    workspace_id: int,
    token: str | None = Query(None, description="JWT access token"),
):
    """
    Main collaborative WebSocket endpoint.
    Each workspace has its own room; all members in the room receive broadcasts.
    """
    # 1. Authenticate
    payload = await _authenticate_ws(token)
    if payload is None:
        await websocket.close(code=1008, reason="Authentication required")
        return

    user_id_str: str | None = payload.get("sub")
    if not user_id_str:
        await websocket.close(code=1008, reason="Invalid token payload")
        return

    user_id = int(user_id_str)

    # 2. Validate workspace membership (using a separate DB session)
    db = _get_db_session()
    try:
        user = db.query(User).filter(User.id == user_id, User.is_active == True).first()  # noqa: E712
        if not user:
            await websocket.close(code=1008, reason="User not found or inactive")
            return

        membership = (
            db.query(WorkspaceMember)
            .filter(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user_id,
            )
            .first()
        )
        if not membership:
            await websocket.close(code=1008, reason="Not a member of this workspace")
            return

        username = user.username
    finally:
        db.close()

    # 3. Accept connection and register in room
    client = await manager.connect(websocket, workspace_id, user_id, username)

    # 4. Send current online users to the newly connected client
    await manager.send_personal(websocket, {
        "type": "online_users",
        "users": manager.get_online_users(workspace_id),
    })

    # 5. Broadcast presence "online" to all OTHER members in the room
    await manager.broadcast(
        workspace_id,
        {
            "type": "presence",
            "user_id": user_id,
            "username": username,
            "status": "online",
        },
        exclude_websocket=websocket,
    )

    # 6. Message receive loop
    try:
        while True:
            try:
                raw = await websocket.receive_text()
            except Exception:
                break

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await manager.send_personal(websocket, {"type": "error", "message": "Invalid JSON"})
                continue

            msg_type = data.get("type", "")

            if msg_type == "typing":
                request_id = data.get("request_id")
                if request_id is not None:
                    await manager.broadcast(
                        workspace_id,
                        {
                            "type": "typing",
                            "user_id": user_id,
                            "username": username,
                            "request_id": request_id,
                        },
                        exclude_websocket=websocket,
                    )

            elif msg_type == "stop_typing":
                request_id = data.get("request_id")
                if request_id is not None:
                    await manager.broadcast(
                        workspace_id,
                        {
                            "type": "stop_typing",
                            "user_id": user_id,
                            "request_id": request_id,
                        },
                        exclude_websocket=websocket,
                    )

            elif msg_type == "ping":
                await manager.send_personal(websocket, {"type": "pong"})

            # Other message types (locked, unlocked, comment, notification)
            # are sent by HTTP endpoints via manager.broadcast — not by clients directly.

    except WebSocketDisconnect:
        pass
    finally:
        # 7. Clean up on disconnect
        manager.disconnect(websocket, workspace_id)
        await manager.broadcast(
            workspace_id,
            {
                "type": "presence",
                "user_id": user_id,
                "username": username,
                "status": "offline",
            },
        )
