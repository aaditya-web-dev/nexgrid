import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ChevronRight,
  Folder,
  FolderOpen,
  Lock,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import { MethodBadge } from './common/UIComponents';

const treeAnimation = {
  initial: { height: 0, opacity: 0 },
  animate: { height: 'auto', opacity: 1 },
  exit: { height: 0, opacity: 0 },
  transition: { duration: 0.18, ease: 'easeOut' },
};

const TreeSkeleton = () => (
  <div className="space-y-2.5 px-2 pt-1" aria-hidden="true">
    {[70, 55, 80, 60, 45].map((w, i) => (
      <div key={i} className="flex items-center gap-2" style={{ paddingLeft: i % 3 === 0 ? 0 : 18 }}>
        <div className="w-3.5 h-3.5 rounded bg-slate-800 animate-pulse" />
        <div className="h-3 rounded bg-slate-800 animate-pulse" style={{ width: `${w}%` }} />
      </div>
    ))}
  </div>
);

const RequestRow = ({ req, isSelected, lock, typingUser, canEdit, onSelect, onDelete }) => (
  <motion.div
    layout="position"
    initial={{ opacity: 0, x: -6 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -10, height: 0 }}
    transition={{ duration: 0.15 }}
    onClick={() => onSelect(req)}
    className={`group flex items-center justify-between gap-2 pl-2 pr-1.5 py-1 rounded-md text-xs cursor-pointer transition-colors ${
      isSelected
        ? 'bg-sky-500/15 text-slate-50 shadow-[inset_2px_0_0_0_#38bdf8]'
        : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-100'
    }`}
  >
    <div className="flex items-center gap-2 min-w-0">
      <MethodBadge method={req.method} />
      <span className={`truncate ${isSelected ? 'font-medium' : ''}`}>{req.name}</span>
      {lock && (
        <span title={`Locked by ${lock.username}`} className="shrink-0 text-amber-400">
          <Lock className="w-3 h-3" aria-label="Locked" />
        </span>
      )}
      {typingUser && (
        <span title={`${typingUser} is typing...`} className="shrink-0 text-sky-400">
          <Pencil className="w-3 h-3 animate-pulse" aria-label="Typing" />
        </span>
      )}
    </div>
    {canEdit && (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(req.id);
        }}
        aria-label={`Delete request ${req.name}`}
        className="shrink-0 p-1 rounded text-slate-500 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-rose-400 hover:bg-rose-500/10 transition"
      >
        <X className="w-3 h-3" />
      </button>
    )}
  </motion.div>
);

const TreeRowButton = ({ children, onClick, title, tone = 'default' }) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    title={title}
    aria-label={title}
    className={`p-1 rounded text-slate-400 hover:bg-slate-700/60 transition-colors cursor-pointer ${
      tone === 'danger' ? 'hover:text-rose-400' : 'hover:text-sky-300'
    }`}
  >
    {children}
  </button>
);

const ExpandToggle = ({ isOpen, onToggle, icon: Icon, label, trailing }) => (
  <div className="flex items-center gap-1 px-1.5 py-1 rounded-md hover:bg-slate-800/70 group cursor-pointer text-slate-200">
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      className="flex items-center gap-1.5 flex-1 min-w-0 text-left cursor-pointer"
    >
      <motion.span
        animate={{ rotate: isOpen ? 90 : 0 }}
        transition={{ duration: 0.15 }}
        className="text-slate-500 shrink-0 flex"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </motion.span>
      <Icon className={`w-3.5 h-3.5 shrink-0 ${isOpen ? 'text-sky-300' : 'text-slate-500'}`} />
      <span className="text-xs font-medium truncate">{label}</span>
    </button>
    {trailing}
  </div>
);

