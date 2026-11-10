import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, Inbox } from 'lucide-react';
import { ErrorAlert, SkeletonLines, LoadingSpinner } from './common/UIComponents';

const stamps = new WeakMap();
let stampCount = 0;
const stampOf = (r) => {
  if (!stamps.has(r)) stamps.set(r, ++stampCount);
  return stamps.get(r);
};
const timeTone = (ms) => (ms < 300 ? 'text-emerald-400' : ms < 1000 ? 'text-amber-300' : 'text-rose-400');

const RESPONSE_TABS = ['body', 'headers', 'cookies'];

const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

const highlightJson = (text) => {
  const nodes = [];
  let last = 0;
  for (const match of text.matchAll(JSON_TOKEN)) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const [token, str, colon, literal] = match;
    let className = 'text-amber-300';
    if (str) className = colon ? 'text-sky-300' : 'text-emerald-300';
    else if (literal) className = 'text-rose-300';
    nodes.push(
      <span key={match.index} className={className}>
        {token}
      </span>
    );
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
};

const formatBody = (raw) => {
  if (!raw) return { text: '', isJson: false };
  try {
    return { text: JSON.stringify(JSON.parse(raw), null, 2), isJson: true };
  } catch {
    return { text: raw, isJson: false };
  }
};

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
};

const statusTone = (code) => {
  if (!code) return 'bg-rose-500/10 text-rose-300 border-rose-500/25';
  if (code < 300) return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25';
  if (code < 400) return 'bg-sky-500/10 text-sky-300 border-sky-500/25';
  return 'bg-rose-500/10 text-rose-300 border-rose-500/25';
};

const parseCookies = (headers) => {
  const key = Object.keys(headers || {}).find((k) => k.toLowerCase() === 'set-cookie');
  if (!key) return [];
  return headers[key]
    .split(/,\s*(?=[^;,=\s]+=)/)
    .map((raw) => {
      const [pair, ...attrs] = raw.split(';').map((s) => s.trim());
      const eq = pair.indexOf('=');
      return {
        name: eq === -1 ? pair : pair.slice(0, eq),
        value: eq === -1 ? '' : pair.slice(eq + 1),
        attributes: attrs.filter(Boolean).join('; '),
      };
    });
};

const CodeBlock = ({ children, className = '' }) => (
  <pre
    className={`p-3.5 bg-slate-950 border border-slate-800 rounded-lg font-mono text-xs leading-relaxed text-slate-200 overflow-auto whitespace-pre-wrap break-all ${className}`}
  >
    {children}
  </pre>
);

