import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Button,
  Select,
  SelectItem,
  TextInput,
} from '@carbon/react';
import {
  Add,
  Attachment,
  Bot,
  Chat,
  Checkmark,
  Close,
  Edit,
  Light,
  Menu,
  Moon,
  Renew,
  Script,
  Search,
  Send,
  Settings,
  TrashCan,
  WarningFilled,
} from '@carbon/icons-react';
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
const THEME_STORAGE_KEY = 'hivemind-theme';

const DEFAULT_SETTINGS = {
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 1024,
};

const SUGGESTED_PROMPTS = [
  'Explain this code to me',
  'Write a Python script that…',
  'What are the best practices for…',
  'Help me debug this error: …',
  'Summarise the key points of…',
  'Write a regex that matches…',
  'How does this algorithm work?',
  'Review my code for issues',
];

const MULTIMODAL_PATTERNS = /llava|moondream|bakllava|minicpm.?v|cogvlm|internvl|phi.*vision|vision|gemma4|nemotron3/i;

const STATUS_TAG_TYPE = { ok: 'green', warn: 'yellow', error: 'red' };

function HiveMindLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M2.5 13V3H5L8 7.5L11 3H13.5V13H11V7L8 11L5 7V13H2.5Z" fill="white" />
    </svg>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getErrorMessage(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}

function isMultimodalModel(modelName) {
  return MULTIMODAL_PATTERNS.test(modelName || '');
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const delta = Date.now() - date.getTime();
  if (delta < 60_000) return 'now';
  if (delta < 3_600_000) return `${Math.max(1, Math.floor(delta / 60_000))}m`;
  if (delta < 86_400_000) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatModelSize(model) {
  const rawSize = model.parameter_size ?? model.size;
  if (!rawSize) return 'local';
  if (typeof rawSize === 'string') return rawSize;
  if (rawSize >= 1_000_000_000) return `${(rawSize / 1_000_000_000).toFixed(1)}B`;
  if (rawSize >= 1_000_000) return `${(rawSize / 1_000_000).toFixed(1)}M`;
  return String(rawSize);
}

function conversationTitle(conversation) {
  return conversation.title?.trim() || 'New chat';
}

function buildConversationTitle(messageText) {
  const cleaned = messageText.trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'New chat';
  const title = cleaned.slice(0, 50);
  return title.length < cleaned.length ? `${title.trimEnd()}...` : title;
}

function groupConversationsByDate(conversations) {
  const now = Date.now();
  const groups = { Today: [], Yesterday: [], Earlier: [] };
  conversations.forEach((conv) => {
    const delta = now - new Date(conv.updated_at || 0).getTime();
    if (delta < 86_400_000) groups.Today.push(conv);
    else if (delta < 172_800_000) groups.Yesterday.push(conv);
    else groups.Earlier.push(conv);
  });
  return groups;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useCopyToClipboard(timeout = 2000) {
  const [copied, setCopied] = useState(false);
  const copy = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), timeout);
    }).catch(() => {});
  };
  return [copied, copy];
}

// ─── Components ──────────────────────────────────────────────────────────────

function StreamingCursor() {
  return <span className="streaming-cursor" aria-hidden="true" />;
}