export const Sidebar = ({
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
  onCreateWorkspace,
  onOpenWorkspaceSettings,
  collections,
  foldersByCollection,
  requestsByCollection,
  selectedRequestId,
  onSelectRequest,
  onCreateCollection,
  onCreateFolder,
  onCreateRequest,
  onDeleteCollection,
  onDeleteRequest,
  canEdit,
  lockedRequests = {},
  typingUsers = {},
  loading = false,
}) => {
  const reduceMotion = useReducedMotion();
  const [expandedCollections, setExpandedCollections] = useState({});
  const [expandedFolders, setExpandedFolders] = useState({});
  const [query, setQuery] = useState('');

  const normalizedQuery = query.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  const matches = (req) => req.name.toLowerCase().includes(normalizedQuery);

  const isCollectionOpen = (id) => (isSearching ? true : !!expandedCollections[id]);
  const isFolderOpen = (id) => (isSearching ? true : !!expandedFolders[id]);

  const toggleCollection = (id) => {
    setExpandedCollections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleFolder = (id) => {
    setExpandedFolders((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const visibleCollections = isSearching
    ? collections.filter((col) => (requestsByCollection[col.id] || []).some(matches))
    : collections;

  const rowProps = (req) => ({
    req,
    isSelected: selectedRequestId === req.id,
    lock: lockedRequests[req.id],
    typingUser: typingUsers[req.id],
    canEdit,
    onSelect: onSelectRequest,
    onDelete: onDeleteRequest,
  });

  return (
    <aside className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col h-full shrink-0 select-none">
      {/* Workspace Selector */}
      <div className="p-3 border-b border-slate-800 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Workspace
          </span>
          <div className="flex items-center gap-1">
            {activeWorkspace && (
              <TreeRowButton onClick={onOpenWorkspaceSettings} title="Workspace settings and members">
                <Settings className="w-3.5 h-3.5" />
              </TreeRowButton>
            )}
            <button
              type="button"
              onClick={onCreateWorkspace}
              title="Create new workspace"
              className="inline-flex items-center gap-1 px-1.5 py-1 rounded text-xs font-medium text-sky-300 hover:bg-sky-500/10 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          </div>
        </div>

        <select
          value={activeWorkspace?.id || ''}
          onChange={(e) => onSelectWorkspace(Number(e.target.value))}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-medium cursor-pointer focus:outline-none focus:border-sky-400/70 focus:ring-2 focus:ring-sky-400/20"
        >
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name}
            </option>
          ))}
          {workspaces.length === 0 && <option value="">No workspaces found</option>}
        </select>
      </div>

      {/* Search */}
      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter requests"
            aria-label="Filter requests"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400/70 focus:ring-2 focus:ring-sky-400/20 transition"
          />
        </div>
      </div>

      {/* Collections & Nested Request Tree */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Collections
          </span>
          {canEdit && (
            <button
              type="button"
              onClick={onCreateCollection}
              title="Add collection"
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium text-sky-300 hover:bg-sky-500/10 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          )}
        </div>

        {loading ? (
          <TreeSkeleton />
        ) : collections.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-slate-500">
            No collections yet. Click "Add" to create your first collection.
          </div>
        ) : visibleCollections.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-slate-500">
            No requests match "{query.trim()}".
          </div>
        ) : (
          <div className="space-y-0.5">
            {visibleCollections.map((col) => {
              const isColOpen = isCollectionOpen(col.id);
              const folders = foldersByCollection[col.id] || [];
              const allRequests = requestsByCollection[col.id] || [];
              const visibleRequests = isSearching ? allRequests.filter(matches) : allRequests;
              const rootRequests = visibleRequests.filter((r) => !r.folder_id);

              return (
                <div key={col.id}>
                  <ExpandToggle
                    isOpen={isColOpen}
                    onToggle={() => toggleCollection(col.id)}
                    icon={Folder}
                    label={col.name}
                    trailing={
                      <>
                      <span className="text-[10px] font-mono text-slate-600 group-hover:hidden px-1">{allRequests.length}</span>
                      {canEdit && (
                        <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <TreeRowButton onClick={() => onCreateRequest(col.id, null)} title="Add request to collection">
                            <Plus className="w-3.5 h-3.5" />
                          </TreeRowButton>
                          <TreeRowButton onClick={() => onCreateFolder(col.id)} title="Add folder">
                            <FolderOpen className="w-3.5 h-3.5" />
                          </TreeRowButton>
                          <TreeRowButton onClick={() => onDeleteCollection(col.id)} title="Delete collection" tone="danger">
                            <Trash2 className="w-3.5 h-3.5" />
                          </TreeRowButton>
                        </div>
                      )}
                      </>
                    }
                  />

                  <AnimatePresence initial={false}>
                    {isColOpen && (
                      <motion.div
                        key="children"
                        {...(reduceMotion ? {} : treeAnimation)}
                        className="overflow-hidden ml-3 pl-2 border-l border-slate-800 space-y-0.5 mt-0.5"
                      >
                        {folders.map((folder) => {
                          const isFolderOpenNow = isFolderOpen(folder.id);
                          const folderRequests = visibleRequests.filter(
                            (r) => r.folder_id === folder.id
                          );

                          return (
                            <div key={folder.id}>
                              <ExpandToggle
                                isOpen={isFolderOpenNow}
                                onToggle={() => toggleFolder(folder.id)}
                                icon={isFolderOpenNow ? FolderOpen : Folder}
                                label={folder.name}
                                trailing={
                                  canEdit && (
                                    <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                      <TreeRowButton onClick={() => onCreateRequest(col.id, folder.id)} title="Add request into folder">
                                        <Plus className="w-3.5 h-3.5" />
                                      </TreeRowButton>
                                    </div>
                                  )
                                }
                              />

                              <AnimatePresence initial={false}>
                                {isFolderOpenNow && (
                                  <motion.div
                                    key="folder-children"
                                    {...(reduceMotion ? {} : treeAnimation)}
                                    className="overflow-hidden ml-3 pl-2 border-l border-slate-800 space-y-0.5 mt-0.5"
                                  >
                                    <AnimatePresence initial={false}>
                                      {folderRequests.map((req) => (
                                        <RequestRow key={req.id} {...rowProps(req)} />
                                      ))}
                                    </AnimatePresence>
                                    {folderRequests.length === 0 && (
                                      <div className="text-[11px] text-slate-600 py-1 pl-2">
                                        Empty folder
                                      </div>
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}

                        <AnimatePresence initial={false}>
                          {rootRequests.map((req) => (
                            <RequestRow key={req.id} {...rowProps(req)} />
                          ))}
                        </AnimatePresence>

                        {folders.length === 0 && rootRequests.length === 0 && (
                          <div className="text-[11px] text-slate-600 py-1 pl-2">
                            No requests in collection
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};