const Segmented = ({ options, value, onChange }) => (
  <div className="inline-flex p-0.5 rounded-md bg-slate-900 border border-slate-800">
    {options.map((opt) => (
      <button
        key={opt.value}
        type="button"
        onClick={() => onChange(opt.value)}
        className={`relative px-2.5 py-1 text-[11px] font-medium rounded cursor-pointer transition-colors ${
          value === opt.value ? 'text-slate-950' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        {value === opt.value && (
          <motion.span
            layoutId="segment-indicator"
            className="absolute inset-0 rounded bg-sky-400"
            transition={{ duration: 0.2 }}
          />
        )}
        <span className="relative">{opt.label}</span>
      </button>
    ))}
  </div>
);

export const ResponseViewer = ({ result, executing, error, onDismissError }) => {
  const [activeTab, setActiveTab] = useState('body');
  const [viewMode, setViewMode] = useState('pretty');
  const [copied, setCopied] = useState(false);

  const cookies = result ? parseCookies(result.response_headers) : [];
  const body = formatBody(result?.response_body);

  const copyText = (text) => {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const currentCopyText = () => {
    if (activeTab === 'headers') return JSON.stringify(result.response_headers || {}, null, 2);
    return result.response_body || '';
  };

  const hasResult = !!result && !executing;

  return (
    <div className="flex-1 flex flex-col bg-slate-900/30 overflow-hidden min-w-0">
      <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Response</span>

        {hasResult && (
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <motion.span
              key={`s-${stampOf(result)}`}
              initial={{ scale: 1.35, opacity: 0.3 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className={`px-2 py-0.5 rounded border font-semibold ${statusTone(result.status_code)}`}
            >
              {result.status_code ? `${result.status_code}` : 'Error'}
            </motion.span>
            {result.response_time_ms != null && (
              <motion.span key={`t-${stampOf(result)}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className={timeTone(result.response_time_ms)}>
                {result.response_time_ms} ms
              </motion.span>
            )}
            {result.response_size_bytes != null && (
              <span className="text-slate-400">{formatSize(result.response_size_bytes)}</span>
            )}
          </div>
        )}
      </div>

      <ErrorAlert message={error} onDismiss={onDismissError} />

      {executing ? (
        <div className="flex-1 p-4 space-y-4">
          <LoadingSpinner size="sm" text="Sending request..." />
          <SkeletonLines lines={5} />
        </div>
      ) : !result ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="w-11 h-11 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center">
            <Inbox className="w-5 h-5 text-slate-500" aria-hidden="true" />
          </div>
          <p className="text-sm text-slate-300 font-medium">No response yet</p>
          <p className="text-xs text-slate-500 max-w-xs">Press Send to call the endpoint. The response will appear here.</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-4 pt-2 flex items-center justify-between gap-3 border-b border-slate-800">
            <div className="flex items-center gap-4 text-xs">
              {RESPONSE_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`relative pb-2.5 pt-1 capitalize cursor-pointer transition-colors ${
                    activeTab === tab ? 'text-sky-300' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab}
                  {tab === 'cookies' && cookies.length > 0 && (
                    <span className="ml-1 text-[10px] text-slate-500">{cookies.length}</span>
                  )}
                  {activeTab === tab && (
                    <motion.span
                      layoutId="response-tab-indicator"
                      className="absolute left-0 right-0 -bottom-px h-0.5 bg-sky-400 rounded-full"
                      transition={{ duration: 0.2 }}
                    />
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 pb-1.5">
              {activeTab === 'body' && (
                <Segmented
                  value={viewMode}
                  onChange={setViewMode}
                  options={[
                    { value: 'pretty', label: 'Pretty' },
                    { value: 'raw', label: 'Raw' },
                  ]}
                />
              )}
              <button
                type="button"
                onClick={() => copyText(currentCopyText())}
                disabled={activeTab !== 'headers' && !result.response_body}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 border border-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {result.error_message && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/25 text-rose-200 text-xs rounded-lg">
                {result.error_message}
              </div>
            )}

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${activeTab}-${viewMode}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {activeTab === 'body' &&
                  (!result.response_body ? (
                    <div className="text-xs text-slate-500 py-6 text-center">Empty response body</div>
                  ) : viewMode === 'pretty' && body.isJson ? (
                    <CodeBlock>{highlightJson(body.text)}</CodeBlock>
                  ) : (
                    <CodeBlock>{body.text}</CodeBlock>
                  ))}

                {activeTab === 'headers' &&
                  (result.response_headers && Object.keys(result.response_headers).length > 0 ? (
                    <div className="rounded-lg border border-slate-800 divide-y divide-slate-800 overflow-hidden">
                      {Object.entries(result.response_headers).map(([k, v]) => (
                        <div key={k} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 px-3 py-2 text-xs font-mono">
                          <span className="text-sky-300 break-all">{k}</span>
                          <span className="text-slate-300 break-all">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 py-6 text-center">No response headers</div>
                  ))}

                {activeTab === 'cookies' &&
                  (cookies.length > 0 ? (
                    <div className="rounded-lg border border-slate-800 divide-y divide-slate-800 overflow-hidden">
                      {cookies.map((c, i) => (
                        <div key={`${c.name}-${i}`} className="px-3 py-2 text-xs font-mono space-y-0.5">
                          <div>
                            <span className="text-sky-300">{c.name}</span>
                            <span className="text-slate-500"> = </span>
                            <span className="text-slate-200 break-all">{c.value}</span>
                          </div>
                          {c.attributes && <div className="text-[11px] text-slate-500 break-all">{c.attributes}</div>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 py-6 text-center">No cookies were set by this response</div>
                  ))}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
};