function CodeBlock({ children }) {
  const [copied, copy] = useCopyToClipboard();
  const codeEl = children?.props;
  const codeText = String(codeEl?.children ?? '').trimEnd();
  const langClass = codeEl?.className ?? '';
  const lang = langClass.replace('language-', '') || null;

  return (
    <div className="md-code-block">
      <div className="code-block-header">
        {lang ? <span className="code-lang-label">{lang}</span> : <span />}
        <button className="code-copy-btn" onClick={() => copy(codeText)} aria-label="Copy code">
          {copied ? <><Checkmark size={13} /> Copied!</> : 'Copy'}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

function MessageBubble({ message, isStreaming }) {
  const [msgCopied, copyMsg] = useCopyToClipboard();
  const isUser = message.role === 'user';
  const showTyping = isStreaming && !message.content && !isUser;

  return (
    <article className={`bubble ${isUser ? 'bubble-user' : 'bubble-assistant'}`}>
      <div className="bubble-avatar" aria-hidden="true">
        {isUser ? <Chat /> : <Script />}
      </div>
      <div className="bubble-body">
        <div className="bubble-meta">
          <span>{isUser ? 'You' : message.model || 'AI'}</span>
          {isStreaming && !isUser && message.content && (
            <span className="streaming-label">responding…</span>
          )}
          <span>{formatTime(message.created_at)}</span>
        </div>
        <div className={`bubble-content ${isUser ? 'bubble-content-user' : 'markdown-content'}`}>
          {isUser && message.images?.length > 0 && (
            <div className="bubble-images">
              {message.images.map((src, i) => (
                <img key={src} src={src} alt={`attachment ${i + 1}`} className="bubble-image" />
              ))}
            </div>
          )}
          {isUser ? (
            message.content
          ) : showTyping ? (
            <div className="typing-indicator" aria-label="Generating response">
              <span /><span /><span />
              <span className="typing-label">Thinking…</span>
            </div>
          ) : (
            <>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noreferrer">
                      {children}
                    </a>
                  ),
                  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
                  code: ({ inline, className, children, ...props }) =>
                    inline ? (
                      <code className="md-inline-code" {...props}>
                        {children}
                      </code>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    ),
                }}
              >
                {message.content || ''}
              </ReactMarkdown>
              {isStreaming && <StreamingCursor />}
            </>
          )}
        </div>
      </div>
      <button
        className="bubble-copy-btn"
        onClick={() => copyMsg(message.content || '')}
        aria-label="Copy message"
      >
        {msgCopied ? <><Checkmark size={13} /> Copied!</> : 'Copy'}
      </button>
    </article>
  );
}

