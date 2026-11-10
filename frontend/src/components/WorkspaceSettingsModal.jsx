import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Modal, ErrorAlert, fieldClass, Avatar, timeAgo, useConfirm } from './common/UIComponents';
import { workspacesApi, environmentsApi } from '../api';

const TABS = [
  { id: 'members', label: 'Members' },
  { id: 'envs', label: 'Environments' },
];

const Panel = ({ title, children, onSubmit }) => (
  <form onSubmit={onSubmit} className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800 space-y-2.5">
    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">{title}</span>
    {children}
  </form>
);

const SubmitButton = ({ children, disabled }) => (
  <button
    type="submit"
    disabled={disabled}
    className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 rounded-md text-xs font-semibold cursor-pointer transition-colors"
  >
    {children}
  </button>
);

export const WorkspaceSettingsModal = ({
  isOpen,
  onClose,
  workspace,
  members,
  userRole,
  isOwner,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState('members');
  // const [inviteUserId, setInviteUserId] = useState('');
  const [inviteIdentifier, setInviteIdentifier] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [envName, setEnvName] = useState('');
  const [envIsDefault, setEnvIsDefault] = useState(false);

  const confirm = useConfirm();
  const handleInvite = async (e) => {
    e.preventDefault();

    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await workspacesApi.inviteMember(workspace.id, {
        identifier: inviteIdentifier.trim(),
        role: inviteRole,
      });

      setSuccess('Member invited successfully');
      setInviteIdentifier('');
      onRefresh();

    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === 'string'
          ? detail
          : 'Failed to invite member'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (memberUserId, newRole) => {
    try {
      await workspacesApi.updateMemberRole(workspace.id, memberUserId, { role: newRole });
      onRefresh();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Failed to update role');
    }
  };

  const handleRemoveMember = async (memberUserId) => {
    if (!(await confirm({ title: 'Remove member', message: 'They will lose access to this workspace.', confirmLabel: 'Remove' }))) return;
    try {
      await workspacesApi.removeMember(workspace.id, memberUserId);
      onRefresh();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Failed to remove member');
    }
  };

  const handleCreateEnvironment = async (e) => {
    e.preventDefault();
    if (!envName.trim()) return;
    try {
      await environmentsApi.create(workspace.id, {
        name: envName.trim(),
        is_default: envIsDefault,
      });
      setEnvName('');
      setEnvIsDefault(false);
      onRefresh();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Failed to create environment');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Workspace: ${workspace?.name || ''}`}>
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs bg-slate-950/60 px-3 py-2.5 rounded-lg border border-slate-800">
          <span className="text-slate-400">Your role</span>
          <span className="font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-sky-400/10 text-sky-300 border border-sky-400/25">
            {userRole || 'viewer'}
          </span>
        </div>

        <div className="flex border-b border-slate-800 gap-5 text-xs font-medium">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`pb-2.5 border-b-2 -mb-px cursor-pointer transition-colors ${activeTab === tab.id
                  ? 'border-sky-400 text-sky-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
            >
              {tab.label}
              {tab.id === 'members' && <span className="ml-1.5 text-slate-500">{members.length}</span>}
            </button>
          ))}
        </div>

        <ErrorAlert message={error} onDismiss={() => setError('')} />
        {success && (
          <div className="px-3 py-2 text-xs bg-emerald-400/10 text-emerald-200 border border-emerald-400/25 rounded-md">
            {success}
          </div>
        )}

        {activeTab === 'members' && (
          <div className="space-y-4">
            {isOwner && (
              <Panel title="Invite member" onSubmit={handleInvite}>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Username or email"
                    aria-label="Username or email"
                    value={inviteIdentifier}
                    onChange={(e) => setInviteIdentifier(e.target.value)}
                    className={`${fieldClass} flex-1 min-w-0`}
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    aria-label="Role"
                    className={`${fieldClass} cursor-pointer`}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                  <SubmitButton disabled={loading}>Invite</SubmitButton>
                </div>
              </Panel>
            )}

            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-950/50 border border-slate-800/80 text-xs"
                >
                  <div className="min-w-0 flex items-center gap-2.5">
                    <Avatar name={m.username || `User #${m.user_id}`} />
                    <div className="min-w-0">
                      <span className="text-slate-100 font-medium">{m.username || `User #${m.user_id}`}</span>
                      <span className="block text-slate-500 text-[10px] mt-0.5">Joined {timeAgo(m.joined_at)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isOwner && m.role !== 'owner' ? (
                      <select
                        value={m.role}
                        aria-label={`Role for user ${m.user_id}`}
                        onChange={(e) => handleRoleChange(m.user_id, e.target.value)}
                        className={`${fieldClass} py-1 px-2 cursor-pointer`}
                      >
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <span className="text-[10px] uppercase font-semibold tracking-wide text-slate-400">{m.role}</span>
                    )}

                    {isOwner && m.role !== 'owner' && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(m.user_id)}
                        aria-label={`Remove user ${m.user_id}`}
                        className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'envs' && (
          <Panel title="Create environment" onSubmit={handleCreateEnvironment}>
            <div className="flex gap-2">
              <input
                type="text"
                required
                placeholder="e.g. Production, Staging"
                aria-label="Environment name"
                value={envName}
                onChange={(e) => setEnvName(e.target.value)}
                className={`${fieldClass} flex-1 min-w-0`}
              />
              <SubmitButton>Create</SubmitButton>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={envIsDefault}
                onChange={(e) => setEnvIsDefault(e.target.checked)}
                className="w-3.5 h-3.5 accent-sky-500 cursor-pointer"
              />
              <span>Set as default environment for this workspace</span>
            </label>
          </Panel>
        )}
      </div>
    </Modal>
  );
};
