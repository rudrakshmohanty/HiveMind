import { useEffect, useRef, useState } from 'react';
import { Button, TextInput } from '@carbon/react';
import {
  Add,
  Bot,
  Chat,
  Checkmark,
  Close,
  Code,
  Edit,
  FolderOpen,
  Renew,
  TrashCan,
  WarningFilled,
} from '@carbon/icons-react';
import { createAssistant, deleteAssistant, fetchAssistants, fetchIndexStatus, triggerIndex, updateAssistant } from './api';

const API_BASE = '/api';
const POLL_INTERVAL = 2500;

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }) {
  if (status === 'ready') return <span className="asst-badge badge-ready"><Checkmark size={11} /> Ready</span>;
  if (status === 'indexing') return <span className="asst-badge badge-indexing"><Renew size={11} /> Indexing</span>;
  if (status === 'error') return <span className="asst-badge badge-error"><WarningFilled size={11} /> Error</span>;
  return <span className="asst-badge badge-pending">Not indexed</span>;
}

export default function AssistantsPage({ onOpenChat, onQuickChat }) {
  const [assistants, setAssistants] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', codebase_path: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [cardErrors, setCardErrors] = useState({});
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ description: '', codebase_path: '' });
  const [editSaving, setEditSaving] = useState(false);

  const pollingRef = useRef(new Set());
  const pollTimerRef = useRef(null);
  const pollRunningRef = useRef(false);

  const refresh = async () => {
    const data = await fetchAssistants(API_BASE);
    setAssistants(data || []);
    return data || [];
  };

  const startPolling = () => {
    if (pollRunningRef.current) return;

    const tick = async () => {
      pollRunningRef.current = true;
      const ids = [...pollingRef.current];
      if (ids.length === 0) {
        pollRunningRef.current = false;
        pollTimerRef.current = null;
        return;
      }

      await Promise.all(
        ids.map(async (id) => {
          try {
            const status = await fetchIndexStatus(API_BASE, id);
            if (status.status !== 'indexing') pollingRef.current.delete(id);
            setAssistants((prev) =>
              prev.map((a) =>
                a.id === id
                  ? {
                      ...a,
                      index_status: status.status,
                      indexed_files: status.indexed_files ?? a.indexed_files,
                      total_files: status.total_files ?? a.total_files,
                      total_chunks: status.total_chunks ?? a.total_chunks,
                      index_percent: status.percent ?? a.index_percent ?? 0,
                    }
                  : a,
              ),
            );
          } catch {
            pollingRef.current.delete(id);
          }
        }),
      );

      pollRunningRef.current = false;
      if (pollingRef.current.size > 0) {
        pollTimerRef.current = setTimeout(tick, POLL_INTERVAL);
      } else {
        pollTimerRef.current = null;
      }
    };

    tick();
  };

  useEffect(() => {
    refresh().then((data) => {
      data.forEach((a) => {
        if (a.index_status === 'indexing') pollingRef.current.add(a.id);
      });
      if (pollingRef.current.size > 0) startPolling();
    });
    return () => clearTimeout(pollTimerRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clearCardError = (id) => setCardErrors((prev) => { const next = { ...prev }; delete next[id]; return next; });

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
    clearCardError(id);
    try {
      await triggerIndex(API_BASE, id, force);
      setAssistants((prev) => prev.map((a) => (a.id === id ? { ...a, index_status: 'indexing' } : a)));
      pollingRef.current.add(id);
      startPolling();
    } catch (err) {
      setCardErrors((prev) => ({ ...prev, [id]: `Indexing failed: ${err.message}` }));
    }
  };

  const handleDelete = async (id) => {
    if (deleteConfirmId !== id) { setDeleteConfirmId(id); return; }
    setDeleteConfirmId(null);
    try {
      await deleteAssistant(API_BASE, id);
      pollingRef.current.delete(id);
      setAssistants((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setCardErrors((prev) => ({ ...prev, [id]: `Delete failed: ${err.message}` }));
    }
  };

  const handleRenameStart = (assistant) => {
    setRenamingId(assistant.id);
    setRenameValue(assistant.name);
  };

  const handleRenameSubmit = async (id) => {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name) return;
    const existing = assistants.find((a) => a.id === id);
    if (existing?.name === name) return;
    try {
      const updated = await updateAssistant(API_BASE, id, { name });
      setAssistants((prev) => prev.map((a) => (a.id === id ? { ...a, name: updated.name } : a)));
    } catch (err) {
      setCardErrors((prev) => ({ ...prev, [id]: `Rename failed: ${err.message}` }));
    }
  };

  const handleEditStart = (assistant) => {
    setEditingId(assistant.id);
    setEditForm({ description: assistant.description || '', codebase_path: assistant.codebase_path });
  };

  const handleEditSave = async (id) => {
    setEditSaving(true);
    try {
      const updated = await updateAssistant(API_BASE, id, {
        description: editForm.description,
        codebase_path: editForm.codebase_path.trim(),
      });
      setAssistants((prev) => prev.map((a) => (a.id === id ? { ...a, ...updated } : a)));
      setEditingId(null);
    } catch (err) {
      setCardErrors((prev) => ({ ...prev, [id]: `Save failed: ${err.message}` }));
    } finally {
      setEditSaving(false);
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
        <div className="asst-form-card">
          <div className="asst-form-header">
            <p className="asst-form-title">New assistant</p>
            <button className="qc-icon-btn" onClick={() => { setCreating(false); setFormError(''); }}>
              <Close size={14} />
            </button>
          </div>

          <div className="form-row">
            <TextInput
              id="asst-name"
              labelText="Name"
              placeholder="e.g. backend-api"
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
          />
          <p className="form-hint">
            Absolute path to the local directory. <code>node_modules</code> and <code>.git</code> are skipped automatically.
          </p>

          {formError && (
            <p className="form-error"><WarningFilled size={14} /> {formError}</p>
          )}

          <div className="form-actions">
            <Button kind="secondary" onClick={() => { setCreating(false); setFormError(''); }}>
              Cancel
            </Button>
            <Button kind="primary" disabled={saving} onClick={handleCreate}>
              {saving ? 'Creating…' : 'Create assistant'}
            </Button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {assistants.length === 0 && !creating ? (
        <div className="assistants-empty">
          <div className="assistants-empty-icon"><Bot size={32} /></div>
          <h3>No assistants yet</h3>
          <p>Create one, point it at a local codebase, and index it. Then every conversation gets relevant code snippets injected as context automatically.</p>
          <Button kind="primary" renderIcon={Add} onClick={() => setCreating(true)}>
            New assistant
          </Button>
        </div>
      ) : (
        <div className="assistants-grid">
          {assistants.map((assistant) => (
            <div key={assistant.id} className="asst-card">
              {/* Card header */}
              <div className="asst-card-top">
                <div className="asst-card-icon"><Code size={18} /></div>
                <div className="asst-card-identity">
                  {renamingId === assistant.id ? (
                    <input
                      className="asst-rename-input"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSubmit(assistant.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      onBlur={() => handleRenameSubmit(assistant.id)}
                      autoFocus
                    />
                  ) : (
                    <button className="asst-name-btn" onClick={() => handleRenameStart(assistant)}>
                      {assistant.name}
                      <Edit size={11} className="asst-name-edit-icon" />
                    </button>
                  )}
                  {assistant.description && (
                    <p className="asst-card-desc">{assistant.description}</p>
                  )}
                </div>
                <StatusBadge status={assistant.index_status} />
              </div>

              {/* Path / edit section */}
              {editingId === assistant.id ? (
                <div className="asst-edit-form">
                  <TextInput
                    id={`edit-path-${assistant.id}`}
                    labelText="Codebase path"
                    value={editForm.codebase_path}
                    onChange={(e) => setEditForm((f) => ({ ...f, codebase_path: e.target.value }))}
                    size="sm"
                  />
                  <TextInput
                    id={`edit-desc-${assistant.id}`}
                    labelText="Description"
                    value={editForm.description}
                    onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                    size="sm"
                  />
                  <div className="asst-edit-actions">
                    <Button kind="secondary" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                    <Button kind="primary" size="sm" disabled={editSaving} onClick={() => handleEditSave(assistant.id)}>
                      {editSaving ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="asst-card-path">
                  <FolderOpen size={13} />
                  <span>{assistant.codebase_path}</span>
                  <button className="asst-path-edit-btn" onClick={() => handleEditStart(assistant)} title="Edit path">
                    <Edit size={11} />
                  </button>
                </div>
              )}

              {/* Stats */}
              {assistant.index_status === 'ready' && (
                <div className="asst-card-stats">
                  <span>{assistant.indexed_files} files</span>
                  <span className="asst-stats-dot">·</span>
                  <span>{assistant.total_chunks} chunks</span>
                  {assistant.last_indexed && (
                    <>
                      <span className="asst-stats-dot">·</span>
                      <span>Indexed {formatDate(assistant.last_indexed)}</span>
                    </>
                  )}
                </div>
              )}

              {/* Indexing progress */}
              {assistant.index_status === 'indexing' && (
                <div className="asst-progress">
                  <div className="asst-progress-track">
                    <div className="asst-progress-fill" style={{ width: `${assistant.index_percent ?? 0}%` }} />
                  </div>
                  <p className="asst-progress-label">
                    {assistant.total_files > 0
                      ? `${assistant.indexed_files} / ${assistant.total_files} files · ${assistant.total_chunks} chunks`
                      : 'Scanning…'}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="asst-card-actions">
                <div className="asst-actions-left">
                  <Button
                    kind="tertiary"
                    size="sm"
                    renderIcon={Renew}
                    disabled={assistant.index_status === 'indexing'}
                    onClick={() => handleIndex(assistant.id, false)}
                  >
                    {assistant.index_status === 'not_indexed' ? 'Index' : 'Re-index'}
                  </Button>
                  {assistant.index_status !== 'not_indexed' && (
                    <Button
                      kind="ghost"
                      size="sm"
                      disabled={assistant.index_status === 'indexing'}
                      onClick={() => handleIndex(assistant.id, true)}
                      title="Wipe and re-embed from scratch"
                    >
                      Full reset
                    </Button>
                  )}
                </div>

                <div className="asst-actions-right">
                  {deleteConfirmId === assistant.id ? (
                    <div className="asst-confirm-bar">
                      <span>Delete?</span>
                      <Button kind="danger" size="sm" onClick={() => handleDelete(assistant.id)}>Yes</Button>
                      <Button kind="ghost" size="sm" onClick={() => setDeleteConfirmId(null)}>No</Button>
                    </div>
                  ) : (
                    <>
                      {onQuickChat && (
                        <button
                          className="asst-quick-chat-btn"
                          disabled={assistant.index_status !== 'ready'}
                          onClick={() => onQuickChat(assistant)}
                          title="Quick chat (opens in side panel)"
                        >
                          <Chat size={14} />
                          Quick chat
                        </button>
                      )}
                      <Button
                        kind="primary"
                        size="sm"
                        renderIcon={Bot}
                        disabled={assistant.index_status !== 'ready'}
                        onClick={() => onOpenChat(assistant)}
                        title="Open full chat view"
                      >
                        Full chat
                      </Button>
                      <button
                        className="asst-delete-btn"
                        onClick={() => handleDelete(assistant.id)}
                        title="Delete assistant"
                        aria-label="Delete assistant"
                      >
                        <TrashCan size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {cardErrors[assistant.id] && (
                <p className="asst-card-error">
                  <WarningFilled size={13} /> {cardErrors[assistant.id]}
                  <button onClick={() => clearCardError(assistant.id)}><Close size={11} /></button>
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Explainer */}
      <div className="asst-explainer">
        <h4>How it works</h4>
        <div className="explainer-steps">
          <div className="explainer-step">
            <span className="explainer-num">1</span>
            <div>
              <strong>Index</strong>
              <p>
                The backend walks your directory, splits each file into overlapping chunks, and converts every chunk into an embedding vector using <code>nomic-embed-text</code> via Ollama. Vectors are stored in ChromaDB on disk.
              </p>
            </div>
          </div>
          <div className="explainer-step">
            <span className="explainer-num">2</span>
            <div>
              <strong>Retrieve</strong>
              <p>
                When you ask a question, your query is embedded with the same model. ChromaDB finds the 5 most semantically relevant code chunks using cosine similarity.
              </p>
            </div>
          </div>
          <div className="explainer-step">
            <span className="explainer-num">3</span>
            <div>
              <strong>Generate</strong>
              <p>
                Those chunks are injected as a system message before your question reaches the LLM. The model answers based on your actual code — not guesswork.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
