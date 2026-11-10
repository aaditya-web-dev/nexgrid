import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock, Unlock, Save, Send, Pencil, Eye, EyeOff, Wand2, CheckCircle2, AlertTriangle, ChevronDown } from 'lucide-react';
import { LoadingSpinner, fieldClass } from './common/UIComponents';

const METHOD_COLOR = {
  GET: 'text-emerald-400', POST: 'text-amber-400', PUT: 'text-sky-400', PATCH: 'text-teal-300',
  DELETE: 'text-rose-400', HEAD: 'text-cyan-300', OPTIONS: 'text-slate-300',
};

const jsonStatus = (text) => {
  if (!text.trim()) return null;
  try { JSON.parse(text); return { ok: true }; } catch (e) { return { ok: false, msg: e.message }; }
};
import { CommentPanel } from './CommentPanel';
import { TestCasePanel } from './TestCasePanel';
import { KeyValueTable } from './KeyValueTable';
import { ResponseViewer } from './ResponseViewer';
import { requestsApi } from '../api';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const BODY_TYPES = ['none', 'json', 'raw', 'x_www_form_urlencoded'];
const TABS = ['params', 'headers', 'body', 'auth', 'preview', 'tests'];

const toRows = (obj) =>
  Object.entries(obj || {}).map(([k, v]) => ({ key: k, value: String(v), enabled: true }));

const toEditorState = (req) => {
  const auth = req?.auth_config || {};
  return {
    name: req?.name || '',
    description: req?.description || '',
    method: req?.method || 'GET',
    url: req?.url || '',
    queryParams: toRows(req?.query_params),
    headers: toRows(req?.headers),
    bodyType: req?.body_type || 'none',
    body: req?.body || '',
    authType: req?.auth_type || 'none',
    bearerToken: auth.token || '',
    basicUser: auth.username || '',
    basicPass: auth.password || '',
    apiKeyName: auth.key || '',
    apiKeyValue: auth.value || '',
    apiKeyAddTo: auth.add_to || 'header',
  };
};

const toObject = (rows) => {
  const obj = {};
  rows.filter((r) => r.enabled && r.key).forEach((r) => {
    obj[r.key] = r.value;
  });
  return obj;
};

const buildPayload = (s) => {
  let authConfig = {};
  if (s.authType === 'bearer') authConfig = { token: s.bearerToken };
  if (s.authType === 'basic') authConfig = { username: s.basicUser, password: s.basicPass };
  if (s.authType === 'api_key') {
    authConfig = { key: s.apiKeyName, value: s.apiKeyValue, add_to: s.apiKeyAddTo };
  }

  return {
    name: s.name,
    description: s.description,
    method: s.method,
    url: s.url,
    query_params: toObject(s.queryParams),
    headers: toObject(s.headers),
    body_type: s.bodyType,
    body: s.bodyType === 'none' ? null : s.body,
    auth_type: s.authType,
    auth_config: authConfig,
  };
};

