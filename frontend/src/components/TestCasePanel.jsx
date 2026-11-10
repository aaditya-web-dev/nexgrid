import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Clock, FlaskConical, Pencil, Play, Sparkles, Trash2, X } from 'lucide-react';
import { testCasesApi } from '../api';
import { LoadingSpinner, ErrorAlert, SkeletonLines, fieldClass, useConfirm } from './common/UIComponents';

const CATEGORY_STYLES = {
  positive: { label: 'Positive', cls: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/25' },
  negative: { label: 'Negative', cls: 'bg-rose-400/10 text-rose-300 border-rose-400/25' },
  boundary: { label: 'Boundary', cls: 'bg-amber-400/10 text-amber-300 border-amber-400/25' },
  validation: { label: 'Validation', cls: 'bg-orange-400/10 text-orange-300 border-orange-400/25' },
  authentication: { label: 'Auth', cls: 'bg-teal-300/10 text-teal-300 border-teal-300/25' },
  authorization: { label: 'Authz', cls: 'bg-sky-400/10 text-sky-300 border-sky-400/25' },
};

const Chip = ({ className, children }) => (
  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${className}`}>
    {children}
  </span>
);

const CategoryBadge = ({ category }) => {
  const cfg = CATEGORY_STYLES[category] || { label: category, cls: 'bg-slate-700/40 text-slate-300 border-slate-600' };
  return <Chip className={cfg.cls}>{cfg.label}</Chip>;
};

const ActionButton = ({ onClick, disabled, tone = 'neutral', children, ariaLabel }) => {
  const tones = {
    neutral: 'text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 border-slate-700',
    success: 'text-emerald-300 hover:text-emerald-200 bg-emerald-400/10 hover:bg-emerald-400/20 border-emerald-400/25',
    warning: 'text-amber-300 hover:text-amber-200 bg-amber-400/10 hover:bg-amber-400/20 border-amber-400/25',
    primary: 'text-sky-300 hover:text-sky-200 bg-sky-400/10 hover:bg-sky-400/20 border-sky-400/25',
    danger: 'text-rose-300 hover:text-rose-200 bg-rose-400/10 hover:bg-rose-400/20 border-rose-400/25',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${tones[tone]}`}
    >
      {children}
    </button>
  );
};

const AssertionRow = ({ assertion }) => (
  <div className={`flex items-start gap-2 text-[11px] py-0.5 ${assertion.passed ? 'text-emerald-300' : 'text-rose-300'}`}>
    {assertion.passed ? (
      <Check className="w-3 h-3 mt-0.5 shrink-0" aria-label="Passed" />
    ) : (
      <X className="w-3 h-3 mt-0.5 shrink-0" aria-label="Failed" />
    )}
    <div className="min-w-0">
      <span className="font-mono text-slate-500">[{assertion.type}]</span>{' '}
      <span>{assertion.message}</span>
      {!assertion.passed && assertion.actual !== undefined && assertion.actual !== null && (
        <div className="text-slate-500 text-[10px] mt-0.5 font-mono break-all">
          Expected <span className="text-slate-300">{JSON.stringify(assertion.expected)}</span>
          {' · '}
          got <span className="text-rose-300">{JSON.stringify(assertion.actual)}</span>
        </div>
      )}
    </div>
  </div>
);

const resultTone = (status) => {
  if (status === 'passed') return { box: 'bg-emerald-400/5 border-emerald-400/20', chip: 'bg-emerald-400/15 text-emerald-300' };
  if (status === 'error') return { box: 'bg-amber-400/5 border-amber-400/20', chip: 'bg-amber-400/15 text-amber-300' };
  return { box: 'bg-rose-400/5 border-rose-400/20', chip: 'bg-rose-400/15 text-rose-300' };
};

