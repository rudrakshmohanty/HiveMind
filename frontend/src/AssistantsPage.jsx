import { useEffect, useRef, useState } from 'react';
import { TextInput } from '@carbon/react';
import { createAssistant, deleteAssistant, fetchAssistants, fetchIndexStatus, triggerIndex, updateAssistant } from './api';

const API_BASE = '/api';
const POLL_INTERVAL = 2500;

function Icon({ name, size = 16, stroke = 1.5 }) {
  const c = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    plus:     <path d="M12 5v14M5 12h14"/>,
    folder:   <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></>,
    trash:    <><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></>,
    refresh:  <><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></>,
    cube:     <><path d="m12 2 9 5v10l-9 5-9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/></>,
    upload:   <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 9l5-5 5 5M12 4v12"/></>,
    check:    <path d="m5 12 5 5L20 7"/>,
    warning:  <><path d="M10.3 3.3 1.6 18a2 2 0 0 0 1.7 3h17.4a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></>,
    x:        <path d="M18 6 6 18M6 6l12 12"/>,
    edit:     <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/></>,
    chat:     <path d="M21 12a8 8 0 0 1-11.7 7.1L4 21l1.9-5.3A8 8 0 1 1 21 12z"/>,
    bot:      <><rect x="4" y="7" width="16" height="13" rx="2"/><path d="M12 3v4M8 14h.01M16 14h.01M9 18h6"/></>,
    code:     <path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>,
  };
  return <svg {...c}>{paths[name] ?? null}</svg>;
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }) {
  if (status === 'ready')       return <span className="asst-badge ready"><span className="dot-mini"/><Icon name="check" size={10}/> ready</span>;
  if (status === 'indexing')    return <span className="asst-badge indexing"><span className="dot-mini"/> indexing</span>;
  if (status === 'error')       return <span className="asst-badge error"><Icon name="warning" size={10}/> error</span>;
  return <span className="asst-badge pending"><span className="dot-mini"/> pending</span>;
}

