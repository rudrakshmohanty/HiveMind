/**
 * AssistantsPage — manage RAG-powered codespace assistants.
 *
 * HOW THIS PAGE FITS INTO RAG:
 *   This is the INDEXING side of RAG. Before the LLM can answer questions
 *   about your code, you need to:
 *     1. Create an assistant (give it a name + point it at a local directory)
 *     2. Hit "Index" — the backend walks the directory, chunks every file,
 *        embeds each chunk via Ollama, and stores the vectors in ChromaDB.
 *   After that, every chat message sent with this assistant automatically
 *   gets the 5 most relevant code snippets injected as system context.
 */

import { useEffect, useRef, useState } from 'react';
import { Button, Tag, TextInput, Tile } from '@carbon/react';
import {
  Add,
  Bot,
  Checkmark,
  Code,
  FolderOpen,
  Renew,
  TrashCan,
  WarningFilled,
} from '@carbon/icons-react';
import { createAssistant, deleteAssistant, fetchAssistants, fetchIndexStatus, triggerIndex } from './api';

const API_BASE = '/api';

// How often (ms) to poll the index status while an assistant is indexing.
// We keep it short so the user sees progress quickly.
const POLL_INTERVAL = 2500;

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }) {
  if (status === 'ready') return <Tag type="green"><Checkmark size={12} /> Ready</Tag>;
  if (status === 'indexing') return <Tag type="blue"><Renew size={12} /> Indexing…</Tag>;
  if (status === 'error') return <Tag type="red"><WarningFilled size={12} /> Error</Tag>;
  return <Tag type="gray">Not indexed</Tag>;
}

