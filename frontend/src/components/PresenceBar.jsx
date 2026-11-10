import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export const PresenceBar = ({ isConnected, onlineUsers = [], currentUserId }) => {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[10px]"
        title={isConnected ? 'Live updates are on' : 'Live updates are unavailable'}
      >
        <span className="relative flex w-1.5 h-1.5">
          {isConnected && (
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
          )}
          <span
            className={`relative inline-flex w-1.5 h-1.5 rounded-full ${
              isConnected ? 'bg-emerald-400' : 'bg-slate-500'
            }`}
          />
        </span>
        <span className="text-slate-400 font-mono font-medium tracking-wide">
          {isConnected ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>

      {onlineUsers.length > 0 && (
        <div className="flex items-center -space-x-1.5 pl-1" title="Users active in this workspace">
          <AnimatePresence initial={false}>
            {onlineUsers.slice(0, 5).map((u) => {
              const isSelf = u.user_id === currentUserId;
              const initials = (u.username || 'U').slice(0, 2).toUpperCase();
              return (
                <motion.div
                  key={u.user_id}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.15 }}
                  title={`${u.username}${isSelf ? ' (you)' : ''}`}
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold border-2 border-slate-900 cursor-default select-none ${
                    isSelf ? 'bg-sky-500 text-slate-950' : 'bg-slate-700 text-slate-100'
                  }`}
                >
                  {initials}
                </motion.div>
              );
            })}
          </AnimatePresence>
          {onlineUsers.length > 5 && (
            <div className="w-6 h-6 rounded-full bg-slate-800 text-slate-300 border-2 border-slate-900 flex items-center justify-center text-[9px] font-semibold">
              +{onlineUsers.length - 5}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
