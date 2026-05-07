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
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [cardErrors, setCardErrors] = useState({});

  const pollingRef = useRef(new Set());
  const pollTimerRef = useRef(null);

  const refresh = async () => {
    const data = await fetchAssistants(API_BASE);
    setAssistants(data || []);
    return data || [];
  };

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

  const handleIndex = async (id, force = false) => {
    setCardErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      await triggerIndex(API_BASE, id, force);
      setAssistants((prev) =>
        prev.map((a) => (a.id === id ? { ...a, index_status: 'indexing' } : a)),
      );
      pollingRef.current.add(id);
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
      setCardErrors((prev) => ({ ...prev, [id]: `Indexing failed: ${err.message}` }));
    }
  };

  const handleDelete = async (id) => {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      return;
    }
    setDeleteConfirmId(null);
    try {
      await deleteAssistant(API_BASE, id);
      pollingRef.current.delete(id);
      setAssistants((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setCardErrors((prev) => ({ ...prev, [id]: `Delete failed: ${err.message}` }));
    }
  };

  return (
    <div className="assistants-page">
      {/* Header */}
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

      {/* Create form */}
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

      {/* Assistant cards or empty state */}
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
                  onClick={() => handleIndex(assistant.id, false)}
                >
                  {assistant.index_status === 'not_indexed' ? 'Index' : 'Smart re-index'}
                </Button>
                {assistant.index_status !== 'not_indexed' && (
                  <Button
                    kind="ghost"
                    size="sm"
                    disabled={assistant.index_status === 'indexing'}
                    onClick={() => handleIndex(assistant.id, true)}
                    title="Wipe the index and re-embed every file from scratch"
                  >
                    Full re-index
                  </Button>
                )}

                <Button
                  kind="primary"
                  size="sm"
                  renderIcon={Bot}
                  disabled={assistant.index_status !== 'ready'}
                  onClick={() => onOpenChat(assistant)}
                >
                  Open chat
                </Button>

                {deleteConfirmId === assistant.id ? (
                  <div className="card-confirm-bar">
                    <span className="card-confirm-label">Delete permanently?</span>
                    <Button kind="danger" size="sm" onClick={() => handleDelete(assistant.id)}>
                      Confirm
                    </Button>
                    <Button kind="ghost" size="sm" onClick={() => setDeleteConfirmId(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    kind="danger--ghost"
                    size="sm"
                    hasIconOnly
                    renderIcon={TrashCan}
                    iconDescription="Delete assistant"
                    onClick={() => handleDelete(assistant.id)}
                  />
                )}
              </div>

              {cardErrors[assistant.id] && (
                <p className="card-inline-error">
                  <WarningFilled size={14} /> {cardErrors[assistant.id]}
                </p>
              )}
            </Tile>
          ))}
        </div>
      )}

      {/* Explainer */}
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
