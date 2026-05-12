import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  createConversation,
  deleteConversation,
  fetchConversation,
  fetchConversations,
  fetchModels,
  fetchStatus,
  renameConversation,
  sendMessageStream,
} from './api';
import AssistantsPage from './AssistantsPage';
import './index.scss';

const API_BASE = '/api';
const THEME_KEY = 'hm.theme';

const DEFAULT_SETTINGS = { temperature: 0.7, topK: 8, maxTokens: 2048 };

const SAMPLE_PROMPTS = [
  { icon: 'code',      text: 'Refactor this function and explain why' },
  { icon: 'book',      text: 'Summarize the docs in 5 bullets' },
  { icon: 'brain',     text: 'Compare these two approaches for me' },
  { icon: 'folder',    text: 'Find all TODOs tagged @urgent' },
  { icon: 'sparkles',  text: 'Write unit tests for this module' },
  { icon: 'flask',     text: 'Debug why this test is failing' },
  { icon: 'chip',      text: 'Explain how this algorithm works' },
  { icon: 'code',      text: 'Review my PR for issues' },
];

const SAMPLE_REASONING = [
  'Identifying user intent from the message.',
  'Searching retrieved context for relevant chunks.',
  'Cross-referencing with session history.',
  'Selecting most relevant source spans.',
  'Constructing grounded response outline.',
  'Verifying code against type definitions.',
];

const SAMPLE_CHUNKS = [
  { id: 1, file: 'src/auth/middleware.ts', line: 'L42-78', score: 0.91 },
  { id: 2, file: 'src/auth/session.ts',    line: 'L12-44', score: 0.78 },
  { id: 3, file: 'src/auth/types.ts',      line: 'L8-22',  score: 0.71 },
  { id: 4, file: 'tests/auth.spec.ts',     line: 'L120-156', score: 0.62 },
];

const MULTIMODAL_RE = /llava|moondream|bakllava|minicpm.?v|cogvlm|internvl|phi.*vision|vision|gemma4|nemotron3/i;

// ─── Icon component ──────────────────────────────────────────────────────────

function Icon({ name, size = 16, stroke = 1.5 }) {
  const c = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    search:    <><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></>,
    plus:      <path d="M12 5v14M5 12h14"/>,
    chat:      <path d="M21 12a8 8 0 0 1-11.7 7.1L4 21l1.9-5.3A8 8 0 1 1 21 12z"/>,
    bot:       <><rect x="4" y="7" width="16" height="13" rx="2"/><path d="M12 3v4M8 14h.01M16 14h.01M9 18h6"/></>,
    copy:      <><rect x="8" y="8" width="12" height="12" rx="1"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/></>,
    folder:    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>,
    settings:  <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></>,
    sun:       <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></>,
    moon:      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>,
    send:      <><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4z"/></>,
    paperclip: <path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 1 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8L14.2 7"/>,
    mic:       <><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M19 11a7 7 0 0 1-14 0M12 18v3"/></>,
    sparkles:  <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></>,
    brain:     <><path d="M12 4a3 3 0 0 0-6 0 3 3 0 0 0-3 3v2a3 3 0 0 0 1 2.2A3 3 0 0 0 4 14v2a3 3 0 0 0 3 3 3 3 0 0 0 5 1 3 3 0 0 0 5-1 3 3 0 0 0 3-3v-2a3 3 0 0 0 0-2.8A3 3 0 0 0 21 9V7a3 3 0 0 0-3-3 3 3 0 0 0-6 0z"/><path d="M12 4v16"/></>,
    book:      <><path d="M4 4a2 2 0 0 1 2-2h12v18H6a2 2 0 0 0-2 2zM4 4v16"/></>,
    code:      <path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>,
    chip:      <><rect x="5" y="5" width="14" height="14" rx="1"/><rect x="8" y="8" width="8" height="8"/><path d="M3 9h2M3 12h2M3 15h2M19 9h2M19 12h2M19 15h2M9 3v2M12 3v2M15 3v2M9 19v2M12 19v2M15 19v2"/></>,
    panel:     <><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18"/></>,
    x:         <path d="M18 6 6 18M6 6l12 12"/>,
    flask:     <><path d="M9 3h6v5l4 9a3 3 0 0 1-3 4H8a3 3 0 0 1-3-4l4-9z"/><path d="M9 11h6"/></>,
    chevron:   <path d="m9 18 6-6-6-6"/>,
    arrow:     <><path d="M5 12h14M13 5l7 7-7 7"/></>,
    check:     <path d="m5 12 5 5L20 7"/>,
    history:   <><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/></>,
    upload:    <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 9l5-5 5 5M12 4v12"/></>,
    cube:      <><path d="m12 2 9 5v10l-9 5-9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/></>,
    refresh:   <><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></>,
    trash:     <><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></>,
    attach:    <path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 1 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8L14.2 7"/>,
    warning:   <><path d="M10.3 3.3 1.6 18a2 2 0 0 0 1.7 3h17.4a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></>,
    edit:      <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/></>,
    user:      <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  };
  return <svg {...c}>{paths[name] ?? null}</svg>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getErr(e, fallback) { return e instanceof Error ? e.message : fallback; }