const SaveStatus = ({ canEdit, isEditable, isDirty }) => {
  if (!canEdit) return null;
  if (!isEditable) return <span className="text-[11px] text-slate-500">Read-only</span>;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${isDirty ? 'text-amber-300' : 'text-slate-500'
        }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isDirty ? 'bg-amber-400' : 'bg-emerald-400'}`} />
      {isDirty ? 'Unsaved changes' : 'All changes saved'}
    </span>
  );
};

const Field = ({ label, children }) => (
  <div className="space-y-1.5">
    <label className="block text-[11px] text-slate-400 font-semibold uppercase tracking-wider">{label}</label>
    {children}
  </div>
);

export const RequestEditor = ({
  request,
  onSave,
  canEdit,
  environments = [],
  activeEnvironmentId,
  onChangeEnvironment,
  currentUserId,
  isLockedByOther = false,
  lockHolderName = '',
  isLockedByMe = false,
  onAcquireLock,
  onReleaseLock,
  typingUser = null,
  onTyping,
  onStopTyping,
  incomingCommentEvent = null,
}) => {
  const [draft, setDraft] = useState(() => toEditorState(request));
  const [activeTab, setActiveTab] = useState('params');
  const [showSecret, setShowSecret] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [responseCache, setResponseCache] = useState({});
  const [execError, setExecError] = useState('');
  const [resolvedPreview, setResolvedPreview] = useState(null);
  const typingTimerRef = useRef(null);
  const splitRef = useRef(null);
  const [split, setSplit] = useState(50);

  const isEffectivelyEditable = canEdit && !isLockedByOther;

  const savedPayload = useMemo(() => buildPayload(toEditorState(request)), [request]);
  const currentPayload = buildPayload(draft);
  const isDirty = JSON.stringify(currentPayload) !== JSON.stringify(savedPayload);

  const updateDraft = (patch) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const notifyTyping = () => {
    if (!onTyping || !request?.id) return;
    onTyping(request.id);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      onStopTyping?.(request.id);
    }, 1500);
  };

  // Update request editor when navigating between requests
  useEffect(() => {
    if (!request) return;

    setDraft(toEditorState(request));
    setExecError('');
    setResolvedPreview(null);
  }, [request]);

  // Restore the response belonging to the selected request
  useEffect(() => {
    setExecutionResult(
      request?.id ? responseCache[request.id] || null : null
    );
  }, [request?.id, responseCache]);

  const handleSave = () => {
    if (!isEffectivelyEditable) return;
    onSave(request.id, currentPayload);
  };

 
const handleExecute = async () => {
    setExecuting(true);
    setExecError('');

    try {
        if (request?.id) {
            if (isEffectivelyEditable) {
                await onSave(request.id, currentPayload);
            }

            const res = await requestsApi.execute(
                request.id,
                activeEnvironmentId || null,
                30.0
            );

            // Display the response
            setExecutionResult(res.data);

            // Save response against this request ID
            setResponseCache(prev => ({
                ...prev,
                [request.id]: res.data
            }));

        } else {
            const res = await requestsApi.quickRun({
                url: currentPayload.url,
                method: currentPayload.method,
                headers: currentPayload.headers,
                query_params: currentPayload.query_params,
                body: currentPayload.body,
            });

            setExecutionResult(res.data);
        }

    } catch (err) {
        const detail = err.response?.data?.detail;
        setExecError(
            typeof detail === 'string'
                ? detail
                : 'Execution failed. Check URL and server status.'
        );
    } finally {
        setExecuting(false);
    }
};


  const handlePreviewResolve = async () => {
    if (!request?.id) return;
    try {
      const res = await requestsApi.resolve(request.id, activeEnvironmentId || null);
      setResolvedPreview(res.data);
    } catch (err) {
      console.error('Resolve preview error:', err);
    }
  };

  const shortcutRef = useRef({});
  shortcutRef.current = { handleExecute, handleSave };
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 'Enter') { e.preventDefault(); shortcutRef.current.handleExecute(); }
      if (e.key.toLowerCase() === 's') { e.preventDefault(); shortcutRef.current.handleSave(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const bodyJson = draft.bodyType === 'json' ? jsonStatus(draft.body) : null;
  const beautify = () => {
    try { updateDraft({ body: JSON.stringify(JSON.parse(draft.body), null, 2) }); } catch { /* invalid JSON: leave as is */ }
  };
  const countOf = (rows) => rows.filter((r) => r.enabled && r.key).length;

  const updateRows = (field) => (idx, key, val) => {
    setDraft((prev) => {
      const rows = [...prev[field]];
      rows[idx] = { ...rows[idx], [key]: val };
      return { ...prev, [field]: rows };
    });
  };

  const addRow = (field) => () =>
    setDraft((prev) => ({ ...prev, [field]: [...prev[field], { key: '', value: '', enabled: true }] }));

  const removeRow = (field) => (idx) =>
    setDraft((prev) => ({ ...prev, [field]: prev[field].filter((_, i) => i !== idx) }));

  const dragSplit = (e) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId) || !splitRef.current) return;
    const rect = splitRef.current.getBoundingClientRect();
    setSplit(Math.min(75, Math.max(25, ((e.clientX - rect.left) / rect.width) * 100)));
  };

  const fieldInput = `${fieldClass} w-full font-mono`;

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden min-w-0">
      <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {isLockedByOther && (
            <motion.div
              key="lock-banner"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="flex items-start gap-2.5 p-3 bg-amber-500/10 border border-amber-500/25 text-amber-200 rounded-lg text-xs leading-relaxed">
                <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
                <span>
                  Being edited by <strong className="font-semibold">{lockHolderName || 'another team member'}</strong>.
                  It is read-only until they release the lock.
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <input
              type="text"
              value={draft.name}
              disabled={!isEffectivelyEditable}
              aria-label="Request name"
              onChange={(e) => {
                updateDraft({ name: e.target.value });
                notifyTyping();
              }}
              placeholder="Request name"
              className="bg-transparent text-sm font-semibold text-slate-100 placeholder:text-slate-500 border-b border-transparent hover:border-slate-700 focus:border-sky-400 focus:outline-none px-1 py-0.5 min-w-0 max-w-sm disabled:cursor-not-allowed transition-colors"
            />
            <SaveStatus canEdit={canEdit} isEditable={isEffectivelyEditable} isDirty={isDirty} />
          </div>

          <div className="flex items-center gap-2">

            <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded-md border border-slate-700">
              <span className="text-[11px] text-slate-400">Env</span>

              <select
                value={activeEnvironmentId || ''}
                aria-label="Active environment"
                onChange={(e) =>
                  onChangeEnvironment(
                    e.target.value ? Number(e.target.value) : null
                  )
                }
                className="bg-slate-900 text-xs text-slate-200 cursor-pointer focus:outline-none"
              >
                <option value="" className="bg-slate-900 text-slate-400">
                  No environment
                </option>

                {environments.map((env) => (
                  <option
                    key={env.id}
                    value={env.id}
                    className="bg-slate-900 text-slate-200"
                  >
                    {env.name} {env.is_default ? '(default)' : ''}
                  </option>
                ))}
              </select>
            </div>


            {canEdit && (
              <>
                {isLockedByMe ? (
                  <button
                    type="button"
                    onClick={onReleaseLock}
                    title="Release lock to allow others to edit"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/30 rounded-md cursor-pointer transition-colors"
                  >
                    <Unlock className="w-3.5 h-3.5" /> Release lock
                  </button>
                ) : isLockedByOther ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-amber-300">
                    <Lock className="w-3.5 h-3.5" /> Locked
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={onAcquireLock}
                    title="Acquire exclusive editing lock"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:text-slate-50 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md cursor-pointer transition-colors"
                  >
                    <Lock className="w-3.5 h-3.5" /> Lock
                  </button>
                )}
                <motion.button
                  type="button"
                  onClick={handleSave}
                  disabled={!isEffectivelyEditable || !isDirty}
                  whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 disabled:bg-slate-800 disabled:text-slate-500 rounded-md cursor-pointer disabled:cursor-not-allowed transition-colors"
                >
                  <Save className="w-3.5 h-3.5" /> Save
                </motion.button>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex flex-1 min-w-0 items-stretch rounded-lg border border-slate-700 bg-slate-950 shadow-sm shadow-black/30 focus-within:border-sky-400/70 focus-within:ring-2 focus-within:ring-sky-400/20 transition">
            <div className="relative shrink-0 border-r border-slate-800">
              <select
                value={draft.method}
                disabled={!isEffectivelyEditable}
                aria-label="HTTP method"
                onChange={(e) => {
                  updateDraft({ method: e.target.value });
                  notifyTyping();
                }}
                className={`appearance-none bg-transparent pl-3 pr-7 py-2 h-full text-xs font-mono font-bold cursor-pointer focus:outline-none disabled:cursor-not-allowed ${METHOD_COLOR[draft.method] || 'text-slate-300'}`}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m} className="bg-slate-900 text-slate-100">{m}</option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
            </div>
            <input
              type="text"
              value={draft.url}
              disabled={!isEffectivelyEditable}
              aria-label="Request URL"
              onChange={(e) => {
                updateDraft({ url: e.target.value });
                notifyTyping();
              }}
              placeholder="Enter request URL or {{variable}}"
              className="flex-1 min-w-0 bg-transparent px-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          <motion.button
            type="button"
            onClick={handleExecute}
            disabled={executing || !draft.url.trim()}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            animate={
              executing
                ? { boxShadow: ['0 0 0 0 rgba(56,189,248,0.55)', '0 0 0 9px rgba(56,189,248,0)'] }
                : { boxShadow: '0 0 0 0 rgba(56,189,248,0)' }
            }
            transition={executing ? { duration: 1, repeat: Infinity } : { duration: 0.2 }}
            title="Send (Ctrl/Cmd + Enter)"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 rounded-lg text-xs font-semibold cursor-pointer transition-colors min-w-24 justify-center shadow-sm shadow-sky-500/20"
          >
            {executing ? (
              <span className="w-3.5 h-3.5 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
            ) : (
              <>
                <Send className="w-3.5 h-3.5" /> Send
              </>
            )}
          </motion.button>
        </div>

        <AnimatePresence initial={false}>
          {typingUser && (
            <motion.div
              key="typing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 text-[11px] text-sky-300 pl-0.5"
            >
              <Pencil className="w-3 h-3 animate-pulse" aria-hidden="true" />
              <span>
                <strong className="font-semibold">{typingUser}</strong> is typing...
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div ref={splitRef} style={{ '--split': `${split}%` }} className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <div className="flex-1 md:flex-none md:basis-[var(--split)] flex flex-col overflow-hidden min-w-0">
          <div className="flex items-center border-b border-slate-800 px-3 gap-1 text-xs font-medium overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setActiveTab(t);
                  if (t === 'preview') handlePreviewResolve();
                }}
                className={`relative px-2.5 py-3 capitalize whitespace-nowrap cursor-pointer transition-colors ${activeTab === t ? 'text-sky-300' : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                {t}
                {(t === 'params' || t === 'headers') && countOf(t === 'params' ? draft.queryParams : draft.headers) > 0 && (
                  <span className="ml-1.5 px-1.5 py-px rounded-full bg-slate-800 text-[10px] text-sky-300 font-mono">
                    {countOf(t === 'params' ? draft.queryParams : draft.headers)}
                  </span>
                )}
                {activeTab === t && (
                  <motion.span
                    layoutId="editor-tab-indicator"
                    className="absolute left-2 right-2 -bottom-px h-0.5 bg-sky-400 rounded-full"
                    transition={{ duration: 0.2 }}
                  />
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {activeTab === 'params' && (
                  <KeyValueTable
                    rows={draft.queryParams}
                    canEdit={isEffectivelyEditable}
                    onAdd={addRow('queryParams')}
                    onUpdate={updateRows('queryParams')}
                    onRemove={removeRow('queryParams')}
                    keyPlaceholder="Key"
                    valuePlaceholder="Value or {{variable}}"
                    addLabel="Add param"
                    emptyText="No query parameters yet."
                  />
                )}

                {activeTab === 'headers' && (
                  <KeyValueTable
                    rows={draft.headers}
                    canEdit={isEffectivelyEditable}
                    onAdd={addRow('headers')}
                    onUpdate={updateRows('headers')}
                    onRemove={removeRow('headers')}
                    keyPlaceholder="Header"
                    valuePlaceholder="Value"
                    addLabel="Add header"
                    emptyText="No custom headers yet."
                  />
                )}

                {activeTab === 'body' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-1 p-0.5 w-fit rounded-md bg-slate-900 border border-slate-800">
                      {BODY_TYPES.map((bt) => (
                        <button
                          key={bt}
                          type="button"
                          disabled={!isEffectivelyEditable}
                          onClick={() => updateDraft({ bodyType: bt })}
                          className={`px-2.5 py-1 text-[11px] font-medium rounded cursor-pointer transition-colors disabled:cursor-not-allowed ${draft.bodyType === bt
                            ? 'bg-slate-700 text-slate-100'
                            : 'text-slate-400 hover:text-slate-200'
                            }`}
                        >
                          {bt === 'x_www_form_urlencoded' ? 'form-urlencoded' : bt}
                        </button>
                      ))}
                    </div>

                    {draft.bodyType !== 'none' ? (
                      <div className="space-y-2">
                        {draft.bodyType === 'json' && (
                          <div className="flex items-center justify-between text-[11px]">
                            {bodyJson ? (
                              bodyJson.ok ? (
                                <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="w-3 h-3" /> Valid JSON</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-amber-300 min-w-0"><AlertTriangle className="w-3 h-3 shrink-0" /> <span className="truncate">{bodyJson.msg}</span></span>
                              )
                            ) : <span className="text-slate-500">JSON body</span>}
                            <button type="button" onClick={beautify} disabled={!isEffectivelyEditable || !bodyJson?.ok}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-700 text-slate-300 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors">
                              <Wand2 className="w-3 h-3" /> Beautify
                            </button>
                          </div>
                        )}
                        <textarea
                          spellCheck={false}
                          rows={12}
                          value={draft.body}
                          disabled={!isEffectivelyEditable}
                          aria-label="Request body"
                          onChange={(e) => updateDraft({ body: e.target.value })}
                          placeholder='{"key": "value"}'
                          className={`${fieldClass} w-full p-3 font-mono leading-relaxed resize-y ${draft.bodyType === 'json' && bodyJson && !bodyJson.ok ? 'border-amber-400/50' : ''}`}
                        />
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 py-6 text-center">This request has no body.</div>
                    )}
                  </div>
                )}

                {activeTab === 'auth' && (
                  <div className="space-y-4 max-w-lg">
                    <Field label="Type">
                      <select
                        value={draft.authType}
                        disabled={!isEffectivelyEditable}
                        onChange={(e) => updateDraft({ authType: e.target.value })}
                        className={`${fieldClass} w-full px-2.5 py-2 cursor-pointer`}
                      >
                        <option value="none">No auth</option>
                        <option value="bearer">Bearer token</option>
                        <option value="basic">Basic auth</option>
                        <option value="api_key">API key</option>
                      </select>
                    </Field>

                    {draft.authType === 'bearer' && (
                      <Field label="Token">
                        <div className="relative">
                          <input
                            type={showSecret ? 'text' : 'password'}
                            placeholder="eyJhbG... or {{token}}"
                            value={draft.bearerToken}
                            disabled={!isEffectivelyEditable}
                            onChange={(e) => updateDraft({ bearerToken: e.target.value })}
                            className={`${fieldInput} pr-9`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowSecret((s) => !s)}
                            aria-label={showSecret ? 'Hide token' : 'Show token'}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-200 cursor-pointer"
                          >
                            {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </Field>
                    )}

                    {draft.authType === 'basic' && (
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Username">
                          <input
                            type="text"
                            value={draft.basicUser}
                            disabled={!isEffectivelyEditable}
                            onChange={(e) => updateDraft({ basicUser: e.target.value })}
                            className={fieldInput}
                          />
                        </Field>
                        <Field label="Password">
                          <input
                            type="password"
                            value={draft.basicPass}
                            disabled={!isEffectivelyEditable}
                            onChange={(e) => updateDraft({ basicPass: e.target.value })}
                            className={fieldInput}
                          />
                        </Field>
                      </div>
                    )}

                    {draft.authType === 'api_key' && (
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Key">
                          <input
                            type="text"
                            placeholder="X-API-Key"
                            value={draft.apiKeyName}
                            disabled={!isEffectivelyEditable}
                            onChange={(e) => updateDraft({ apiKeyName: e.target.value })}
                            className={fieldInput}
                          />
                        </Field>
                        <Field label="Value">
                          <input
                            type="text"
                            placeholder="Key value"
                            value={draft.apiKeyValue}
                            disabled={!isEffectivelyEditable}
                            onChange={(e) => updateDraft({ apiKeyValue: e.target.value })}
                            className={fieldInput}
                          />
                        </Field>
                        <Field label="Add to">
                          <select
                            value={draft.apiKeyAddTo}
                            disabled={!isEffectivelyEditable}
                            onChange={(e) => updateDraft({ apiKeyAddTo: e.target.value })}
                            className={`${fieldClass} w-full px-2.5 py-2 cursor-pointer`}
                          >
                            <option value="header">Header</option>
                            <option value="query">Query params</option>
                          </select>
                        </Field>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'preview' && (
                  <div className="space-y-3 font-mono text-xs">
                    <p className="text-slate-400 font-sans">Resolved with the active environment's variables.</p>
                    {resolvedPreview ? (
                      <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-3">
                        <div>
                          <span className="text-sky-300 font-sans text-[11px] uppercase tracking-wider">URL</span>
                          <p className="text-slate-200 mt-1 break-all">{resolvedPreview.resolved_url}</p>
                        </div>
                        <div>
                          <span className="text-sky-300 font-sans text-[11px] uppercase tracking-wider">Headers</span>
                          <pre className="text-slate-300 mt-1 whitespace-pre-wrap break-all">
                            {JSON.stringify(resolvedPreview.resolved_headers, null, 2)}
                          </pre>
                        </div>
                        {resolvedPreview.resolved_body && (
                          <div>
                            <span className="text-sky-300 font-sans text-[11px] uppercase tracking-wider">Body</span>
                            <pre className="text-slate-300 mt-1 whitespace-pre-wrap break-all">{resolvedPreview.resolved_body}</pre>
                          </div>
                        )}
                      </div>
                    ) : (
                      <LoadingSpinner size="sm" text="Resolving placeholders..." />
                    )}
                  </div>
                )}

                {activeTab === 'comments' && (
                  <CommentPanel
                    requestId={request?.id}
                    currentUserId={currentUserId}
                    incomingCommentEvent={incomingCommentEvent}
                  />
                )}

                {activeTab === 'tests' && (
                  <TestCasePanel
                    requestId={request?.id}
                    activeEnvironmentId={activeEnvironmentId}
                    currentUserId={currentUserId}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panels"
          title="Drag to resize, double-click to reset"
          onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
          onPointerMove={dragSplit}
          onDoubleClick={() => setSplit(50)}
          className="hidden md:block w-px bg-slate-800 relative shrink-0 cursor-col-resize before:absolute before:inset-y-0 before:-inset-x-1.5 before:content-[''] hover:bg-sky-400/70 active:bg-sky-400 transition-colors touch-none"
        />
        <ResponseViewer
          result={executionResult}
          executing={executing}
          error={execError}
          onDismissError={() => setExecError('')}
        />
      </div>
    </div>
  );
};
