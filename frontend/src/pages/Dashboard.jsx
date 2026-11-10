import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { LogOut, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Sidebar } from '../components/Sidebar';
import { RequestEditor } from '../components/RequestEditor';
import { PresenceBar } from '../components/PresenceBar';
import { NotificationsDropdown } from '../components/NotificationsDropdown';
import { WorkspaceSettingsModal } from '../components/WorkspaceSettingsModal';
import { Modal, ErrorAlert, LoadingSpinner, Logo, useToast, useConfirm } from '../components/common/UIComponents';
import { useWorkspaceSocket } from '../hooks/useWorkspaceSocket';
import {
  workspacesApi,
  collectionsApi,
  requestsApi,
  environmentsApi,
  locksApi,
} from '../api';

export const Dashboard = () => {
  const { user, logout } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  // Collaboration State
  const [incomingCommentEvent, setIncomingCommentEvent] = useState(null);
  const [incomingNotification, setIncomingNotification] = useState(null);

  // Workspaces State
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [activeRole, setActiveRole] = useState('viewer');
  const [workspaceMembers, setWorkspaceMembers] = useState([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);

  // Collections, Folders & Requests State
  const [collections, setCollections] = useState([]);
  const [foldersByCollection, setFoldersByCollection] = useState({});
  const [requestsByCollection, setRequestsByCollection] = useState({});
  const [selectedRequest, setSelectedRequest] = useState(null);

  // Environments State
  const [environments, setEnvironments] = useState([]);
  const [activeEnvironmentId, setActiveEnvironmentId] = useState(null);

  // Modals & UI State
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [isCreateWsOpen, setIsCreateWsOpen] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [newWsDesc, setNewWsDesc] = useState('');

  const [isCreateColOpen, setIsCreateColOpen] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColDesc, setNewColDesc] = useState('');

  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [selectedColForFolder, setSelectedColForFolder] = useState(null);
  const [newFolderName, setNewFolderName] = useState('');

  const [error, setError] = useState('');

  // WebSocket event handler
  const handleSocketEvent = useCallback((event) => {
    if (
      event.type === 'comment' ||
      event.type === 'comment_updated' ||
      event.type === 'comment_deleted'
    ) {
      setIncomingCommentEvent(event);
    } else if (event.type === 'notification') {
      setIncomingNotification(event.notification);
    }
  }, []);

  const {
    isConnected,
    onlineUsers,
    typingUsers,
    lockedRequests,
    sendTyping,
    sendStopTyping,
  } = useWorkspaceSocket(activeWorkspace?.id, handleSocketEvent);

  const handleAcquireLock = async () => {
    if (!selectedRequest?.id) return;
    try {
      await locksApi.acquire(selectedRequest.id);
      toast.success('Lock acquired. Others can now only view this request.');
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not acquire lock');
    }
  };

  const handleReleaseLock = async () => {
    if (!selectedRequest?.id) return;
    try {
      await locksApi.release(selectedRequest.id);
      toast.info('Lock released.');
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not release lock');
    }
  };

  // 1. Initial Load: Fetch Workspaces
  const loadWorkspaces = async () => {
    try {
      const res = await workspacesApi.list();
      setWorkspaces(res.data);
      if (res.data.length > 0 && !activeWorkspace) {
        handleSelectWorkspace(res.data[0]);
      }
    } catch (err) {
      console.error('Failed to load workspaces:', err);
      setError('Could not load workspaces. Please check backend connection.');
    } finally {
      setLoadingWorkspaces(false);
    }
  };

  useEffect(() => {
    loadWorkspaces();
  }, []);

  // 2. Select Workspace: Fetch membership, collections, and environments
  const handleSelectWorkspace = async (ws) => {
    setActiveWorkspace(ws);
    setSelectedRequest(null);
    setLoadingContent(true);

    try {
      // Fetch members and calculate role
      const membersRes = await workspacesApi.listMembers(ws.id);
      setWorkspaceMembers(membersRes.data);
      const myMembership = membersRes.data.find((m) => m.user_id === user?.id);
      setActiveRole(myMembership ? myMembership.role : 'viewer');

      // Fetch environments
      const envRes = await environmentsApi.list(ws.id);
      setEnvironments(envRes.data);
      const defEnv = envRes.data.find((e) => e.is_default);
      setActiveEnvironmentId(defEnv ? defEnv.id : null);

      // Fetch collections
      const colRes = await collectionsApi.list(ws.id);
      setCollections(colRes.data);

      // For each collection, fetch folders & requests
      const fMap = {};
      const rMap = {};

      await Promise.all(
        colRes.data.map(async (col) => {
          const [fRes, reqRes] = await Promise.all([
            collectionsApi.listFolders(col.id),
            requestsApi.list(col.id),
          ]);
          fMap[col.id] = fRes.data;
          rMap[col.id] = reqRes.data;
        })
      );

      setFoldersByCollection(fMap);
      setRequestsByCollection(rMap);
    } catch (err) {
      console.error('Error fetching workspace content:', err);
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Failed to load workspace data');
    } finally {
      setLoadingContent(false);
    }
  };

  const handleSelectWorkspaceById = (wsId) => {
    const ws = workspaces.find((w) => w.id === wsId);
    if (ws) handleSelectWorkspace(ws);
  };

  // 3. Create Workspace
  const handleCreateWorkspace = async (e) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    try {
      const res = await workspacesApi.create({
        name: newWsName.trim(),
        description: newWsDesc.trim() || null,
      });
      setIsCreateWsOpen(false);
      setNewWsName('');
      setNewWsDesc('');
      await loadWorkspaces();
      handleSelectWorkspace(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create workspace');
    }
  };

  // 4. Create Collection
  const handleCreateCollection = async (e) => {
    e.preventDefault();
    if (!activeWorkspace || !newColName.trim()) return;
    try {
      await collectionsApi.create(activeWorkspace.id, {
        name: newColName.trim(),
        description: newColDesc.trim() || null,
      });
      setIsCreateColOpen(false);
      setNewColName('');
      setNewColDesc('');
      handleSelectWorkspace(activeWorkspace);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create collection');
    }
  };

  // 5. Create Folder
  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!selectedColForFolder || !newFolderName.trim()) return;
    try {
      await collectionsApi.createFolder(selectedColForFolder, {
        name: newFolderName.trim(),
      });
      setIsCreateFolderOpen(false);
      setNewFolderName('');
      handleSelectWorkspace(activeWorkspace);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create folder');
    }
  };

  // 6. Create Request
  const handleCreateRequest = async (colId, folderId = null) => {
    try {
      const res = await requestsApi.create(colId, {
        name: 'New Request',
        method: 'GET',
        url: 'https://httpbin.org/get',
        folder_id: folderId,
      });
      await handleSelectWorkspace(activeWorkspace);
      setSelectedRequest(res.data);
      toast.success('Request created');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create request');
    }
  };

  // 7. Save / Update Request
  const handleSaveRequest = async (requestId, payload) => {
    try {
      const res = await requestsApi.update(requestId, payload);
      setSelectedRequest(res.data);
      // Update local cache
      toast.success('Request saved');
      setRequestsByCollection((prev) => {
        const copy = { ...prev };
        Object.keys(copy).forEach((cid) => {
          copy[cid] = copy[cid].map((r) => (r.id === requestId ? res.data : r));
        });
        return copy;
      });
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save request');
    }
  };

  // 8. Delete operations
  const handleDeleteCollection = async (colId) => {
    if (!(await confirm({ title: 'Delete collection', message: 'This permanently deletes the collection and all of its requests.' }))) return;
    try {
      await collectionsApi.delete(colId);
      toast.success('Collection deleted');
      handleSelectWorkspace(activeWorkspace);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete collection');
    }
  };

  const handleDeleteRequest = async (reqId) => {
    if (!(await confirm({ title: 'Delete request', message: 'This permanently deletes the request. This cannot be undone.' }))) return;
    try {
      await requestsApi.delete(reqId);
      toast.success('Request deleted');
      if (selectedRequest?.id === reqId) setSelectedRequest(null);
      handleSelectWorkspace(activeWorkspace);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete request');
    }
  };

  const isOwner = activeRole === 'owner';
  const canEdit = activeRole === 'owner' || activeRole === 'editor';

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* Top Navbar */}
      <header className="h-12 border-b border-slate-800/80 bg-slate-900/70 backdrop-blur-sm px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Logo size={26} wordmark={false} />
          <span className="font-semibold text-sm tracking-tight text-slate-100 truncate">
            {activeWorkspace?.name || 'Nexgrid Workspace'}
          </span>
          <PresenceBar
            isConnected={isConnected}
            onlineUsers={onlineUsers}
            currentUserId={user?.id}
          />
        </div>

        {/* User profile & actions */}
        <div className="flex items-center gap-3 shrink-0">
          {/* <NotificationsDropdown
            workspaceId={activeWorkspace?.id}
            incomingNotification={incomingNotification}
          /> */}

          <div className="hidden md:flex items-center gap-2 text-xs">
            <span className="text-slate-400">Signed in as</span>
            <span className="font-medium text-slate-200">{user?.username}</span>
          </div>

          <motion.button
            type="button"
            onClick={logout}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-rose-300 hover:bg-rose-500/10 border border-slate-700 hover:border-rose-500/30 rounded-md transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            Logout
          </motion.button>
        </div>
      </header>

      {/* Global Error Banner */}
      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {/* Main Layout Area */}
      <div className="flex-1 flex overflow-hidden">
        {loadingWorkspaces ? (
          <div className="flex-1 flex items-center justify-center">
            <LoadingSpinner size="lg" text="Loading your workspaces..." />
          </div>
        ) : (
          <>
            {/* Sidebar */}
            <Sidebar
              workspaces={workspaces}
              activeWorkspace={activeWorkspace}
              onSelectWorkspace={handleSelectWorkspaceById}
              onCreateWorkspace={() => setIsCreateWsOpen(true)}
              onOpenWorkspaceSettings={() => setIsWorkspaceModalOpen(true)}
              collections={collections}
              foldersByCollection={foldersByCollection}
              requestsByCollection={requestsByCollection}
              selectedRequestId={selectedRequest?.id}
              onSelectRequest={(req) => setSelectedRequest(req)}
              onCreateCollection={() => setIsCreateColOpen(true)}
              onCreateFolder={(colId) => {
                setSelectedColForFolder(colId);
                setIsCreateFolderOpen(true);
              }}
              onCreateRequest={handleCreateRequest}
              onDeleteCollection={handleDeleteCollection}
              onDeleteRequest={handleDeleteRequest}
              canEdit={canEdit}
              lockedRequests={lockedRequests}
              typingUsers={typingUsers}
              loading={loadingContent && collections.length === 0}
            />

            {/* Main Center Editor */}
            {selectedRequest ? (
              <RequestEditor
                request={selectedRequest}
                onSave={handleSaveRequest}
                canEdit={canEdit}
                environments={environments}
                activeEnvironmentId={activeEnvironmentId}
                onChangeEnvironment={setActiveEnvironmentId}
                currentUserId={user?.id}
                isLockedByMe={lockedRequests[selectedRequest?.id]?.user_id === user?.id}
                isLockedByOther={
                  !!lockedRequests[selectedRequest?.id] &&
                  lockedRequests[selectedRequest?.id]?.user_id !== user?.id
                }
                lockHolderName={lockedRequests[selectedRequest?.id]?.username}
                onAcquireLock={handleAcquireLock}
                onReleaseLock={handleReleaseLock}
                typingUser={typingUsers[selectedRequest?.id]}
                onTyping={sendTyping}
                onStopTyping={sendStopTyping}
                incomingCommentEvent={incomingCommentEvent}
              />
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="flex-1 flex flex-col items-center justify-center text-slate-500 text-sm gap-3 p-8 text-center bg-[radial-gradient(ellipse_at_center,rgb(14_165_233/0.05),transparent_60%)]"
              >
                <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 shadow-lg shadow-black/30 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-sky-400" aria-hidden="true" />
                </div>
                <p className="text-slate-200 font-semibold">No request open</p>
                <p className="text-xs text-slate-500 max-w-xs">Select a request from the sidebar or create a new one to begin.</p>
                <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
                  <span><kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">Enter</kbd> send</span>
                  <span><kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">S</kbd> save</span>
                </div>
              </motion.div>
            )}
          </>
        )}
      </div>

      {/* Modal: Workspace Settings & Members */}
      <WorkspaceSettingsModal
        isOpen={isWorkspaceModalOpen}
        onClose={() => setIsWorkspaceModalOpen(false)}
        workspace={activeWorkspace}
        members={workspaceMembers}
        userRole={activeRole}
        isOwner={isOwner}
        onRefresh={() => handleSelectWorkspace(activeWorkspace)}
      />

      {/* Modal: Create Workspace */}
      <Modal
        isOpen={isCreateWsOpen}
        onClose={() => setIsCreateWsOpen(false)}
        title="Create New Workspace"
      >
        <form onSubmit={handleCreateWorkspace} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 uppercase mb-1">
              Workspace Name
            </label>
            <input
              type="text"
              required
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              placeholder="e.g. My API Team"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400/70 focus:ring-2 focus:ring-sky-400/20 transition"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 uppercase mb-1">
              Description (Optional)
            </label>
            <textarea
              value={newWsDesc}
              onChange={(e) => setNewWsDesc(e.target.value)}
              placeholder="Workspace purpose"
              rows={3}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400/70 focus:ring-2 focus:ring-sky-400/20 transition"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 bg-sky-500 hover:bg-sky-400 active:bg-sky-600 text-slate-950 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            Create Workspace
          </button>
        </form>
      </Modal>

      {/* Modal: Create Collection */}
      <Modal
        isOpen={isCreateColOpen}
        onClose={() => setIsCreateColOpen(false)}
        title="Create Collection"
      >
        <form onSubmit={handleCreateCollection} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 uppercase mb-1">
              Collection Name
            </label>
            <input
              type="text"
              required
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              placeholder="e.g. Authentication"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400/70 focus:ring-2 focus:ring-sky-400/20 transition"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 uppercase mb-1">
              Description (Optional)
            </label>
            <input
              type="text"
              value={newColDesc}
              onChange={(e) => setNewColDesc(e.target.value)}
              placeholder="Module description"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400/70 focus:ring-2 focus:ring-sky-400/20 transition"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 bg-sky-500 hover:bg-sky-400 active:bg-sky-600 text-slate-950 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            Create Collection
          </button>
        </form>
      </Modal>

      {/* Modal: Create Folder */}
      <Modal
        isOpen={isCreateFolderOpen}
        onClose={() => setIsCreateFolderOpen(false)}
        title="Create Folder in Collection"
      >
        <form onSubmit={handleCreateFolder} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 uppercase mb-1">
              Folder Name
            </label>
            <input
              type="text"
              required
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g. Admin Endpoints"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400/70 focus:ring-2 focus:ring-sky-400/20 transition"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 bg-sky-500 hover:bg-sky-400 active:bg-sky-600 text-slate-950 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            Create Folder
          </button>
        </form>
      </Modal>
    </div>
  );
};
