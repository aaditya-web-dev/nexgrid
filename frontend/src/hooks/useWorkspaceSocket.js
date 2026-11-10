/**
 * useWorkspaceSocket — Custom React hook for collaborative WebSocket connection.
 *
 * Handles:
 * - Connecting to ws://host/ws/{workspaceId}?token=<access_token>
 * - Auto-reconnect on disconnect
 * - 30s keepalive ping
 * - Real-time tracking of:
 *   - onlineUsers: [{ user_id, username }]
 *   - typingUsers: { [requestId]: username }
 *   - lockedRequests: { [requestId]: { user_id, username, locked_at } }
 * - Event subscriber callback for incoming comments, notifications, etc.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { getAccessToken } from '../api/client';

export const useWorkspaceSocket = (workspaceId, onEvent) => {
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState({});
  const [lockedRequests, setLockedRequests] = useState({});

  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const onEventRef = useRef(onEvent);

  // Keep latest onEvent callback in ref so socket listeners never become stale
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const connect = useCallback(() => {
    if (!workspaceId) return;

    const token = getAccessToken();
    if (!token) return;

    // Build WS URL from HTTP API base
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
    const wsBase = apiBase.replace(/^http/, 'ws');
    const wsUrl = `${wsBase}/ws/${workspaceId}?token=${encodeURIComponent(token)}`;

    // Clean up any existing connection
    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch (e) {
        // ignore
      }
    }

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);

      // Start 30s heartbeat ping
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const { type } = data;

        // 1. Initial list of users connected to this workspace
        if (type === 'online_users') {
          setOnlineUsers(data.users || []);
        }

        // 2. Someone joined or left
        else if (type === 'presence') {
          setOnlineUsers((prev) => {
            if (data.status === 'online') {
              const exists = prev.some((u) => u.user_id === data.user_id);
              if (exists) return prev;
              return [...prev, { user_id: data.user_id, username: data.username }];
            } else {
              return prev.filter((u) => u.user_id !== data.user_id);
            }
          });
        }

        // 3. Typing indicator
        else if (type === 'typing') {
          if (data.request_id) {
            setTypingUsers((prev) => ({
              ...prev,
              [data.request_id]: data.username,
            }));
          }
        } else if (type === 'stop_typing') {
          if (data.request_id) {
            setTypingUsers((prev) => {
              const copy = { ...prev };
              delete copy[data.request_id];
              return copy;
            });
          }
        }

        // 4. Request locks
        else if (type === 'locked') {
          if (data.request_id) {
            setLockedRequests((prev) => ({
              ...prev,
              [data.request_id]: {
                user_id: data.user_id,
                username: data.username,
                locked_at: data.locked_at,
              },
            }));
          }
        } else if (type === 'unlocked') {
          if (data.request_id) {
            setLockedRequests((prev) => {
              const copy = { ...prev };
              delete copy[data.request_id];
              return copy;
            });
          }
        }

        // Forward to external callback for comments, notifications, etc.
        if (onEventRef.current) {
          onEventRef.current(data);
        }
      } catch (err) {
        console.error('WebSocket message parsing error:', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

      // Attempt reconnect in 3 seconds if workspaceId is still active
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = (err) => {
      console.warn('WebSocket connection error:', err);
    };
  }, [workspaceId]);

  useEffect(() => {
    connect();

    return () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) {
        try {
          socketRef.current.close();
        } catch (e) {
          // ignore
        }
      }
    };
  }, [connect]);

  // Outgoing actions
  const sendTyping = useCallback((requestId) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'typing', request_id: requestId }));
    }
  }, []);

  const sendStopTyping = useCallback((requestId) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'stop_typing', request_id: requestId }));
    }
  }, []);

  return {
    isConnected,
    onlineUsers,
    typingUsers,
    lockedRequests,
    sendTyping,
    sendStopTyping,
  };
};