function isMultimodal(n) { return MULTIMODAL_RE.test(n || ''); }

function formatTime(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const delta = Date.now() - d.getTime();
  if (delta < 60_000) return 'now';
  if (delta < 3_600_000) return `${Math.max(1, Math.floor(delta / 60_000))}m`;
  if (delta < 86_400_000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function convTitle(c) { return c.title?.trim() || 'New chat'; }

function groupByDate(convs) {
  const now = Date.now();
  const g = { Today: [], Yesterday: [], Earlier: [] };
  convs.forEach(c => {
    const d = now - new Date(c.updated_at || 0).getTime();
    if (d < 86_400_000) g.Today.push(c);
    else if (d < 172_800_000) g.Yesterday.push(c);
    else g.Earlier.push(c);
  });
  return g;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    r.readAsDataURL(file);
  });
}

// ─── Per-word token stream (fade-in each word as it arrives) ─────────────────

function useTokenStream(text, speed = 38, active = true) {
  const tokens = useMemo(() => {
    if (!text) return [];
    return text.match(/```[\s\S]*?```|`[^`]+`|\*\*[^*]+\*\*|\s+|[^\s`*]+/g) || [];
  }, [text]);
  const [n, setN] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!active) { setN(tokens.length); setDone(true); return; }
    setN(0); setDone(false);
    let i = 0;
    const id = setInterval(() => {
      i++;
      if (i >= tokens.length) { setN(tokens.length); setDone(true); clearInterval(id); }
      else setN(i);
    }, speed);
    return () => clearInterval(id);
  }, [tokens, speed, active]);
  return { tokens, n, done };
}

function StreamedContent({ tokens, n }) {
  const visible = tokens.slice(0, n).join('');
  const segs = renderMd(visible);

  const wrapText = (node, keyBase) => {
    if (typeof node === 'string') {
      return node.split(/(\s+)/).map((p, i) => {
        if (/^\s+$/.test(p)) return p;
        if (p === '') return null;
        return <span key={`${keyBase}-${i}`} className="tok">{p}</span>;
      });
    }
    if (Array.isArray(node)) return node.map((c, i) => wrapText(c, `${keyBase}-${i}`));
    if (node && node.props) {
      if (node.type === 'pre' || (node.props.className && node.props.className.includes('md-code-block'))) {
        return { ...node, props: { ...node.props, className: (node.props.className || '') + ' tok-block' } };
      }
      const wrapped = wrapText(node.props.children, `${keyBase}c`);
      return { ...node, props: { ...node.props, children: wrapped } };
    }
    return node;
  };

  return <>{segs.map((s, i) => wrapText(s, `s${i}`))}</>;
}

// ─── Enhanced Markdown renderer ──────────────────────────────────────────────

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="md-code-block">
      <div className="md-code-head">
        <span className="md-code-lang">{lang || 'code'}</span>
        <button className="md-copy-btn" onClick={copy}>
          <Icon name={copied ? 'check' : 'copy'} size={11}/>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre><code>{code.trimEnd()}</code></pre>
    </div>
  );
}