const TestCaseCard = ({ tc, activeEnvironmentId, onUpdated, onDeleted }) => {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [runError, setRunError] = useState('');
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(tc.name);
  const [editDesc, setEditDesc] = useState(tc.description || '');
  const [editCategory, setEditCategory] = useState(tc.category);
  const [editStatus, setEditStatus] = useState(tc.expected_status_code || '');
  const [saving, setSaving] = useState(false);

  const handleApprove = async () => {
    try {
      const res = await testCasesApi.approve(tc.id);
      onUpdated(res.data);
    } catch (err) {
      console.error('Approve error', err);
    }
  };

  const handleReject = async () => {
    try {
      const res = await testCasesApi.reject(tc.id);
      onUpdated(res.data);
    } catch (err) {
      console.error('Reject error', err);
    }
  };

  const confirm = useConfirm();
  const handleDelete = async () => {
    if (!(await confirm({ title: 'Delete test case', message: `Delete "${tc.name}"? This cannot be undone.` }))) return;
    try {
      await testCasesApi.delete(tc.id);
      onDeleted(tc.id);
    } catch (err) {
      console.error('Delete error', err);
    }
  };

  const handleRun = async () => {
    setRunning(true);
    setRunError('');
    setResult(null);
    try {
      const res = await testCasesApi.run(tc.id, {
        environment_id: activeEnvironmentId || null,
        timeout_seconds: 30,
      });
      setResult(res.data);
    } catch (err) {
      setRunError(err.response?.data?.detail || 'Run failed');
    } finally {
      setRunning(false);
    }
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const res = await testCasesApi.update(tc.id, {
        name: editName,
        description: editDesc,
        category: editCategory,
        expected_status_code: editStatus ? Number(editStatus) : null,
      });
      onUpdated(res.data);
      setEditing(false);
    } catch (err) {
      console.error('Save error', err);
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditName(tc.name);
    setEditDesc(tc.description || '');
    setEditCategory(tc.category);
    setEditStatus(tc.expected_status_code || '');
  };

  const tone = result ? resultTone(result.status) : null;

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="bg-slate-900/70 border border-slate-800 rounded-lg p-3 space-y-2.5 text-xs"
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <CategoryBadge category={tc.category} />
        <Chip
          className={
            tc.is_approved
              ? 'bg-emerald-400/10 text-emerald-300 border-emerald-400/25'
              : 'bg-amber-400/10 text-amber-300 border-amber-400/25'
          }
        >
          {tc.is_approved ? 'Approved' : 'Pending'}
        </Chip>
        {tc.is_ai_generated && <Chip className="bg-sky-400/10 text-sky-300 border-sky-400/25">AI</Chip>}
        {tc.expected_status_code && (
          <span className="text-[10px] text-slate-400 font-mono">expect {tc.expected_status_code}</span>
        )}

        <div className="ml-auto flex items-center gap-1 shrink-0 flex-wrap">
          {!editing && (
            <ActionButton onClick={() => setEditing(true)} ariaLabel="Edit test case">
              <Pencil className="w-3 h-3" /> Edit
            </ActionButton>
          )}
          {!tc.is_approved ? (
            <ActionButton onClick={handleApprove} tone="success">
              <Check className="w-3 h-3" /> Approve
            </ActionButton>
          ) : (
            <ActionButton onClick={handleReject} tone="warning">
              Unapprove
            </ActionButton>
          )}
          {tc.is_approved && (
            <ActionButton onClick={handleRun} disabled={running} tone="primary">
              {running ? <LoadingSpinner size="sm" /> : <Play className="w-3 h-3" />}
              {running ? 'Running' : 'Run'}
            </ActionButton>
          )}
          <ActionButton onClick={handleDelete} tone="danger" ariaLabel="Delete test case">
            <Trash2 className="w-3 h-3" />
          </ActionButton>
        </div>
      </div>

      <AnimatePresence initial={false} mode="wait">
        {editing ? (
          <motion.div
            key="edit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="space-y-2 pt-1"
          >
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className={`${fieldClass} w-full`}
              placeholder="Test case name"
              aria-label="Test case name"
            />
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              rows={2}
              className={`${fieldClass} w-full resize-none`}
              placeholder="Description"
              aria-label="Test case description"
            />
            <div className="flex gap-2 items-center flex-wrap">
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                aria-label="Category"
                className={`${fieldClass} cursor-pointer`}
              >
                {Object.keys(CATEGORY_STYLES).map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_STYLES[cat].label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                className={`${fieldClass} w-28 font-mono`}
                placeholder="Expected status"
                aria-label="Expected status code"
              />
              <div className="flex gap-1.5 ml-auto">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={saving || !editName.trim()}
                  className="px-3 py-1.5 text-[11px] font-semibold bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 rounded-md cursor-pointer transition-colors"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="px-3 py-1.5 text-[11px] font-medium text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 rounded-md cursor-pointer transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div key="view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
            <p className="font-semibold text-slate-100">{tc.name}</p>
            {tc.description && <p className="text-slate-400 mt-0.5 leading-relaxed">{tc.description}</p>}
          </motion.div>
        )}
      </AnimatePresence>

      {runError && (
        <div className="p-2 bg-rose-400/5 border border-rose-400/20 text-rose-200 rounded-md text-[11px]">{runError}</div>
      )}

      <AnimatePresence initial={false}>
        {result && tone && (
          <motion.div
            key="result"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className={`p-2.5 rounded-md border space-y-2 ${tone.box}`}>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className={`font-semibold text-[10px] tracking-wider px-2 py-0.5 rounded ${tone.chip}`}>
                  {result.status.toUpperCase()}
                </span>
                {result.actual_status_code && (
                  <span className="text-slate-300 font-mono text-[11px]">
                    HTTP {result.actual_status_code}
                    {tc.expected_status_code && result.actual_status_code !== tc.expected_status_code && (
                      <span className="text-rose-300"> (expected {tc.expected_status_code})</span>
                    )}
                  </span>
                )}
                {result.response_time_ms != null && (
                  <span className="inline-flex items-center gap-1 text-slate-400 font-mono text-[11px]">
                    <Clock className="w-3 h-3" aria-hidden="true" />
                    {result.response_time_ms} ms
                  </span>
                )}
              </div>

              {result.assertion_results && result.assertion_results.length > 0 && (
                <div className="space-y-0.5 border-t border-slate-800 pt-2">
                  {result.assertion_results.map((a, i) => (
                    <AssertionRow key={i} assertion={a} />
                  ))}
                </div>
              )}

              {result.status !== 'passed' && result.failure_reason && (
                <p className="text-rose-200 text-[11px] border-t border-slate-800 pt-2 leading-relaxed">
                  {result.failure_reason}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export const TestCasePanel = ({ requestId, activeEnvironmentId }) => {
  const [testCases, setTestCases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [error, setError] = useState('');

  const fetchTestCases = useCallback(async () => {
    if (!requestId) return;
    try {
      setLoading(true);
      setError('');
      const res = await testCasesApi.list(requestId);
      setTestCases(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load test cases');
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    fetchTestCases();
  }, [fetchTestCases]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    setBulkResult(null);
    try {
      const res = await testCasesApi.generate(requestId, {});
      setTestCases((prev) => {
        const existingIds = new Set(prev.map((tc) => tc.id));
        const newOnes = res.data.test_cases.filter((tc) => !existingIds.has(tc.id));
        return [...prev, ...newOnes];
      });
    } catch (err) {
      setError(err.response?.data?.detail || 'AI generation failed. Check your API key in backend .env.');
    } finally {
      setGenerating(false);
    }
  };

  const handleRunAll = async () => {
    setRunningAll(true);
    setBulkResult(null);
    setError('');
    try {
      const res = await testCasesApi.runAll(requestId, {
        environment_id: activeEnvironmentId || null,
        timeout_seconds: 30,
      });
      setBulkResult(res.data);
      await fetchTestCases();
    } catch (err) {
      setError(err.response?.data?.detail || 'Bulk run failed');
    } finally {
      setRunningAll(false);
    }
  };

  const handleUpdated = (updated) => {
    setTestCases((prev) => prev.map((tc) => (tc.id === updated.id ? updated : tc)));
  };

  const handleDeleted = (id) => {
    setTestCases((prev) => prev.filter((tc) => tc.id !== id));
  };

  const approvedCount = testCases.filter((tc) => tc.is_approved).length;

  return (
    <div className="flex flex-col h-full space-y-4">
      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || !requestId}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 rounded-md text-xs font-semibold cursor-pointer transition-colors"
        >
          {generating ? <LoadingSpinner size="sm" /> : <Sparkles className="w-3.5 h-3.5" />}
          {generating ? 'Generating...' : 'Generate tests with AI'}
        </button>

        {approvedCount > 0 && (
          <button
            type="button"
            onClick={handleRunAll}
            disabled={runningAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-50 text-slate-100 rounded-md text-xs font-semibold cursor-pointer transition-colors"
          >
            {runningAll ? <LoadingSpinner size="sm" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
            {runningAll ? 'Running...' : `Run ${approvedCount} approved`}
          </button>
        )}

        <span className="ml-auto text-[11px] text-slate-500">
          {testCases.length} test{testCases.length !== 1 ? 's' : ''} · {approvedCount} approved
        </span>
      </div>

      <AnimatePresence initial={false}>
        {bulkResult && (
          <motion.div
            key="bulk"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs space-y-1.5 shrink-0"
          >
            <p className="font-semibold text-slate-100">Bulk run complete</p>
            <div className="flex gap-4 text-[11px] flex-wrap">
              <span className="text-slate-400">Executed <strong className="text-slate-100">{bulkResult.executed}</strong></span>
              <span className="text-emerald-300">Passed <strong>{bulkResult.passed}</strong></span>
              <span className="text-rose-300">Failed <strong>{bulkResult.failed}</strong></span>
              {bulkResult.errored > 0 && (
                <span className="text-amber-300">Errors <strong>{bulkResult.errored}</strong></span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
        {loading && testCases.length === 0 ? (
          <div className="space-y-3 py-2">
            <LoadingSpinner size="sm" text="Loading test cases..." />
            <SkeletonLines lines={3} />
          </div>
        ) : testCases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center">
              <FlaskConical className="w-5 h-5 text-sky-400" aria-hidden="true" />
            </div>
            <p className="text-slate-200 text-sm font-medium">No test cases yet</p>
            <p className="text-slate-500 text-xs max-w-xs leading-relaxed">
              Generate tests with AI to create positive, negative, boundary, and auth cases for this request.
            </p>
          </div>
        ) : (
          testCases.map((tc) => (
            <TestCaseCard
              key={tc.id}
              tc={tc}
              activeEnvironmentId={activeEnvironmentId}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))
        )}
      </div>
    </div>
  );
};
