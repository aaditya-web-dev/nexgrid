import { timeAgo } from './common/UIComponents';
import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, MessageSquare, Pin } from 'lucide-react';
import { notificationsApi } from '../api';

export const NotificationsDropdown = ({ workspaceId, incomingNotification }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await notificationsApi.list(workspaceId || null);
      setNotifications(res.data);
      setUnreadCount(res.data.filter((n) => !n.is_read).length);
    } catch (err) {
      console.warn('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [workspaceId]);

  // When a real-time notification arrives via WebSocket, prepend it
  useEffect(() => {
    if (incomingNotification) {
      setNotifications((prev) => [incomingNotification, ...prev]);
      setUnreadCount((prev) => prev + 1);
    }
  }, [incomingNotification]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead(workspaceId || null);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.warn('Failed to mark all notifications read:', err);
    }
  };

  const handleMarkOneRead = async (id) => {
    try {
      await notificationsApi.markRead([id]);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.warn('Failed to mark notification read:', err);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={isOpen}
        className="relative p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-sky-400 text-slate-950 rounded-full text-[9px] font-bold flex items-center justify-center"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-800 rounded-lg shadow-xl shadow-black/40 z-50 overflow-hidden text-xs"
          >
            <div className="px-3 py-2.5 border-b border-slate-800 flex items-center justify-between">
              <span className="font-semibold text-slate-100">Notifications</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-[11px] font-medium text-sky-300 hover:text-sky-200 cursor-pointer"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/70">
              {loading && notifications.length === 0 ? (
                <div className="p-4 text-center text-slate-500">Loading...</div>
              ) : notifications.length === 0 ? (
                <div className="p-6 text-center text-slate-500">You are all caught up</div>
              ) : (
                notifications.map((n) => {
                  const Icon = n.type === 'comment_added' ? MessageSquare : Pin;
                  return (
                    <button
                      type="button"
                      key={n.id}
                      onClick={() => !n.is_read && handleMarkOneRead(n.id)}
                      className={`w-full text-left p-3 transition-colors cursor-pointer flex items-start gap-2.5 ${
                        n.is_read
                          ? 'text-slate-500 hover:bg-slate-800/40'
                          : 'text-slate-200 bg-sky-500/5 hover:bg-slate-800/60'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-sky-400" aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <p className="line-clamp-2 leading-relaxed">{n.message}</p>
                        <span className="text-[10px] text-slate-500 mt-1 block">
                          {timeAgo(n.created_at)}
                        </span>
                      </div>
                      {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0 mt-1.5" />}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
