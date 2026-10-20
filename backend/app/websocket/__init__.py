"""
WebSocket module for real-time collaboration.
"""
from app.websocket.manager import manager, ConnectionManager
from app.websocket.router import router

__all__ = ["manager", "ConnectionManager", "router"]
