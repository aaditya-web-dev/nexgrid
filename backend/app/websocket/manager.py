"""
WebSocket Connection Manager for real-time collaboration.

Manages per-workspace "rooms" of connected clients.
Each client is tracked with its user_id, username, and WebSocket connection.

Design constraints:
- Single-process (single uvicorn worker) — state lives in memory.
- Safe for async FastAPI — all methods are either sync-safe or async.
- Unknown/unexpected disconnect is handled gracefully via try/except.
"""
import asyncio
import json
from dataclasses import dataclass, field
from fastapi import WebSocket


@dataclass
class ConnectedClient:
    """A single authenticated WebSocket connection."""
    websocket: WebSocket
    user_id: int
    username: str


class ConnectionManager:
    """
    Manages WebSocket connections grouped by workspace_id.

    rooms: { workspace_id: [ConnectedClient, ...] }
    """

    def __init__(self):
        # workspace_id -> list of connected clients
        self.rooms: dict[int, list[ConnectedClient]] = {}

    # -----------------------------------------------------------------------
    # Connection lifecycle
    # -----------------------------------------------------------------------

    async def connect(
        self, websocket: WebSocket, workspace_id: int, user_id: int, username: str
    ) -> ConnectedClient:
        """Accept the WebSocket connection and register the client in the room."""
        await websocket.accept()
        client = ConnectedClient(
            websocket=websocket,
            user_id=user_id,
            username=username,
        )
        if workspace_id not in self.rooms:
            self.rooms[workspace_id] = []
        self.rooms[workspace_id].append(client)
        return client

    def disconnect(self, websocket: WebSocket, workspace_id: int) -> ConnectedClient | None:
        """Remove the client from its room. Returns the removed client or None."""
        room = self.rooms.get(workspace_id, [])
        removed: ConnectedClient | None = None
        for client in room:
            if client.websocket is websocket:
                removed = client
                break
        if removed:
            room.remove(removed)
        if not room and workspace_id in self.rooms:
            del self.rooms[workspace_id]
        return removed

    # -----------------------------------------------------------------------
    # Broadcast helpers
    # -----------------------------------------------------------------------

    async def broadcast(
        self,
        workspace_id: int,
        message: dict,
        exclude_websocket: WebSocket | None = None,
    ) -> None:
        """
        Send a JSON message to all connected clients in a workspace room.
        Optionally exclude the sender's own WebSocket.
        Stale/dead connections are silently removed.
        """
        room = self.rooms.get(workspace_id, [])
        dead: list[ConnectedClient] = []

        for client in room:
            if exclude_websocket is not None and client.websocket is exclude_websocket:
                continue
            try:
                await client.websocket.send_json(message)
            except Exception:
                dead.append(client)

        # Clean up dead connections
        for client in dead:
            if client in room:
                room.remove(client)

    async def send_personal(self, websocket: WebSocket, message: dict) -> None:
        """Send a JSON message to a single specific WebSocket."""
        try:
            await websocket.send_json(message)
        except Exception:
            pass

    # -----------------------------------------------------------------------
    # Presence helpers
    # -----------------------------------------------------------------------

    def get_online_users(self, workspace_id: int) -> list[dict]:
        """Return a list of currently connected users in a workspace room."""
        return [
            {"user_id": c.user_id, "username": c.username}
            for c in self.rooms.get(workspace_id, [])
        ]

    def is_user_connected(self, workspace_id: int, user_id: int) -> bool:
        """Check whether a specific user has at least one active connection."""
        return any(
            c.user_id == user_id for c in self.rooms.get(workspace_id, [])
        )


# ---------------------------------------------------------------------------
# Global singleton — imported by the router and HTTP routes that broadcast
# ---------------------------------------------------------------------------
manager = ConnectionManager()