export default function AssistantsPage({ onOpenChat }) {
  const [assistants, setAssistants] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', codebase_path: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Track which assistants are currently being polled for indexing status.
  // Structure: Set<assistant_id>
  const pollingRef = useRef(new Set());
  const pollTimerRef = useRef(null);

  const refresh = async () => {
    const data = await fetchAssistants(API_BASE);
    setAssistants(data || []);
    return data || [];
  };

  // Poll index status for any assistant currently indexing.
  const pollIndexing = async () => {
    const ids = [...pollingRef.current];
    if (ids.length === 0) return;

    await Promise.all(
      ids.map(async (id) => {
        try {
          const status = await fetchIndexStatus(API_BASE, id);
          if (status.status !== 'indexing') {
            pollingRef.current.delete(id);
          }
          setAssistants((prev) =>
            prev.map((a) =>
              a.id === id
                ? {
                    ...a,
                    index_status: status.status,
                    indexed_files: status.indexed_files ?? a.indexed_files,
                    total_files:  status.total_files  ?? a.total_files,
                    total_chunks: status.total_chunks ?? a.total_chunks,
                    index_percent: status.percent     ?? a.index_percent ?? 0,
                  }
                : a,
            ),
          );
        } catch {
          pollingRef.current.delete(id);
        }
      }),
    );
  };

  // Run the polling loop whenever the pollingRef has active entries.
  useEffect(() => {
    const tick = async () => {
      await pollIndexing();
      if (pollingRef.current.size > 0) {
        pollTimerRef.current = setTimeout(tick, POLL_INTERVAL);
      }
    };
    tick();
    return () => clearTimeout(pollTimerRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    refresh().then((data) => {
      // Resume polling for any already-indexing assistants
      data.forEach((a) => {
        if (a.index_status === 'indexing') pollingRef.current.add(a.id);
      });
    });
  }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) return setFormError('Name is required');
    if (!form.codebase_path.trim()) return setFormError('Codebase path is required');
    setFormError('');
    setSaving(true);
    try {
      const assistant = await createAssistant(API_BASE, {
        name: form.name.trim(),
        description: form.description.trim(),
        codebase_path: form.codebase_path.trim(),
      });
      setAssistants((prev) => [assistant, ...prev]);
      setForm({ name: '', description: '', codebase_path: '' });
      setCreating(false);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleIndex = async (id) => {
    try {
      await triggerIndex(API_BASE, id);
      setAssistants((prev) =>
        prev.map((a) => (a.id === id ? { ...a, index_status: 'indexing' } : a)),
      );
      pollingRef.current.add(id);
      // Kick off the polling loop if it's not already running
      if (pollTimerRef.current === null) {
        const tick = async () => {
          await pollIndexing();
          if (pollingRef.current.size > 0) {
            pollTimerRef.current = setTimeout(tick, POLL_INTERVAL);
          } else {
            pollTimerRef.current = null;
          }
        };
        tick();
      }
    } catch (err) {
      alert(`Failed to start indexing: ${err.message}`);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this assistant and its entire vector index?')) return;
    try {
      await deleteAssistant(API_BASE, id);
      pollingRef.current.delete(id);
      setAssistants((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      alert(`Failed to delete: ${err.message}`);
    }
  };

  return (
    <div className="assistants-page">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="assistants-header">
        <div className="assistants-header-copy">
          <p className="eyebrow">RAG — Retrieval-Augmented Generation</p>
          <h2>Codespace Assistants</h2>
          <p className="assistants-subtitle">
            Index a codebase once. Every chat with that assistant automatically
            gets the most relevant code snippets as context.
          </p>
        </div>
        {!creating && (
          <Button kind="primary" renderIcon={Add} onClick={() => setCreating(true)}>
            New assistant
          </Button>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Create form                                                         */}
      {/* ------------------------------------------------------------------ */}
      {creating && (
        <Tile className="assistant-create-form">
          <p className="eyebrow" style={{ marginBottom: '1rem' }}>New assistant</p>

          <div className="form-row">
            <TextInput
              id="asst-name"
              labelText="Name"
              placeholder="e.g. my-api-assistant"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              size="md"
            />
            <TextInput
              id="asst-desc"
              labelText="Description (optional)"
              placeholder="What is this codebase about?"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              size="md"
            />
          </div>

          <TextInput
            id="asst-path"
            labelText="Codebase path"
            placeholder="/Users/you/projects/my-project"
            value={form.codebase_path}
            onChange={(e) => setForm((f) => ({ ...f, codebase_path: e.target.value }))}
            size="md"
            style={{ marginTop: '0.75rem' }}
          />
          <p className="form-hint">
            Absolute path to the local directory you want to index. Subdirectories
            like <code>node_modules</code> and <code>.git</code> are skipped automatically.
          </p>

          {formError && (
            <p className="form-error">
              <WarningFilled size={16} /> {formError}
            </p>
          )}

          <div className="form-actions">
            <Button kind="secondary" onClick={() => { setCreating(false); setFormError(''); }}>
              Cancel
            </Button>
            <Button kind="primary" disabled={saving} onClick={handleCreate}>
              {saving ? 'Creating…' : 'Create assistant'}
            </Button>
          </div>
        </Tile>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Assistant cards                                                     */}
      {/* ------------------------------------------------------------------ */}
      {assistants.length === 0 && !creating ? (
        <div className="assistants-empty">
          <Bot size={48} />
          <h3>No assistants yet</h3>
          <p>
            Create one, point it at a local codebase, and index it. Then every
            conversation with that assistant gets relevant code snippets
            automatically injected as context — no copy-pasting needed.
          </p>
          <Button kind="primary" renderIcon={Add} onClick={() => setCreating(true)}>
            New assistant
          </Button>
        </div>
      ) : (
        <div className="assistants-grid">
          {assistants.map((assistant) => (
            <Tile key={assistant.id} className="assistant-card">
              <div className="assistant-card-header">
                <div className="assistant-card-icon">
                  <Code size={20} />
                </div>
                <div className="assistant-card-title-group">
                  <h3 className="assistant-card-name">{assistant.name}</h3>
                  {assistant.description && (
                    <p className="assistant-card-desc">{assistant.description}</p>
                  )}
                </div>
                <StatusBadge status={assistant.index_status} />
              </div>

              <div className="assistant-card-path">
                <FolderOpen size={14} />
                <span>{assistant.codebase_path}</span>
              </div>

              {/* Stats — shown once indexed */}
              {assistant.index_status === 'ready' && (
                <div className="assistant-card-stats">
                  <span>{assistant.indexed_files} files</span>
                  <span>·</span>
                  <span>{assistant.total_chunks} chunks</span>
                  {assistant.last_indexed && (
                    <>
                      <span>·</span>
                      <span>Indexed {formatDate(assistant.last_indexed)}</span>
                    </>
                  )}
                </div>
              )}

              {/* Live progress bar — shown while indexing */}
              {assistant.index_status === 'indexing' && (
                <div className="index-progress">
                  <div className="index-progress-track">
                    <div
                      className="index-progress-fill"
                      style={{ width: `${assistant.index_percent ?? 0}%` }}
                    />
                  </div>
                  <p className="index-progress-label">
                    {assistant.total_files > 0
                      ? `${assistant.indexed_files} / ${assistant.total_files} files · ${assistant.total_chunks} chunks`
                      : 'Scanning directory…'}
                  </p>
                </div>
              )}

              <div className="assistant-card-actions">
                <Button
                  kind="tertiary"
                  size="sm"
                  renderIcon={Renew}
                  disabled={assistant.index_status === 'indexing'}
                  onClick={() => handleIndex(assistant.id)}
                >
                  {assistant.index_status === 'not_indexed' ? 'Index' : 'Re-index'}
                </Button>

                <Button
                  kind="primary"
                  size="sm"
                  renderIcon={Bot}
                  disabled={assistant.index_status !== 'ready'}
                  onClick={() => onOpenChat(assistant)}
                >
                  Open chat
                </Button>

                <Button
                  kind="danger--ghost"
                  size="sm"
                  hasIconOnly
                  renderIcon={TrashCan}
                  iconDescription="Delete assistant"
                  onClick={() => handleDelete(assistant.id)}
                />
              </div>
            </Tile>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Explainer                                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="assistants-explainer">
        <h4>How it works</h4>
        <div className="explainer-steps">
          <div className="explainer-step">
            <span className="explainer-num">1</span>
            <div>
              <strong>Index</strong>
              <p>
                The backend walks your directory, splits each file into
                60-line overlapping chunks, and converts every chunk into
                an embedding vector using <code>nomic-embed-text</code> via
                Ollama. Vectors are stored in ChromaDB on disk.
              </p>
            </div>
          </div>
          <div className="explainer-step">
            <span className="explainer-num">2</span>
            <div>
              <strong>Retrieve</strong>
              <p>
                When you ask a question, your query is embedded with the same
                model. ChromaDB finds the 5 stored chunks whose vectors are
                closest (cosine similarity) — these are the most semantically
                relevant pieces of code.
              </p>
            </div>
          </div>
          <div className="explainer-step">
            <span className="explainer-num">3</span>
            <div>
              <strong>Generate</strong>
              <p>
                Those chunks are injected as a system message before your
                question reaches the LLM. The model answers based on your
                actual code — not guesswork.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