function renderInline(text) {
  const re = /(`[^`\n]+`)|(\*\*([^*\n]+)\*\*)|(\*([^*\n]+)\*)|(_([^_\n]+)_)|(\[([^\]]+)\]\(([^)]+)\))/g;
  const nodes = [];
  let last = 0, m, k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1]) nodes.push(<code key={k++} className="md-ic">{m[1].slice(1, -1)}</code>);
    else if (m[2]) nodes.push(<strong key={k++}>{m[3]}</strong>);
    else if (m[4]) nodes.push(<em key={k++}>{m[5]}</em>);
    else if (m[6]) nodes.push(<em key={k++}>{m[7]}</em>);
    else if (m[8]) nodes.push(<a key={k++} href={m[10]} target="_blank" rel="noopener noreferrer">{m[9]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function renderParaBlock(text, key) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Heading
  const hm = trimmed.match(/^(#{1,3})\s+(.+)$/);
  if (hm) {
    const Tag = hm[1].length === 1 ? 'h3' : hm[1].length === 2 ? 'h4' : 'h5';
    return <Tag key={key} className={`md-h md-h${hm[1].length}`}>{renderInline(hm[2])}</Tag>;
  }

  // HR
  if (/^[-*_]{3,}$/.test(trimmed)) return <hr key={key} className="md-hr" />;

  const lines = trimmed.split('\n');

  // Blockquote
  if (lines.every(l => /^>\s?/.test(l) || l.trim() === '')) {
    const inner = lines.map(l => l.replace(/^>\s?/, '')).join('\n');
    return <blockquote key={key} className="md-bq">{renderInline(inner)}</blockquote>;
  }

  // Unordered list
  if (lines.every(l => /^[-*+]\s/.test(l.trim()) || l.trim() === '')) {
    return (
      <ul key={key} className="md-ul">
        {lines.filter(l => /^[-*+]\s/.test(l.trim())).map((l, i) => (
          <li key={i}>{renderInline(l.trim().replace(/^[-*+]\s/, ''))}</li>
        ))}
      </ul>
    );
  }

  // Ordered list
  if (lines.every(l => /^\d+\.\s/.test(l.trim()) || l.trim() === '')) {
    return (
      <ol key={key} className="md-ol">
        {lines.filter(l => /^\d+\.\s/.test(l.trim())).map((l, i) => (
          <li key={i}>{renderInline(l.trim().replace(/^\d+\.\s+/, ''))}</li>
        ))}
      </ol>
    );
  }

  // Paragraph — single newlines → <br>
  const inlines = lines.flatMap((l, i) =>
    i < lines.length - 1 ? [...renderInline(l), <br key={`br${i}`} />] : renderInline(l)
  );
  return <p key={key} className="md-p">{inlines}</p>;
}

function renderMd(text) {
  const nodes = [];
  const fenceRe = /```(\w*)\n([\s\S]*?)```/g;
  let last = 0, m, ki = 0;
  while ((m = fenceRe.exec(text)) !== null) {
    if (m.index > last) {
      text.slice(last, m.index).split(/\n{2,}/).forEach(b => {
        const n = renderParaBlock(b, ki++);
        if (n) nodes.push(n);
      });
    }
    nodes.push(<CodeBlock key={ki++} lang={m[1]} code={m[2]} />);
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    text.slice(last).split(/\n{2,}/).forEach(b => {
      const n = renderParaBlock(b, ki++);
      if (n) nodes.push(n);
    });
  }
  return nodes;
}

// ─── RAG panel ───────────────────────────────────────────────────────────────

function RagPanel({ chunks = SAMPLE_CHUNKS }) {
  return (
    <div className="rag-panel">
      <div className="rag-panel-head">
        <span>RAG · retrieval</span>
        <span className="right">
          <span className="dot" />
          {chunks.length} chunks · 318 ms
        </span>
      </div>
      <div className="rag-stages-mini">
        {[
          { lab: '01 EMBED',  val: 'text-embed-3' },
          { lab: '02 SEARCH', val: 'cosine · top-k 8' },
          { lab: '03 RERANK', val: `${chunks.length} / 8 retained` },
          { lab: '04 SYNTH',  val: 'context 2,140 tok' },
        ].map((s, i) => (
          <div key={i} className="rag-stage-mini">
            <div className="lab"><span className="step-dot" />{s.lab}</div>
            <div className="val">{s.val}</div>
            <div className="progress" />
          </div>
        ))}
      </div>
      <div className="rag-sources">
        <div className="rag-sources-label">Sources · ranked by relevance</div>
        <div className="rag-chunks">
          {chunks.map(c => (
            <span key={c.id} className="rag-chunk">
              <Icon name="code" size={11} />
              <span>{c.file}</span>
              <span style={{ color: 'var(--faint)' }}>{c.line}</span>
              <span className="score">{c.score.toFixed(2)}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Reasoning trace ─────────────────────────────────────────────────────────

function ReasoningTrace({ steps = SAMPLE_REASONING }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`reasoning ${open ? 'open' : ''}`}>
      <div className="reasoning-head" onClick={() => setOpen(o => !o)}>
        <span><Icon name="brain" size={11} /> &nbsp;Reasoning trace · {steps.length} steps</span>
        <span className="glyph"><Icon name="chevron" size={12} /></span>
      </div>
      <div className="reasoning-body">
        {steps.map((line, i) => <div key={i} className="step">{line}</div>)}
      </div>
    </div>
  );
}

// ─── Message components ───────────────────────────────────────────────────────

function UserMessage({ text, images, when }) {
  return (
    <div className="msg">
      <div className="avatar user" aria-label="You"><Icon name="user" size={18} stroke={1.6}/></div>
      <div className="msg-body">
        <div className="msg-head">
          <span className="who">You</span>
          <span className="when">{when || 'now'}</span>
        </div>
        {images?.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {images.map((src, i) => (
              <img key={i} src={src} alt="" style={{ maxWidth: 200, maxHeight: 160, border: '1.5px solid var(--line)', objectFit: 'cover' }} />
            ))}
          </div>
        )}
        <div className="msg-content">{text}</div>
      </div>
    </div>
  );
}

function AIMessage({ content, model, isStreaming, showRag, animate }) {
  const showTyping = isStreaming && !content;
  const { tokens, n, done } = useTokenStream(content || '', 38, animate && !!content);

  return (
    <div className="msg">
      <div className="avatar ai" aria-label="HiveMind">
        <img src="/icon.png" alt="" />
      </div>
      <div className="msg-body">
        <div className="msg-head">
          <span className="who ai">HiveMind</span>
          {model && <span className="model-tag">{model}</span>}
          <span className="when">just now</span>
        </div>

        {showRag && <RagPanel />}

        <div className="md-content">
          {showTyping ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              <span className="cursor" style={{ height: 14, width: 6 }} />
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--faint)', letterSpacing: '0.1em' }}>thinking…</span>
            </div>
          ) : animate ? (
            <>
              <StreamedContent tokens={tokens} n={n} />
              {!done && <span className="cursor" />}
            </>
          ) : (
            renderMd(content || '')
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onPrompt, status, modelName, convCount }) {
  return (
    <div className="empty">
      <div className="empty-mark">
        <div className="ring" />
        <img src="/icon.png" alt="HiveMind" />
      </div>
      <h2>What's on your mind?</h2>
      <p>HiveMind runs entirely on your machine. Your conversations never leave your device.
        {modelName && <> <strong>{modelName}</strong> loaded.</>}
        {convCount > 0 && <> {convCount} saved chats.</>}
      </p>
      <div className="prompt-grid">
        {SAMPLE_PROMPTS.map((p, i) => (
          <button
            key={i}
            className="prompt-chip"
            style={{ animationDelay: `${i * 60}ms` }}
            onClick={() => onPrompt?.(p.text)}
          >
            <Icon name={p.icon} size={14} />
            <span style={{ flex: 1 }}>{p.text}</span>
            <span className="arrow"><Icon name="arrow" size={14} /></span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Composer ─────────────────────────────────────────────────────────────────

function Composer({ onSend, ragOn, setRagOn, asstName, disabled, attachedImages, onAttach, onRemoveImage, canAttach }) {
  const [v, setV] = useState('');
  const ref = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = Math.min(ref.current.scrollHeight, 200) + 'px';
  }, [v]);

  const send = () => {
    if (!v.trim() || disabled) return;
    onSend(v.trim());
    setV('');
  };

  return (
    <div className="composer-wrap">
      <div className="composer">
        {attachedImages?.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 14px 0' }}>
            {attachedImages.map(img => (
              <div key={img.id} style={{ position: 'relative' }}>
                <img src={img.dataUrl} alt="" style={{ width: 56, height: 56, objectFit: 'cover', border: '1.5px solid var(--line)', display: 'block' }} />
                <button
                  onClick={() => onRemoveImage(img.id)}
                  style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: 'var(--ink)', color: 'var(--bg)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
                >
                  <Icon name="x" size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={ref}
          rows={1}
          value={v}
          onChange={e => setV(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={asstName ? `Ask anything about ${asstName}…` : 'Message HiveMind — stays on your machine'}
          disabled={disabled}
        />

        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={async e => {
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          if (!files.length) return;
          const urls = await Promise.all(files.map(readFileAsDataUrl));
          onAttach?.(urls.map((dataUrl, i) => ({ id: `img-${Date.now()}-${i}`, dataUrl, base64: dataUrl.split(',')[1] })));
        }} />

        <div className="composer-bar">
          <div className="composer-tools">
            <button
              className={`cm-tool ${ragOn ? 'on' : ''}`}
              title="Toggle RAG retrieval"
              onClick={() => setRagOn?.(!ragOn)}
            >
              <Icon name="book" size={14} />
            </button>
            <button
              className="cm-tool"
              title={canAttach ? 'Attach image' : 'Select a vision model to attach images'}
              disabled={!canAttach}
              onClick={() => canAttach && fileRef.current?.click()}
              style={{ opacity: canAttach ? 1 : 0.4 }}
            >
              <Icon name="paperclip" size={14} />
            </button>
            <button className="cm-tool" title="Voice input (coming soon)" disabled style={{ opacity: 0.35 }}>
              <Icon name="mic" size={14} />
            </button>
            <button className="cm-tool" title="Prompt library">
              <Icon name="sparkles" size={14} />
            </button>
          </div>
          <button className="send-btn" disabled={!v.trim() || disabled} onClick={send}>
            <Icon name="send" size={13} />
            <span>{disabled ? 'Sending' : 'Send'}</span>
            <span className="kbd">⏎</span>
          </button>
        </div>
      </div>
      <div className="composer-hint">
        Everything you type stays local · {ragOn ? 'RAG on' : 'RAG off'} · Enter to send · Shift+Enter for newline
      </div>
    </div>
  );
}

// ─── Model select ─────────────────────────────────────────────────────────────

function ModelSelect({ value, models, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="model-select" onClick={() => setOpen(o => !o)}>
        <span className="orb" />
        <span>{value || 'Select model'}</span>
        <Icon name="chevron" size={11} />
      </button>
      {open && (
        <div className="dropdown" onMouseLeave={() => setOpen(false)}>
          {models.length === 0 && (
            <div className="dropdown-item" style={{ opacity: 0.5 }}>No models loaded</div>
          )}
          {models.map(m => (
            <div
              key={m.name}
              className={`dropdown-item ${m.name === value ? 'sel' : ''}`}
              onClick={() => { onChange(m.name); setOpen(false); }}
            >
              <div>
                <div style={{ fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{m.name}</div>
                <div className="meta">{m.parameter_size || 'local'}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Settings popover ─────────────────────────────────────────────────────────

function SettingsPopover({ open, settings, onChange }) {
  if (!open) return null;
  return (
    <div className="settings-popover" onClick={e => e.stopPropagation()}>
      <h4>Inference</h4>
      <div className="setting-row">
        <label><span>Temperature</span><span className="val">{settings.temperature.toFixed(2)}</span></label>
        <input type="range" min="0" max="2" step="0.05" value={settings.temperature}
          onChange={e => onChange({ ...settings, temperature: +e.target.value })} />
      </div>
      <div className="setting-row">
        <label><span>Top-K retrieval</span><span className="val">{settings.topK}</span></label>
        <input type="range" min="1" max="20" step="1" value={settings.topK}
          onChange={e => onChange({ ...settings, topK: +e.target.value })} />
      </div>
      <div className="setting-row">
        <label><span>Max tokens</span><span className="val">{settings.maxTokens}</span></label>
        <input type="range" min="256" max="8192" step="128" value={settings.maxTokens}
          onChange={e => onChange({ ...settings, maxTokens: +e.target.value })} />
      </div>
      <h4>Privacy</h4>
      <div className="setting-row">
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
          <span>Telemetry</span>
          <span style={{ color: 'var(--ok)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>● OFF</span>
        </label>
      </div>
      <div className="setting-row">
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
          <span>Network calls</span>
          <span style={{ color: 'var(--ok)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>● BLOCKED</span>
        </label>
      </div>
    </div>
  );
}

// ─── Quick Chat Drawer ────────────────────────────────────────────────────────

function QuickDrawer({ open, onClose, selectedModel, settings }) {
  const [v, setV] = useState('');
  const [msgs, setMsgs] = useState([
    { id: 0, role: 'ai', text: "Hey — this is a scratch pad. Nothing here is saved. What's up?" },
  ]);
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const send = async () => {
    const text = v.trim();
    if (!text || sending) return;
    setSending(true);
    setV('');
    const userMsg = { id: Date.now(), role: 'user', text };
    const aiMsg = { id: Date.now() + 1, role: 'ai', text: '' };
    setMsgs(m => [...m, userMsg, aiMsg]);

    try {
      const conv = await createConversation(API_BASE, { title: text.slice(0, 40), model: selectedModel, temperature: settings.temperature, top_p: 0.9, max_tokens: settings.maxTokens });
      const stream = await sendMessageStream(API_BASE, { conversation_id: conv.id, message: text, model: selectedModel, temperature: settings.temperature, top_p: 0.9, max_tokens: settings.maxTokens });
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buf = '', content = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split('\n\n');
        buf = frames.pop() || '';
        for (const frame of frames) {
          const line = frame.split('\n').find(l => l.startsWith('data: '));
          if (!line) continue;
          try {
            const p = JSON.parse(line.slice(6));
            if (p.content) { content += p.content; setMsgs(m => { const n = [...m]; const i = n.findIndex(x => x.id === aiMsg.id); if (i !== -1) n[i] = { ...n[i], text: content }; return n; }); }
          } catch { continue; }
        }
      }
    } catch (e) {
      setMsgs(m => { const n = [...m]; const i = n.findIndex(x => x.id === aiMsg.id); if (i !== -1) n[i] = { ...n[i], text: `Error: ${e.message}` }; return n; });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`drawer ${open ? 'open' : ''}`}>
      <div className="drawer-head">
        <div className="drawer-head-info">
          <div className="drawer-head-mark"><Icon name="sparkles" size={14} /></div>
          <div>
            <h4>Quick Chat</h4>
            <span className="eyebrow">no context · ephemeral</span>
          </div>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="x" size={16} /></button>
      </div>
      <div className="drawer-body">
        {msgs.map(m => (
          <div key={m.id} className="msg">
            <div className={`avatar ${m.role}`}>{m.role === 'user' ? 'YOU' : 'AI'}</div>
            <div className="msg-body">
              <div className="msg-head">
                <span className={`who ${m.role === 'ai' ? 'ai' : ''}`}>{m.role === 'user' ? 'You' : 'HiveMind'}</span>
              </div>
              <div className="msg-content">{m.text}{sending && m.role === 'ai' && !m.text && <span className="cursor" />}</div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="drawer-composer">
        <input
          value={v}
          onChange={e => setV(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send(); }}
          placeholder="Quick question…"
          disabled={sending}
        />
        <button className="send-btn" onClick={send} disabled={!v.trim() || sending}>
          <Icon name="send" size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ view, setView, activeId, setActiveId, conversations, onNew, onDelete, onConfig, status, statusDetail }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    return t ? conversations.filter(c => convTitle(c).toLowerCase().includes(t)) : conversations;
  }, [conversations, search]);

  const pinned = filtered.filter(c => c.pinned);
  const others = filtered.filter(c => !c.pinned);
  const groups = groupByDate(others);

  const statusLabel = status === 'ok' ? 'running' : status === 'warn' ? 'limited' : 'offline';

  return (
    <aside className="sidebar">
      <div className="sb-top">
        <div className="sb-brand">
          <div className="sb-brand-mark">
            <img src="/icon.png" alt="HiveMind" />
          </div>
          <div>
            <div className="sb-brand-text">Hive<span className="ac">Mind</span></div>
            <span className="sb-brand-tag">PRIVATE · LOCAL · YOURS</span>
          </div>
        </div>

        <button className="sb-new-chat" onClick={onNew}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="plus" size={13} /> New chat
          </span>
          <span className="kbd">⌘ N</span>
        </button>

        <div className="sb-search">
          <span className="sb-search-icon"><Icon name="search" size={13} /></span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations…" />
        </div>
      </div>

      <div className="sb-tabs">
        <button className={`sb-tab ${view === 'chat' ? 'active' : ''}`} onClick={() => setView('chat')}>
          <Icon name="chat" size={13} /> Chats
        </button>
        <button className={`sb-tab ${view === 'assistants' ? 'active' : ''}`} onClick={() => setView('assistants')}>
          <Icon name="cube" size={13} /> Assistants
        </button>
      </div>

      <div className="sb-list">
        {filtered.length === 0 && (
          <div style={{ padding: '24px 12px', textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--faint)' }}>
            No conversations yet
          </div>
        )}

        {pinned.length > 0 && (
          <>
            <div className="sb-group-label"><span>Pinned</span><span>{pinned.length}</span></div>
            {pinned.map(c => (
              <ConvItem key={c.id} conv={c} active={c.id === activeId}
                onSelect={() => { setActiveId(c.id); setView('chat'); }}
                onDelete={onDelete} />
            ))}
          </>
        )}

        {Object.entries(groups).map(([label, convs]) => {
          if (!convs.length) return null;
          return (
            <div key={label}>
              <div className="sb-group-label"><span>{label}</span><span>{convs.length}</span></div>
              {convs.map(c => (
                <ConvItem key={c.id} conv={c} active={c.id === activeId}
                  onSelect={() => { setActiveId(c.id); setView('chat'); }}
                  onDelete={onDelete} />
              ))}
            </div>
          );
        })}
      </div>

      <div className="sb-foot">
        <div className="sb-status">
          <span className="dot" />
          <span>ollama · <span className="name">{statusLabel}</span></span>
          <span style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>{status === 'ok' ? '●' : '○'}</span>
        </div>
        <div className="sb-foot-row">
          <button onClick={() => setView('chat')} title="Show all chats">
            <Icon name="history" size={11} /> HISTORY
          </button>
          <button onClick={onConfig} title="Settings (⌘,)">
            <Icon name="settings" size={11} /> CONFIG
          </button>
        </div>
      </div>
    </aside>
  );
}

function ConvItem({ conv, active, onSelect, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    if (confirmDelete) {
      onDelete?.(conv.id);
    } else {
      setConfirmDelete(true);
    }
  };

  const handleCancelDelete = (e) => {
    e.stopPropagation();
    setConfirmDelete(false);
  };

  return (
    <div
      className={`conv ${active ? 'active' : ''} ${confirmDelete ? 'confirm-del' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelect()}
      onMouseLeave={() => setConfirmDelete(false)}
    >
      <div className="conv-tick" />
      <div className="conv-body">
        <div className="conv-title">{convTitle(conv)}</div>
        <div className="conv-meta">
          <span>{formatTime(conv.updated_at)}</span>
          {conv.assistant_name && <span className="conv-tag">{conv.assistant_name}</span>}
        </div>
      </div>
      {confirmDelete ? (
        <div className="conv-del-confirm" onClick={e => e.stopPropagation()}>
          <button className="conv-del-yes" onClick={handleDeleteClick} title="Confirm delete">
            <Icon name="check" size={10} />
          </button>
          <button className="conv-del-no" onClick={handleCancelDelete} title="Cancel">
            <Icon name="x" size={10} />
          </button>
        </div>
      ) : (
        <button className="conv-del-btn" onClick={handleDeleteClick} title="Delete conversation">
          <Icon name="trash" size={11} />
        </button>
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'dark');
  const [view, setView] = useState('chat');
  const [activeConvId, setActiveConvId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [models, setModels] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [status, setStatus] = useState('loading');
  const [statusDetail, setStatusDetail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ragOn, setRagOn] = useState(true);
  const [attachedImages, setAttachedImages] = useState([]);
  const [pendingAssistant, setPendingAssistant] = useState(null);
  const [settings, setSettings] = useState(() => {
    try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('hm.settings') || '{}') }; }
    catch { return DEFAULT_SETTINGS; }
  });

  const messagesEndRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ms, cs, st] = await Promise.all([
          fetchModels(API_BASE),
          fetchConversations(API_BASE),
          fetchStatus(API_BASE),
        ]);
        if (cancelled) return;
        const available = ms.models || [];
        setModels(available);
        setConversations(cs || []);
        const ollama = st.ollama || 'error';
        setStatus(ollama === 'ok' ? 'ok' : ollama === 'no_models' ? 'warn' : 'error');
        setStatusDetail(ollama === 'ok' ? 'Backend and Ollama are ready' : 'Ollama unavailable');
        if (available.length && !selectedModel) setSelectedModel(available[0].name);
      } catch (e) {
        if (cancelled) return;
        setStatus('error'); setStatusDetail('Unable to reach backend');
        setError(getErr(e, 'Unable to load app data'));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  useEffect(() => {
    const handler = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') { e.preventDefault(); newChat(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setDrawerOpen(d => !d); }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') { e.preventDefault(); setSettingsOpen(s => !s); }
      if (e.key === 'Escape') { setSettingsOpen(false); setDrawerOpen(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const activeConv = useMemo(() => conversations.find(c => c.id === activeConvId) || null, [conversations, activeConvId]);
  const modelSummary = useMemo(() => models.find(m => m.name === selectedModel) || models[0] || null, [models, selectedModel]);

  const newChat = () => {
    setActiveConvId(null);
    setMessages([]);
    setError('');
    setAttachedImages([]);
    setPendingAssistant(null);
    setView('chat');
  };

  const selectConv = async id => {
    setActiveConvId(id);
    setError('');
    setView('chat');
    try {
      const detail = await fetchConversation(API_BASE, id);
      setMessages(detail.messages || []);
    } catch (e) {
      setError(getErr(e, 'Could not load conversation'));
    }
  };

  const handleDeleteConv = async (id) => {
    try {
      await deleteConversation(API_BASE, id);
      setConversations(cs => cs.filter(c => c.id !== id));
      if (activeConvId === id) newChat();
    } catch (e) {
      setError(getErr(e, 'Could not delete conversation'));
    }
  };

  const handleSend = async text => {
    if (!text || sending) return;
    setSending(true);
    setError('');
    setSettingsOpen(false);

    const imgs = [...attachedImages];
    setAttachedImages([]);

    const userMsg = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: text,
      images: imgs.map(i => i.dataUrl),
      created_at: new Date().toISOString(),
    };
    const aiSeed = { id: 'streaming', role: 'assistant', content: '', created_at: new Date().toISOString() };
    setMessages(m => [...m, userMsg, aiSeed]);

    let convId = activeConvId;
    const assistantId = activeConv?.assistant_id || pendingAssistant?.id || null;
    const assistantName = activeConv?.assistant_name || pendingAssistant?.name || null;

    try {
      if (!convId) {
        const conv = await createConversation(API_BASE, {
          title: text.slice(0, 50),
          model: selectedModel,
          temperature: settings.temperature,
          top_p: 0.9,
          max_tokens: settings.maxTokens,
          ...(assistantId ? { assistant_id: assistantId, assistant_name: assistantName } : {}),
        });
        convId = conv.id;
        setActiveConvId(convId);
        setConversations(c => [conv, ...c.filter(x => x.id !== conv.id)]);
        setPendingAssistant(null);
      }

      const stream = await sendMessageStream(API_BASE, {
        conversation_id: convId,
        message: text,
        model: selectedModel,
        temperature: settings.temperature,
        top_p: 0.9,
        max_tokens: settings.maxTokens,
        ...(assistantId ? { assistant_id: assistantId } : {}),
        ...(imgs.length ? { images: imgs.map(i => i.base64) } : {}),
      });

      if (!stream) throw new Error('No stream');

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buf = '', content = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split('\n\n');
        buf = frames.pop() || '';
        for (const frame of frames) {
          const line = frame.split('\n').find(l => l.startsWith('data: '));
          if (!line) continue;
          try {
            const p = JSON.parse(line.slice(6));
            if (p.content) {
              content += p.content;
              setMessages(m => { const n = [...m]; const i = n.findIndex(x => x.id === 'streaming'); if (i !== -1) n[i] = { ...n[i], content }; return n; });
            }
          } catch { continue; }
        }
      }

      const [cs, detail] = await Promise.all([fetchConversations(API_BASE), fetchConversation(API_BASE, convId)]);
      setConversations(cs || []);
      setMessages(detail.messages || []);
      setActiveConvId(convId);
    } catch (e) {
      setError(getErr(e, 'Unable to send message'));
      setMessages(m => { const n = [...m]; const i = n.findIndex(x => x.id === 'streaming'); if (i !== -1) n[i] = { ...n[i], content: `Error: ${getErr(e, 'Unknown error')}` }; return n; });
    } finally {
      setSending(false);
    }
  };

  const asstName = activeConv?.assistant_name || pendingAssistant?.name || null;
  const eyebrow = view === 'assistants'
    ? 'RAG — ASSISTANTS'
    : asstName
      ? `${asstName} · CHAT`
      : 'CHAT';

  const headerTitle = view === 'assistants'
    ? 'Assistants'
    : activeConv
      ? convTitle(activeConv)
      : 'New conversation';

  return (
    <div className={`app ${collapsed ? 'no-sidebar' : ''}`} onClick={() => setSettingsOpen(false)}>
      <Sidebar
        view={view}
        setView={setView}
        activeId={activeConvId}
        setActiveId={id => selectConv(id)}
        conversations={conversations}
        onNew={newChat}
        onDelete={handleDeleteConv}
        onConfig={e => { e.stopPropagation(); setSettingsOpen(s => !s); }}
        status={status}
        statusDetail={statusDetail}
      />

      <main className="main">
        <header className="top">
          <div className="top-left">
            <button className="icon-btn framed" onClick={() => setCollapsed(c => !c)} title="Toggle sidebar">
              <Icon name="panel" size={15} />
            </button>
            <div className="top-title">
              <span className="eyebrow">{eyebrow}</span>
              <h2>{headerTitle}</h2>
            </div>
          </div>

          <div className="top-right">
            {view === 'chat' && (
              <ModelSelect value={selectedModel} models={models} onChange={m => {
                setSelectedModel(m);
                if (!isMultimodal(m)) setAttachedImages([]);
              }} />
            )}
            <button className="icon-btn framed" title="Quick chat (⌘K)" onClick={() => setDrawerOpen(true)}>
              <Icon name="sparkles" size={15} />
            </button>
            <button
              className="icon-btn framed"
              title="Settings (⌘,)"
              onClick={e => { e.stopPropagation(); setSettingsOpen(s => !s); }}
            >
              <Icon name="settings" size={15} />
            </button>
            <button className="icon-btn framed" title={theme === 'dark' ? 'Light mode' : 'Dark mode'} onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
            </button>

            <SettingsPopover
              open={settingsOpen}
              settings={settings}
              onChange={s => { setSettings(s); localStorage.setItem('hm.settings', JSON.stringify(s)); }}
            />
          </div>
        </header>

        {view === 'assistants' ? (
          <AssistantsPage
            onOpenChat={a => {
              setActiveConvId(null);
              setMessages([]);
              setError('');
              setAttachedImages([]);
              setPendingAssistant(a);
              setView('chat');
            }}
            onQuickChat={a => {
              setPendingAssistant(a);
              setDrawerOpen(true);
            }}
          />
        ) : (
          <div className="chat-area">
            <div className="messages">
              {error && (
                <div className="error-banner" style={{ maxWidth: 820, margin: '12px auto 0', padding: '0 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'color-mix(in srgb, var(--err) 8%, transparent)', border: '1.5px solid var(--err)', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--err)' }}>
                    <Icon name="warning" size={14} />
                    {error}
                  </div>
                </div>
              )}

              {messages.length === 0 ? (
                <EmptyState
                  onPrompt={handleSend}
                  status={status}
                  modelName={selectedModel}
                  convCount={conversations.length}
                />
              ) : (
                <div className="msg-wrap">
                  {messages.map((m, idx) =>
                    m.role === 'user' ? (
                      <UserMessage key={m.id} text={m.content} images={m.images} when={formatTime(m.created_at)} />
                    ) : (
                      <AIMessage
                        key={m.id}
                        content={m.content}
                        model={m.model || selectedModel}
                        isStreaming={sending && m.id === 'streaming'}
                        showRag={ragOn && !!activeConv?.assistant_id && idx === messages.length - 1}
                        animate={sending && m.id === 'streaming'}
                      />
                    )
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            <Composer
              onSend={handleSend}
              ragOn={ragOn}
              setRagOn={setRagOn}
              asstName={activeConv?.assistant_name || pendingAssistant?.name}
              disabled={sending}
              attachedImages={attachedImages}
              onAttach={imgs => setAttachedImages(c => [...c, ...imgs])}
              onRemoveImage={id => setAttachedImages(c => c.filter(i => i.id !== id))}
              canAttach={isMultimodal(selectedModel)}
            />
          </div>
        )}
      </main>

      <QuickDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} selectedModel={selectedModel} settings={settings} />
    </div>
  );
}
