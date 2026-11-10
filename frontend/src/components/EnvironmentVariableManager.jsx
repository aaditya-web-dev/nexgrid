
import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Eye, EyeOff, Lock, X, Check, RefreshCw } from 'lucide-react';
import { environmentsApi } from '../api';

export const EnvironmentVariableManager = ({
  environmentId,
  canEdit = true,
}) => {
  const [variables, setVariables] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showSecrets, setShowSecrets] = useState({});
  const [editingId, setEditingId] = useState(null);

  const emptyForm = {
    key: '',
    value: '',
    is_secret: false,
  };

  const [form, setForm] = useState(emptyForm);

  const getError = (err) => {
    const detail = err.response?.data?.detail;
    return typeof detail === 'string'
      ? detail
      : 'Something went wrong. Please try again.';
  };

  // Fetch variables whenever the environment changes.
  const fetchVariables = async () => {
    if (!environmentId) {
      setVariables([]);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await environmentsApi.listVariables(environmentId);
      setVariables(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(getError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setVariables([]);
    setForm(emptyForm);
    setEditingId(null);
    setError('');
    fetchVariables();
  }, [environmentId]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!canEdit || !environmentId) return;

    const key = form.key.trim();

    if (!key) {
      setError('Variable key is required.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      if (editingId !== null) {
        const payload = {
          key,
          is_secret: form.is_secret,
        };

        // Never send the masked "***" value back to the server.
        // An empty value keeps an existing secret unchanged.
        if (form.value !== '') {
          payload.value = form.value;
        } else if (
          variables.find((v) => v.id === editingId)?.is_secret &&
          !form.is_secret
        ) {
          setError('Enter a new value before removing secret protection.');
          setSaving(false);
          return;
        }

        await environmentsApi.updateVariable(editingId, payload);
      } else {
        await environmentsApi.addVariable(environmentId, {
          key,
          value: form.value || null,
          is_secret: form.is_secret,
        });
      }

      resetForm();
      await fetchVariables();
    } catch (err) {
      setError(getError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (variable) => {
    if (!canEdit) return;

    setEditingId(variable.id);

    setForm({
      key: variable.key,
      // Secret values are masked by the backend.
      // Ask for a replacement instead of using "***".
      value: variable.is_secret ? '' : variable.value || '',
      is_secret: variable.is_secret,
    });

    setError('');
  };

  const handleDelete = async (variableId) => {
    if (!canEdit) return;

    if (!window.confirm('Delete this environment variable?')) return;

    setError('');

    try {
      await environmentsApi.deleteVariable(variableId);

      if (editingId === variableId) resetForm();

      await fetchVariables();
    } catch (err) {
      setError(getError(err));
    }
  };

  const toggleSecretVisibility = (id) => {
    setShowSecrets((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const inputClass =
    'w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-sky-400 transition-colors';

  const buttonClass =
    'inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  if (!environmentId) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        Select an environment to manage its variables.
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            Environment Variables
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Reuse variables across requests using {'{{variable}}'}.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchVariables}
          disabled={loading}
          title="Refresh variables"
          className="p-2 text-slate-400 hover:text-sky-400 rounded-lg hover:bg-slate-800"
        >
          <RefreshCw
            size={15}
            className={loading ? 'animate-spin' : ''}
          />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Variables list */}
      <div className="border border-slate-800 rounded-xl overflow-hidden">

        <div className="grid grid-cols-[1fr_1.3fr_auto] gap-3 px-4 py-3 bg-slate-900/70 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          <span>Variable</span>
          <span>Value</span>
          <span>Actions</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Loading variables...
          </div>
        ) : variables.length === 0 ? (
          <div className="p-8 text-center">
            <Lock className="w-6 h-6 mx-auto text-slate-600 mb-2" />
            <p className="text-sm text-slate-400">
              No variables added yet.
            </p>
            <p className="text-xs text-slate-600 mt-1">
              Add variables to reuse values across requests.
            </p>
          </div>
        ) : (
          variables.map((variable) => (
            <div
              key={variable.id}
              className="grid grid-cols-[1fr_1.3fr_auto] gap-3 items-center px-4 py-3 border-t border-slate-800 hover:bg-slate-900/40"
            >
              {/* Key */}
              <div className="min-w-0">
                <p className="text-sm font-mono text-sky-300 truncate">
                  {variable.key}
                </p>

                {variable.is_secret && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 mt-1">
                    <Lock size={10} /> Secret
                  </span>
                )}
              </div>

              {/* Value */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-slate-300 font-mono truncate">
                  {variable.is_secret
                    ? showSecrets[variable.id]
                      ? '•••••••• (masked by server)'
                      : '••••••••'
                    : variable.value || 'Empty'}
                </span>

                {variable.is_secret && (
                  <button
                    type="button"
                    onClick={() => toggleSecretVisibility(variable.id)}
                    title="Toggle secret visibility"
                    className="text-slate-500 hover:text-slate-200 shrink-0"
                  >
                    {showSecrets[variable.id]
                      ? <EyeOff size={14} />
                      : <Eye size={14} />}
                  </button>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                {canEdit && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleEdit(variable)}
                      title="Edit variable"
                      className="p-2 text-slate-500 hover:text-sky-400 hover:bg-slate-800 rounded-md"
                    >
                      <Pencil size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(variable.id)}
                      title="Delete variable"
                      className="p-2 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-md"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add / Edit form */}
      {canEdit && (
        <form
          onSubmit={handleSubmit}
          className="border border-slate-800 bg-slate-900/40 rounded-xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {editingId !== null ? 'Edit Variable' : 'Add Variable'}
            </h4>

            {editingId !== null && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-slate-500 hover:text-slate-200"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">
                Variable Key
              </label>
              <input
                value={form.key}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    key: e.target.value,
                  }))
                }
                placeholder="e.g. base_url"
                className={inputClass}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">
                Variable Value
              </label>
              <input
                type={form.is_secret ? 'password' : 'text'}
                value={form.value}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    value: e.target.value,
                  }))
                }
                placeholder={
                  editingId !== null && form.is_secret
                    ? 'Leave blank to keep existing secret'
                    : 'Enter variable value'
                }
                className={inputClass}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={form.is_secret}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  is_secret: e.target.checked,
                }))
              }
              className="accent-sky-500"
            />
            <Lock size={12} />
            Mark as secret
          </label>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || !form.key.trim()}
              className={`${buttonClass} bg-sky-500 hover:bg-sky-400 text-slate-950`}
            >
              {editingId !== null
                ? <Check size={15} />
                : <Plus size={15} />}

              {saving
                ? 'Saving...'
                : editingId !== null
                  ? 'Update Variable'
                  : 'Add Variable'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