export default function AssistantsPage({ onOpenChat, onQuickChat }) {
  const [assistants, setAssistants] = useState([]);
  const [over, setOver] = useState(false);
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
  const dragCounterRef = useRef(0);
  const folderInputRef = useRef(null);

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
      if (ids.length === 0) { pollRunningRef.current = false; pollTimerRef.current = null; return; }
      await Promise.all(ids.map(async (id) => {
        try {
          const status = await fetchIndexStatus(API_BASE, id);
          if (status.status !== 'indexing') pollingRef.current.delete(id);
          setAssistants((prev) => prev.map((a) => a.id === id ? {
            ...a,
            index_status: status.status,
            indexed_files: status.indexed_files ?? a.indexed_files,
            total_files: status.total_files ?? a.total_files,
            total_chunks: status.total_chunks ?? a.total_chunks,
            index_percent: status.percent ?? a.index_percent ?? 0,
          } : a));
        } catch { pollingRef.current.delete(id); }
      }));
      pollRunningRef.current = false;
      if (pollingRef.current.size > 0) { pollTimerRef.current = setTimeout(tick, POLL_INTERVAL); }
      else { pollTimerRef.current = null; }
    };
    tick();
  };

  useEffect(() => {
    refresh().then((data) => {
      data.forEach((a) => { if (a.index_status === 'indexing') pollingRef.current.add(a.id); });
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

  const handleRenameStart = (assistant) => { setRenamingId(assistant.id); setRenameValue(assistant.name); };
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

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
        e.preventDefault();
        folderInputRef.current?.click();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const openFormWithFolder = (name, hint = '') => {
    const clean = name.replace(/\.[^.]*$/, '') || 'New Source';
    setForm({ name: clean, description: '', codebase_path: hint || '' });
    setFormError('');
    setCreating(true);
  };

  const onFolderPick = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const rel = files[0].webkitRelativePath || '';
    const folderName = rel.split('/')[0] || files[0].name || 'folder';
    openFormWithFolder(folderName);
  };

  const onDragEnter = (e) => {
    e.preventDefault();
    dragCounterRef.current++;
    setOver(true);
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setOver(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setOver(false);
    const items = Array.from(e.dataTransfer.items || []);
    const entry = items[0]?.webkitGetAsEntry?.();
    const rawName = entry?.name || items[0]?.getAsFile?.()?.name || '';
    openFormWithFolder(rawName || 'New Source', rawName ? `~/${rawName}` : '');
  };

  return (
    <div className="asst-page">
      <div className="asst-page-inner">

        {/* Hero */}
        <div className="asst-hero">
          <div className="asst-hero-copy">
            <span className="eyebrow">Assistants · {assistants.length} sources</span>
            <h1>Knowledge that lives<br/>on <span style={{ color: 'var(--accent)' }}>your machine.</span></h1>
            <p>Each assistant is a codebase you've indexed. HiveMind chunks, embeds, and stores it locally — no upload, no cloud. Drop a folder anywhere on this page to begin.</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn-block outline"
              onClick={() => assistants.forEach(a => handleIndex(a.id, false))}
            >
              <Icon name="refresh" size={14}/> Re-index all
            </button>
            <button className="btn-block accent" onClick={() => setCreating(true)}>
              <Icon name="plus" size={14}/> New assistant
            </button>
          </div>
        </div>

        {/* Hidden folder picker */}
        <input
          ref={folderInputRef}
          type="file"
          style={{ display: 'none' }}
          webkitdirectory=""
          multiple
          onChange={onFolderPick}
        />

        {/* Drop zone */}
        <div
          className={'asst-drop' + (over ? ' over' : '')}
          onDragEnter={onDragEnter}
          onDragOver={e => e.preventDefault()}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => folderInputRef.current?.click()}
          style={{ cursor: 'pointer' }}
        >
          <div className="asst-drop-glyph">
            <Icon name="upload" size={26}/>
          </div>
          <div className="asst-drop-copy">
            <h3>{over ? 'Release to index' : 'Drop a folder to instantly index'}</h3>
            <p>Or press <kbd>⌘ I</kbd> to pick from disk · supports .md, .pdf, .ts, .py, .docx, .txt, code, and 40+ formats</p>
          </div>
        </div>

        {/* Create form */}
        {creating && (
          <div className="asst-form-card">
            <div className="asst-form-header">
              <p className="asst-form-title">New assistant</p>
              <button className="act-btn" onClick={() => { setCreating(false); setFormError(''); }}>
                <Icon name="x" size={14}/>
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
              <p className="form-error"><Icon name="warning" size={14}/> {formError}</p>
            )}
            <div className="form-actions">
              <button className="btn-block outline" onClick={() => { setCreating(false); setFormError(''); }}>Cancel</button>
              <button className="btn-block accent" disabled={saving} onClick={handleCreate}>
                {saving ? 'Creating…' : 'Create assistant'}
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {assistants.length === 0 && !creating && (
          <div className="assistants-empty">
            <div className="asst-mark"><Icon name="bot" size={28}/></div>
            <h3>No assistants yet</h3>
            <p>Create one, point it at a local codebase, and index it. Every conversation will get relevant code snippets injected as context automatically.</p>
            <button className="btn-block accent" onClick={() => setCreating(true)}>
              <Icon name="plus" size={14}/> New assistant
            </button>
          </div>
        )}

        {/* Grid */}
        {assistants.length > 0 && (
          <div className="asst-grid">
            {assistants.map((assistant, i) => (
              <div key={assistant.id} className="asst-card" style={{ animation: `msgIn .35s ${i * 50}ms backwards` }}>
                <div className="asst-card-top">
                  <div className="asst-mark"><Icon name="code" size={18}/></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
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
                        <Icon name="edit" size={11}/>
                      </button>
                    )}
                    {assistant.description && (
                      <p className="asst-card-desc">{assistant.description}</p>
                    )}
                  </div>
                  <StatusBadge status={assistant.index_status}/>
                </div>

                {/* Path / edit */}
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
                      <button className="btn-block outline" style={{ fontSize: '0.75rem', padding: '4px 12px' }} onClick={() => setEditingId(null)}>Cancel</button>
                      <button className="btn-block accent" style={{ fontSize: '0.75rem', padding: '4px 12px' }} disabled={editSaving} onClick={() => handleEditSave(assistant.id)}>
                        {editSaving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="asst-path">
                    <Icon name="folder" size={11}/>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assistant.codebase_path}</span>
                    <button className="act-btn" style={{ marginLeft: 'auto', flexShrink: 0 }} onClick={() => handleEditStart(assistant)} title="Edit path">
                      <Icon name="edit" size={11}/>
                    </button>
                  </div>
                )}

                {/* Stats */}
                {assistant.index_status === 'ready' && (
                  <div className="asst-stats">
                    <div><span className="v">{(assistant.indexed_files || 0).toLocaleString()}</span> files</div>
                    <div><span className="v">{(assistant.total_chunks || 0).toLocaleString()}</span> chunks</div>
                    {assistant.last_indexed && (
                      <div><span className="v">{formatDate(assistant.last_indexed)}</span></div>
                    )}
                  </div>
                )}

                {/* Progress */}
                {assistant.index_status === 'indexing' && (
                  <>
                    <div className="asst-stats">
                      <div><span className="v">{assistant.indexed_files || 0}</span> / {assistant.total_files || '?'} files</div>
                      <div><span className="v">{assistant.total_chunks || 0}</span> chunks</div>
                      <div><span className="v">{Math.floor(assistant.index_percent || 0)}%</span> indexed</div>
                    </div>
                    <div className="asst-progress-track">
                      <div className="asst-progress-fill" style={{ width: `${assistant.index_percent ?? 0}%` }}/>
                    </div>
                  </>
                )}

                {/* Footer */}
                <div className="asst-card-foot">
                  <div className="asst-actions">
                    <button
                      className="act-btn"
                      title={assistant.index_status === 'not_indexed' ? 'Index' : 'Re-index'}
                      disabled={assistant.index_status === 'indexing'}
                      onClick={() => handleIndex(assistant.id, false)}
                    >
                      <Icon name="refresh" size={11}/>
                    </button>
                    {assistant.index_status !== 'not_indexed' && (
                      <button
                        className="act-btn"
                        title="Full reset (wipe + re-embed)"
                        disabled={assistant.index_status === 'indexing'}
                        onClick={() => handleIndex(assistant.id, true)}
                      >
                        <Icon name="cube" size={11}/>
                      </button>
                    )}
                    <button className="act-btn" onClick={() => handleEditStart(assistant)} title="Edit">
                      <Icon name="settings" size={11}/>
                    </button>

                    {deleteConfirmId === assistant.id ? (
                      <span className="asst-confirm-bar">
                        <span>Delete?</span>
                        <button className="act-btn danger" onClick={() => handleDelete(assistant.id)}>Yes</button>
                        <button className="act-btn" onClick={() => setDeleteConfirmId(null)}>No</button>
                      </span>
                    ) : (
                      <button className="act-btn danger" onClick={() => handleDelete(assistant.id)} title="Delete">
                        <Icon name="trash" size={11}/>
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {onQuickChat && (
                      <button
                        className="act-btn primary"
                        disabled={assistant.index_status !== 'ready'}
                        onClick={() => onQuickChat(assistant)}
                        title="Quick chat"
                      >
                        <Icon name="chat" size={11}/>
                      </button>
                    )}
                    <button
                      className="act-btn primary"
                      disabled={assistant.index_status !== 'ready'}
                      onClick={() => onOpenChat && onOpenChat(assistant)}
                      title="Open full chat"
                    >
                      Open
                    </button>
                  </div>
                </div>

                {cardErrors[assistant.id] && (
                  <p className="asst-card-error">
                    <Icon name="warning" size={13}/> {cardErrors[assistant.id]}
                    <button className="act-btn" style={{ marginLeft: 'auto' }} onClick={() => clearCardError(assistant.id)}>
                      <Icon name="x" size={11}/>
                    </button>
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* How it works */}
        <div className="asst-explainer">
          <span className="eyebrow">How it works</span>
          <div className="explainer-steps">
            <div className="explainer-step">
              <span className="explainer-num">1</span>
              <div>
                <strong>Index</strong>
                <p>The backend walks your directory, splits each file into overlapping chunks, and converts every chunk into an embedding vector using <code>nomic-embed-text</code> via Ollama. Vectors are stored in ChromaDB on disk.</p>
              </div>
            </div>
            <div className="explainer-step">
              <span className="explainer-num">2</span>
              <div>
                <strong>Retrieve</strong>
                <p>When you ask a question, your query is embedded with the same model. ChromaDB finds the 5 most semantically relevant code chunks using cosine similarity.</p>
              </div>
            </div>
            <div className="explainer-step">
              <span className="explainer-num">3</span>
              <div>
                <strong>Generate</strong>
                <p>Those chunks are injected as a system message before your question reaches the LLM. The model answers based on your actual code — not guesswork.</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
