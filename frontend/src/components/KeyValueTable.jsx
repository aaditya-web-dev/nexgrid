import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import { fieldClass } from './common/UIComponents';

export const KeyValueTable = ({
  rows,
  canEdit,
  onAdd,
  onUpdate,
  onRemove,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  addLabel = 'Add row',
  emptyText = 'No rows yet.',
}) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
        {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
      </span>
      {canEdit && (
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-sky-300 hover:bg-sky-500/10 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          {addLabel}
        </button>
      )}
    </div>

    <div className="space-y-1.5">
      <AnimatePresence initial={false}>
        {rows.map((row, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-2"
          >
            <input
              type="checkbox"
              checked={row.enabled}
              disabled={!canEdit}
              aria-label="Enable row"
              onChange={(e) => onUpdate(idx, 'enabled', e.target.checked)}
              className="w-3.5 h-3.5 accent-sky-500 cursor-pointer disabled:cursor-not-allowed"
            />
            <input
              type="text"
              placeholder={keyPlaceholder}
              value={row.key}
              disabled={!canEdit}
              onChange={(e) => onUpdate(idx, 'key', e.target.value)}
              className={`${fieldClass} flex-1 min-w-0 font-mono`}
            />
            <input
              type="text"
              placeholder={valuePlaceholder}
              value={row.value}
              disabled={!canEdit}
              onChange={(e) => onUpdate(idx, 'value', e.target.value)}
              className={`${fieldClass} flex-1 min-w-0 font-mono`}
            />
            {canEdit && (
              <button
                type="button"
                onClick={() => onRemove(idx)}
                aria-label="Remove row"
                className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
      {rows.length === 0 && <div className="text-xs text-slate-500 py-3">{emptyText}</div>}
    </div>
  </div>
);