function ConversationCard({ conversation, isActive, renaming, onSelect, onRenameStart, onRenameChange, onRenameSubmit, onRenameCancel, onDelete }) {
  const isRenaming = renaming.id === conversation.id;

  return (
    <div
      className={`conversation-card ${isActive ? 'conversation-card-active' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => !isRenaming && onSelect(conversation.id)}
      onKeyDown={(event) => {
        if (isRenaming) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(conversation.id);
        }
      }}
    >
      <div className="conversation-card-main">
        {isRenaming ? (
          <input
            className="rename-input"
            value={renaming.value}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') onRenameSubmit(conversation.id);
              if (e.key === 'Escape') onRenameCancel();
            }}
            onBlur={() => onRenameSubmit(conversation.id)}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="conversation-card-title">{conversationTitle(conversation)}</div>
        )}
        <div className="conversation-card-meta">
          <span>{conversation.message_count ?? 0} messages</span>
          <span>{formatTime(conversation.updated_at)}</span>
        </div>
      </div>
      <div className="conv-card-actions">
        {!isRenaming && (
          <Button
            kind="ghost"
            size="sm"
            hasIconOnly
            renderIcon={Edit}
            iconDescription="Rename"
            onClick={(event) => {
              event.stopPropagation();
              onRenameStart(conversation.id, conversationTitle(conversation));
            }}
          />
        )}
        <Button
          kind="ghost"
          size="sm"
          hasIconOnly
          renderIcon={TrashCan}
          iconDescription={`Delete ${conversationTitle(conversation)}`}
          onClick={(event) => onDelete(event, conversation.id)}
        />
      </div>
    </div>
  );
}

function EmptyState({ status, modelSummary, conversationCount, onSuggestPrompt }) {
  const statusLabel = status === 'ok' ? 'Connected' : status === 'warn' ? 'Limited' : 'Offline';
  return (
    <div className="empty-state">
      <div className="empty-state-icon-wrap">
        <div className="empty-state-icon-bg" aria-hidden="true" />
        <div className="empty-state-icon">
          <Bot size={30} />
        </div>
      </div>
      <h2>What can I help you with?</h2>
      <p className="empty-state-desc">HiveMind runs entirely on your machine — your conversations never leave your device.</p>
      <div className="empty-state-meta">
        <span className={`empty-meta-chip chip-${status}`}>
          <span className={`status-dot status-${status}`} /> {statusLabel}
        </span>
        {modelSummary && (
          <span className="empty-meta-chip">{modelSummary.name}</span>
        )}
        {conversationCount > 0 && (
          <span className="empty-meta-chip">{conversationCount} saved chats</span>
        )}
      </div>
      <div className="empty-state-prompts">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            className="prompt-chip"
            onClick={() => onSuggestPrompt(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Quick Chat Drawer ───────────────────────────────────────────────────────

function QuickChatDrawer({ assistant, selectedModel, settings, onClose, onOpenFull }) {
  const [messages, setMessages] = useState([]);
  const [convId, setConvId] = useState(null);
  const [composerValue, setComposerValue] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const composerRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = composerValue.trim();
    if (!text || sending) return;
    setSending(true);
    setComposerValue('');

    const userMsg = { id: `${Date.now()}-user`, role: 'user', content: text, created_at: new Date().toISOString() };
    const seed = { id: 'streaming', role: 'assistant', content: '', created_at: new Date().toISOString() };
    setMessages((curr) => [...curr, userMsg, seed]);

    try {
      let cid = convId;
      if (!cid) {
        const conv = await createConversation(API_BASE, {
          title: text.slice(0, 50),
          model: selectedModel,
          temperature: settings.temperature,
          top_p: settings.topP,
          max_tokens: settings.maxTokens,
          assistant_id: assistant.id,
          assistant_name: assistant.name,
        });
        cid = conv.id;
        setConvId(cid);
      }

      const stream = await sendMessageStream(API_BASE, {
        conversation_id: cid,
        message: text,
        model: selectedModel,
        temperature: settings.temperature,
        top_p: settings.topP,
        max_tokens: settings.maxTokens,
        assistant_id: assistant.id,
      });

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let content = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() || '';
        for (const frame of frames) {
          const line = frame.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (!payload.content) continue;
            content += payload.content;
            setMessages((curr) => {
              const next = [...curr];
              const idx = next.findIndex((m) => m.id === 'streaming');
              if (idx === -1) return curr;
              next[idx] = { ...next[idx], content };
              return next;
            });
          } catch { continue; }
        }
      }
    } catch (err) {
      setMessages((curr) => {
        const next = [...curr];
        const idx = next.findIndex((m) => m.id === 'streaming');
        if (idx !== -1) next[idx] = { ...next[idx], content: `Error: ${err.message}` };
        return next;
      });
    } finally {
      setSending(false);
      composerRef.current?.focus();
    }
  };

  return (
    <div className="quick-chat-drawer">
      <div className="quick-chat-header">
        <div className="quick-chat-header-info">
          <div className="quick-chat-avatar"><Bot size={14} /></div>
          <div>
            <p className="quick-chat-assistant-name">{assistant.name}</p>
            <p className="quick-chat-assistant-hint">Codebase assistant</p>
          </div>
        </div>
        <div className="quick-chat-header-actions">
          <button className="qc-icon-btn" title="Open full chat" onClick={() => onOpenFull(assistant)}>
            <Script size={14} />
          </button>
          <button className="qc-icon-btn" title="Close" onClick={onClose}>
            <Close size={14} />
          </button>
        </div>
      </div>

      <div className="quick-chat-messages">
        {messages.length === 0 ? (
          <div className="quick-chat-empty">
            <Bot size={28} />
            <p>Chat with <strong>{assistant.name}</strong></p>
            <p className="qc-hint">Responses are grounded in the indexed codebase</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`qc-msg qc-msg-${msg.role}`}>
              {msg.role === 'assistant' && !msg.content && sending ? (
                <div className="typing-indicator" aria-label="Thinking">
                  <span /><span /><span />
                </div>
              ) : msg.role === 'user' ? (
                <span>{msg.content}</span>
              ) : (
                <>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}
                    components={{
                      pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
                      code: ({ inline, className, children, ...props }) =>
                        inline ? <code className="md-inline-code" {...props}>{children}</code>
                              : <code className={className} {...props}>{children}</code>,
                    }}
                  >{msg.content}</ReactMarkdown>
                  {sending && msg.id === 'streaming' && msg.content && <StreamingCursor />}
                </>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="quick-chat-composer">
        <textarea
          ref={composerRef}
          className="qc-textarea"
          placeholder="Ask about the codebase…"
          value={composerValue}
          onChange={(e) => setComposerValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          rows={1}
        />
        <button
          className="qc-send-btn"
          disabled={!composerValue.trim() || sending}
          onClick={handleSend}
          aria-label="Send"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState('chat');
  const [activeAssistantId, setActiveAssistantId] = useState(null);
  const [activeAssistantName, setActiveAssistantName] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [models, setModels] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [selectedModel, setSelectedModel] = useState('mistral');
  const [composerValue, setComposerValue] = useState('');
  const [status, setStatus] = useState('loading');
  const [statusDetail, setStatusDetail] = useState('Checking backend');
  const [searchTerm, setSearchTerm] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [renaming, setRenaming] = useState({ id: null, value: '' });
  const [theme, setTheme] = useState(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [settings, setSettings] = useState(() => {
    const stored = window.localStorage.getItem('hivemind-settings');
    return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
  });
  const [attachedImages, setAttachedImages] = useState([]);
  const [quickChatAssistant, setQuickChatAssistant] = useState(null);

  const messagesEndRef = useRef(null);
  const conversationListRef = useRef(null);
  const composerRef = useRef(null);
  const imageInputRef = useRef(null);

  const focusComposer = () => composerRef.current?.focus();

  const resetComposerHeight = () => {
    if (composerRef.current) composerRef.current.style.height = 'auto';
  };

  const handleComposerInput = (event) => {
    const el = event.target;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || null,
    [conversations, activeConversationId],
  );

  const filteredConversations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((c) => conversationTitle(c).toLowerCase().includes(term));
  }, [conversations, searchTerm]);

  const modelSummary = useMemo(
    () => models.find((m) => m.name === selectedModel) || models[0] || null,
    [models, selectedModel],
  );

  const persistSettings = (nextSettings) => {
    setSettings(nextSettings);
    window.localStorage.setItem('hivemind-settings', JSON.stringify(nextSettings));
  };

  const refreshConversations = async () => {
    const data = await fetchConversations(API_BASE);
    setConversations(data || []);
  };

  const refreshModels = async () => {
    const data = await fetchModels(API_BASE);
    const availableModels = data.models || [];
    setModels(availableModels);
    if (availableModels.length > 0 && !availableModels.some((m) => m.name === selectedModel)) {
      setSelectedModel(availableModels[0].name);
    }
  };

  const refreshStatus = async () => {
    const data = await fetchStatus(API_BASE);
    const ollamaState = data.ollama || 'error';
    setStatus(ollamaState === 'ok' ? 'ok' : ollamaState === 'no_models' ? 'warn' : 'error');
    setStatusDetail(
      ollamaState === 'ok'
        ? 'Backend and Ollama are ready'
        : ollamaState === 'no_models'
          ? 'Backend is up, no Ollama models are loaded'
          : 'Backend or Ollama is unavailable',
    );
  };

  const syncConversation = async (conversationId) => {
    const detail = await fetchConversation(API_BASE, conversationId);
    setMessages(detail.messages || []);
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        await Promise.all([refreshModels(), refreshConversations(), refreshStatus()]);
        if (!cancelled) setErrorMessage('');
      } catch (error) {
        if (!cancelled) {
          setStatus('error');
          setStatusDetail('Unable to reach the backend');
          setErrorMessage(getErrorMessage(error, 'Unable to load app data'));
        }
      }
    };

    load();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const keyHandler = (event) => {
      if (event.key === 'Escape' && settingsOpen) setSettingsOpen(false);
    };
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [settingsOpen]);

  const handleModelChange = (event) => {
    const next = event.target.value;
    setSelectedModel(next);
    if (!isMultimodalModel(next) && attachedImages.length > 0) {
      setAttachedImages([]);
    }
  };

  const resetChatState = () => {
    setActiveConversationId(null);
    setMessages([]);
    setComposerValue('');
    setErrorMessage('');
  };

  const handleNewConversation = () => {
    resetChatState();
    setActiveAssistantId(null);
    setActiveAssistantName(null);
    setSidebarOpen(false);
    focusComposer();
    setTimeout(() => {
      conversationListRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }, 50);
  };

  const handleOpenAssistantChat = (assistant) => {
    resetChatState();
    setActiveAssistantId(assistant.id);
    setActiveAssistantName(assistant.name);
    setView('chat');
    setSidebarOpen(false);
    focusComposer();
  };

  const handleSelectConversation = async (conversationId) => {
    const conv = conversations.find((c) => c.id === conversationId);
    setActiveAssistantId(conv?.assistant_id || null);
    setActiveAssistantName(conv?.assistant_name || null);
    setActiveConversationId(conversationId);
    setSidebarOpen(false);
    setErrorMessage('');

    try {
      await syncConversation(conversationId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Unable to load conversation'));
      setMessages([]);
    }
  };

  const handleDeleteConversation = async (event, conversationId) => {
    event.stopPropagation();
    try {
      await deleteConversation(API_BASE, conversationId);
      setConversations((current) => current.filter((c) => c.id !== conversationId));
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Unable to delete conversation'));
    }
  };

  const handleRenameStart = (conversationId, currentTitle) => {
    setRenaming({ id: conversationId, value: currentTitle });
  };

  const handleRenameSubmit = async (conversationId) => {
    const newTitle = renaming.value.trim();
    setRenaming({ id: null, value: '' });
    if (!newTitle) return;
    const existing = conversations.find((c) => c.id === conversationId);
    if (existing && newTitle === conversationTitle(existing)) return;
    try {
      await renameConversation(API_BASE, conversationId, newTitle);
      setConversations((current) =>
        current.map((c) => (c.id === conversationId ? { ...c, title: newTitle } : c)),
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Failed to rename conversation'));
    }
  };

  const ensureConversation = async (messageText) => {
    if (activeConversationId) return activeConversationId;

    const conversation = await createConversation(API_BASE, {
      title: buildConversationTitle(messageText),
      model: selectedModel,
      temperature: settings.temperature,
      top_p: settings.topP,
      max_tokens: settings.maxTokens,
      ...(activeAssistantId ? { assistant_id: activeAssistantId, assistant_name: activeAssistantName } : {}),
    });

    setConversations((current) => [conversation, ...current.filter((c) => c.id !== conversation.id)]);
    setActiveConversationId(conversation.id);
    return conversation.id;
  };

  const handleImageAttach = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    try {
      const dataUrls = await Promise.all(files.map(readFileAsDataUrl));
      const newImages = dataUrls.map((dataUrl, i) => ({
        id: `img-${Date.now()}-${i}`,
        dataUrl,
        base64: dataUrl.split(',')[1],
      }));
      setAttachedImages((current) => [...current, ...newImages]);
    } catch {
      setErrorMessage('Failed to read one or more images');
    }
  };

  const handleRemoveImage = (id) => {
    setAttachedImages((current) => current.filter((img) => img.id !== id));
  };

  const handleSend = async () => {
    const text = composerValue.trim();
    if (!text || sending) return;

    const imagesToSend = [...attachedImages];
    const imageDataUrls = imagesToSend.map((img) => img.dataUrl);
    const imageBase64List = imagesToSend.map((img) => img.base64);

    setSending(true);
    setErrorMessage('');
    setSettingsOpen(false);
    setComposerValue('');
    setAttachedImages([]);
    resetComposerHeight();

    let conversationId;

    try {
      conversationId = await ensureConversation(text);

      const userMessage = {
        id: `${Date.now()}-user`,
        role: 'user',
        content: text,
        model: selectedModel,
        created_at: new Date().toISOString(),
        conversation_id: conversationId,
        images: imageDataUrls.length > 0 ? imageDataUrls : undefined,
      };

      const assistantSeed = {
        id: 'streaming-assistant',
        role: 'assistant',
        content: '',
        model: selectedModel,
        created_at: new Date().toISOString(),
        conversation_id: conversationId,
      };

      setMessages((current) => [...current, userMessage, assistantSeed]);

      const stream = await sendMessageStream(API_BASE, {
        conversation_id: conversationId,
        message: text,
        model: selectedModel,
        temperature: settings.temperature,
        top_p: settings.topP,
        max_tokens: settings.maxTokens,
        ...(activeAssistantId ? { assistant_id: activeAssistantId } : {}),
        ...(imageBase64List.length > 0 ? { images: imageBase64List } : {}),
      });

      if (!stream) throw new Error('Streaming response is unavailable');

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() || '';

        for (const frame of frames) {
          const eventLine = frame.split('\n').find((line) => line.startsWith('data: '));
          if (!eventLine) continue;

          try {
            const payload = JSON.parse(eventLine.slice(6));
            if (!payload.content) continue;
            assistantContent += payload.content;
            setMessages((current) => {
              const next = [...current];
              const idx = next.findIndex((item) => item.id === 'streaming-assistant');
              if (idx === -1) return current;
              next[idx] = { ...next[idx], content: assistantContent };
              return next;
            });
          } catch {
            continue;
          }
        }
      }

      await Promise.all([refreshConversations(), syncConversation(conversationId)]);
      setActiveConversationId(conversationId);
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to send message');
      setErrorMessage(message);
      setMessages((current) => {
        const next = [...current];
        const idx = next.findIndex((item) => item.id === 'streaming-assistant');
        if (idx !== -1) next[idx] = { ...next[idx], content: `Error: ${message}` };
        return next;
      });
    } finally {
      setSending(false);
      focusComposer();
    }
  };

  const handleComposerKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleThemeToggle = () => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
      return next;
    });
  };

  // ─── Derived render values ───────────────────────────────────────────────

  const assistantConvs = filteredConversations.filter((c) => c.assistant_id);
  const regularConvs = filteredConversations.filter((c) => !c.assistant_id);
  const regularGroups = groupConversationsByDate(regularConvs);

  const headerEyebrow = view === 'assistants'
    ? 'RAG — Codespace Assistants'
    : activeAssistantName
      ? `Assistant · ${activeAssistantName}`
      : 'HiveMind · Local inference';

  const headerTitle = view === 'assistants'
    ? 'Assistants'
    : activeConversation
      ? conversationTitle(activeConversation)
      : 'New chat';

  const canAttachImage = isMultimodalModel(selectedModel) && !sending;
  const attachTooltip = canAttachImage
    ? 'Attach image — processed locally, never uploaded'
    : 'Select a multimodal model (e.g. llava) to attach images';

  const renamingProps = {
    renaming,
    onSelect: handleSelectConversation,
    onRenameStart: handleRenameStart,
    onRenameChange: (value) => setRenaming((r) => ({ ...r, value })),
    onRenameSubmit: handleRenameSubmit,
    onRenameCancel: () => setRenaming({ id: null, value: '' }),
    onDelete: handleDeleteConversation,
  };

  return (
    <div className={`app-shell ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <div className="brand-identity">
              <div className="brand-mark"><HiveMindLogo /></div>
              <div className="brand-copy">
                <h1>HiveMind</h1>
                <p className="brand-tagline">Private intelligence</p>
              </div>
            </div>

            <div className="sidebar-brand-actions">
              <Button kind="primary" renderIcon={Add} size="sm" onClick={handleNewConversation}>
                New chat
              </Button>
              <Button kind="ghost" renderIcon={Renew} size="sm" hasIconOnly iconDescription="Refresh models" onClick={refreshModels} />
            </div>
          </div>

          <div className="sidebar-search">
            <TextInput
              id="conversation-search"
              labelText="Search conversations"
              hideLabel
              placeholder="Search conversations"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              size="sm"
              renderIcon={Search}
            />
          </div>
        </div>

        <div className="sidebar-nav">
          <button
            className={`sidebar-nav-btn ${view === 'chat' ? 'active' : ''}`}
            onClick={() => setView('chat')}
          >
            <Chat size={16} /> Chat
          </button>
          <button
            className={`sidebar-nav-btn ${view === 'assistants' ? 'active' : ''}`}
            onClick={() => setView('assistants')}
          >
            <Bot size={16} /> Assistants
          </button>
        </div>

        <div className="sidebar-list-header">
          <p className="eyebrow">Conversations</p>
          <span>{filteredConversations.length}</span>
        </div>

        <div className="conversation-stack" ref={conversationListRef}>
          {filteredConversations.length === 0 ? (
            <div className="sidebar-empty">
              <p>No conversations yet.</p>
            </div>
          ) : (
            <>
              {assistantConvs.length > 0 && (
                <div className="conv-section">
                  <div className="conv-section-header">
                    <Bot size={11} />
                    <span>Assistant Chats</span>
                    <span className="conv-section-count">{assistantConvs.length}</span>
                  </div>
                  {assistantConvs.map((conv) => (
                    <ConversationCard
                      key={conv.id}
                      conversation={conv}
                      isActive={conv.id === activeConversationId}
                      {...renamingProps}
                    />
                  ))}
                </div>
              )}
              {Object.entries(regularGroups).map(([label, convs]) => {
                if (convs.length === 0) return null;
                return (
                  <div key={label} className="conv-group">
                    <p className="conv-group-label">{label}</p>
                    {convs.map((conv) => (
                      <ConversationCard
                        key={conv.id}
                        conversation={conv}
                        isActive={conv.id === activeConversationId}
                        {...renamingProps}
                      />
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-status-card">
            <span className={`status-dot status-${status}`} />
            <div className="status-info">
              <div className="sidebar-status-line">
                {status === 'ok' ? 'System ready' : status === 'warn' ? 'Limited mode' : 'Attention needed'}
              </div>
              <p>{statusDetail}</p>
            </div>
          </div>
          <Button kind="ghost" size="sm" className="sidebar-settings-btn" renderIcon={Settings} onClick={() => setSettingsOpen(true)}>
            Settings
          </Button>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <main className="workspace">
        <header className="workspace-header">
          <div className="header-left">
            <Button
              kind="ghost"
              size="sm"
              hasIconOnly
              renderIcon={Menu}
              className="sidebar-toggle-btn"
              onClick={() => setSidebarOpen((current) => !current)}
            />
            <div className="header-title-group">
              <p className="eyebrow">{headerEyebrow}</p>
              <h2>{headerTitle}</h2>
              {view === 'chat' && (
                <p className="conversation-subtitle">
                  {activeAssistantName && (
                    <span className="assistant-badge">
                      <Bot size={12} /> {activeAssistantName}
                    </span>
                  )}
                  {messages.length} message{messages.length === 1 ? '' : 's'}
                </p>
              )}
            </div>
          </div>

          <div className="header-controls">
            <button
              className="theme-toggle-btn"
              onClick={handleThemeToggle}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Light size={18} /> : <Moon size={18} />}
            </button>
            <Select
              id="model-select"
              labelText="Model"
              hideLabel
              value={selectedModel}
              onChange={handleModelChange}
              size="sm"
            >
              {models.length === 0 && <SelectItem text="Loading models..." value="" />}
              {models.map((model) => (
                <SelectItem key={model.name} text={model.name} value={model.name} />
              ))}
            </Select>
          </div>
        </header>

        <div className={`workspace-body${quickChatAssistant ? ' has-quick-chat' : ''}`}>
        {view === 'assistants' && (
          <div className="workspace-content">
            <AssistantsPage
              onOpenChat={handleOpenAssistantChat}
              onQuickChat={(assistant) => setQuickChatAssistant(assistant)}
            />
          </div>
        )}

        {view === 'chat' && (
          <div className="workspace-content workspace-chat">
            <section className="chat-panel">
              {errorMessage && (
                <div className="error-banner" role="alert">
                  <WarningFilled />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="message-stream">
                {messages.length === 0 ? (
                  <EmptyState
                    status={status}
                    modelSummary={modelSummary}
                    conversationCount={conversations.length}
                    onSuggestPrompt={(text) => {
                      setComposerValue(text);
                      focusComposer();
                    }}
                  />
                ) : (
                  messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      isStreaming={sending && message.id === 'streaming-assistant'}
                    />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="composer-panel">
                <div className="composer-inner">
                {attachedImages.length > 0 && (
                  <div className="image-preview-strip">
                    {attachedImages.map((img) => (
                      <div key={img.id} className="image-preview-item">
                        <img src={img.dataUrl} alt="attachment" />
                        <button
                          className="image-preview-remove"
                          onClick={() => handleRemoveImage(img.id)}
                          aria-label="Remove image"
                        >
                          <Close size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <textarea
                  ref={composerRef}
                  id="composer"
                  className="composer-textarea"
                  placeholder="Ask a question, paste code, or describe what you need…"
                  value={composerValue}
                  onChange={(event) => setComposerValue(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  onInput={handleComposerInput}
                  rows={1}
                />

                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleImageAttach}
                />

                <div className="composer-actions">
                  <div className="composer-hint">
                    {sending ? (
                      <span className="composer-sending-hint">
                        <span className="composer-spinner" aria-hidden="true" />
                        Sending…
                      </span>
                    ) : (
                      <>
                        <span>Enter to send</span>
                        <span>Shift+Enter for new line</span>
                      </>
                    )}
                    {!sending && composerValue.length > 0 && (
                      <span className="composer-char-count">{composerValue.length}</span>
                    )}
                  </div>
                  <div className="composer-right-actions">
                    <span title={attachTooltip}>
                      <Button
                        kind="ghost"
                        size="sm"
                        hasIconOnly
                        renderIcon={Attachment}
                        iconDescription="Attach image"
                        disabled={!canAttachImage}
                        onClick={() => imageInputRef.current?.click()}
                      />
                    </span>
                    <Button kind="primary" renderIcon={Send} disabled={!composerValue.trim() || sending} onClick={handleSend}>
                      {sending ? 'Sending' : 'Send'}
                    </Button>
                  </div>
                </div>
                </div>{/* composer-inner */}
              </div>
            </section>
          </div>
        )}

        {quickChatAssistant && (
          <QuickChatDrawer
            assistant={quickChatAssistant}
            selectedModel={selectedModel}
            settings={settings}
            onClose={() => setQuickChatAssistant(null)}
            onOpenFull={(assistant) => { setQuickChatAssistant(null); handleOpenAssistantChat(assistant); }}
          />
        )}
        </div>{/* workspace-body */}
      </main>

      {settingsOpen && (
        <div className="settings-overlay open" onClick={() => setSettingsOpen(false)} role="presentation">
          <div className="settings-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="settings-header">
              <div>
                <p className="eyebrow">Chat controls</p>
                <h3>Settings</h3>
              </div>
              <Button kind="ghost" size="sm" onClick={() => setSettingsOpen(false)}>
                Close
              </Button>
            </div>

            <div className="settings-body">
              <label>
                <span>Temperature: {settings.temperature.toFixed(1)}</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={settings.temperature}
                  onChange={(event) => setSettings((s) => ({ ...s, temperature: Number(event.target.value) }))}
                />
              </label>

              <label>
                <span>Top P: {settings.topP.toFixed(2)}</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.topP}
                  onChange={(event) => setSettings((s) => ({ ...s, topP: Number(event.target.value) }))}
                />
              </label>

              <label>
                <span>Max tokens</span>
                <input
                  type="number"
                  min="1"
                  max="8192"
                  value={settings.maxTokens}
                  onChange={(event) => setSettings((s) => ({ ...s, maxTokens: Number(event.target.value) || 1 }))}
                />
              </label>
            </div>

            <div className="settings-footer">
              <Button kind="secondary" onClick={() => persistSettings(DEFAULT_SETTINGS)}>
                Reset
              </Button>
              <Button kind="primary" onClick={() => { persistSettings(settings); setSettingsOpen(false); }}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
