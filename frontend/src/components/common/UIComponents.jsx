import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export const fieldClass =
  'bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400/70 focus:ring-2 focus:ring-sky-400/20 disabled:opacity-60 disabled:cursor-not-allowed transition';

export const LoadingSpinner = ({ size = 'md', text = '' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-10 h-10 border-2',
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 gap-3">
      <div
        className={`${sizeClasses[size] || sizeClasses.md} border-slate-700 border-t-sky-400 rounded-full animate-spin`}
      />
      {text && <span className="text-xs text-slate-400 font-medium">{text}</span>}
    </div>
  );
};

export const SkeletonLines = ({ lines = 3, className = '' }) => (
  <div className={`space-y-2.5 ${className}`} aria-hidden="true">
    {Array.from({ length: lines }).map((_, i) => (
      <div
        key={i}
        className="h-3 rounded bg-slate-800/80 animate-pulse"
        style={{ width: `${92 - i * 14}%` }}
      />
    ))}
  </div>
);

export const ErrorAlert = ({ message, onDismiss }) => {
  const reduceMotion = useReducedMotion();
  const text = typeof message === 'string' ? message : JSON.stringify(message);

  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.div
          key="error-alert"
          role="alert"
          initial={reduceMotion ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          className="mx-4 mt-3 px-3.5 py-2.5 text-sm bg-rose-500/10 border border-rose-500/25 text-rose-200 rounded-lg flex items-center justify-between gap-3 shadow-sm"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" aria-hidden="true" />
            <span className="truncate">{text}</span>
          </div>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss error"
              className="p-1 rounded-md text-rose-300 hover:text-rose-100 hover:bg-rose-500/15 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const Modal = ({ isOpen, onClose, title, children }) => {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl shadow-black/40 w-full max-w-md overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="p-1 -mr-1 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const MethodBadge = ({ method }) => {
  const styles = {
    GET: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/25',
    POST: 'text-amber-400 bg-amber-400/10 border-amber-400/25',
    PUT: 'text-sky-400 bg-sky-400/10 border-sky-400/25',
    PATCH: 'text-teal-300 bg-teal-300/10 border-teal-300/25',
    DELETE: 'text-rose-400 bg-rose-400/10 border-rose-400/25',
    HEAD: 'text-cyan-300 bg-cyan-300/10 border-cyan-300/25',
    OPTIONS: 'text-slate-300 bg-slate-400/10 border-slate-400/25',
  };

  const currentStyle = styles[method] || styles.OPTIONS;

  return (
    <span
      className={`inline-flex items-center px-1.5 py-px text-[10px] font-mono font-semibold tracking-wide rounded border ${currentStyle}`}
    >
      {method}
    </span>
  );
};

/* ---------- Avatar + relative time ---------- */
const AVATAR_TONES = [
  'bg-sky-500/20 text-sky-200 border-sky-400/30', 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30',
  'bg-violet-500/20 text-violet-200 border-violet-400/30', 'bg-amber-500/20 text-amber-200 border-amber-400/30',
  'bg-rose-500/20 text-rose-200 border-rose-400/30', 'bg-teal-500/20 text-teal-200 border-teal-400/30',
];
export const Avatar = ({ name = '?', size = 'md' }) => {
  const hash = [...String(name)].reduce((a, c) => a + c.charCodeAt(0), 0);
  const dims = size === 'sm' ? 'w-5 h-5 text-[9px]' : 'w-7 h-7 text-[10px]';
  return (
    <span className={`${dims} ${AVATAR_TONES[hash % AVATAR_TONES.length]} shrink-0 rounded-full border font-semibold flex items-center justify-center select-none`} aria-hidden="true">
      {String(name).replace('User #', '').slice(0, 2).toUpperCase()}
    </span>
  );
};

export const timeAgo = (value) => {
  const s = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (Number.isNaN(s)) return '';
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 604800) return `${Math.round(s / 86400)}d ago`;
  return new Date(value).toLocaleDateString();
};

/* ---------- Toasts ---------- */
const ToastContext = createContext(null);
const TOAST_STYLE = {
  success: { Icon: CheckCircle2, cls: 'text-emerald-400' },
  error: { Icon: AlertCircle, cls: 'text-rose-400' },
  info: { Icon: Info, cls: 'text-sky-400' },
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((type, message) => {
    const id = ++idRef.current;
    setToasts((t) => [...t.slice(-3), { id, type, message }]);
    setTimeout(() => dismiss(id), type === 'error' ? 6000 : 3000);
  }, [dismiss]);
  const api = useRef({
    success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m),
  }).current;

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map(({ id, type, message }) => {
            const { Icon, cls } = TOAST_STYLE[type];
            return (
              <motion.div
                key={id}
                layout="position"
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ duration: 0.18 }}
                role={type === 'error' ? 'alert' : 'status'}
                className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 shadow-xl shadow-black/40 text-xs text-slate-100"
              >
                <Icon className={`w-4 h-4 mt-px shrink-0 ${cls}`} aria-hidden="true" />
                <span className="flex-1 leading-relaxed">{message}</span>
                <button type="button" onClick={() => dismiss(id)} aria-label="Dismiss" className="text-slate-500 hover:text-slate-200 cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

const noopToast = { success: () => {}, error: () => {}, info: () => {} };
export const useToast = () => useContext(ToastContext) || noopToast;

/* ---------- Confirm dialog (replaces window.confirm) ---------- */
const ConfirmContext = createContext(null);

export const ConfirmProvider = ({ children }) => {
  const [state, setState] = useState(null);
  const confirm = useCallback(
    (opts) => new Promise((resolve) => setState({ ...(typeof opts === 'string' ? { message: opts } : opts), resolve })),
    []
  );
  const close = (result) => {
    state?.resolve(result);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal isOpen={!!state} onClose={() => close(false)} title={state?.title || 'Are you sure?'}>
        <div className="flex gap-3 mb-5">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
          <p className="text-xs text-slate-300 leading-relaxed">{state?.message}</p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => close(false)} className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 border border-slate-700 rounded-md cursor-pointer transition-colors">
            Cancel
          </button>
          <button type="button" autoFocus onClick={() => close(true)} className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-md cursor-pointer transition-colors">
            {state?.confirmLabel || 'Delete'}
          </button>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => useContext(ConfirmContext) || (async (o) => window.confirm(o?.message || o));

/* ---------- Nexgrid logo: an "N" drawn as a connected node path on a grid ---------- */
export const Logo = ({ size = 32, wordmark = true, animated = false, className = '' }) => {
  const pop = (i) =>
    animated
      ? { initial: { scale: 0 }, animate: { scale: 1 }, transition: { delay: 0.2 + i * 0.18, type: 'spring', stiffness: 400, damping: 18 }, style: { transformBox: 'fill-box', transformOrigin: 'center' } }
      : {};
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" role="img" aria-label="Nexgrid logo">
        <rect x="0.5" y="0.5" width="31" height="31" rx="8" fill="#0b1626" stroke="#38bdf8" strokeOpacity="0.35" />
        {[9, 16, 23].flatMap((y) => [9, 16, 23].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="0.9" fill="#38bdf8" fillOpacity="0.28" />))}
        <motion.path
          d="M9 23V9L23 23V9"
          stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          {...(animated ? { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { duration: 0.8, ease: 'easeInOut', delay: 0.1 } } : {})}
        />
        {[[9, 23], [9, 9], [23, 23], [23, 9]].map(([cx, cy], i) => (
          <motion.circle key={i} cx={cx} cy={cy} r="2.6" fill="#0b1626" stroke="#7dd3fc" strokeWidth="1.6" {...pop(i)} />
        ))}
      </svg>
      {wordmark && (
        <span className="font-semibold tracking-tight text-slate-100" style={{ fontSize: size * 0.56 }}>
          Nex<span className="text-sky-300">grid</span>
        </span>
      )}
    </span>
  );
};
