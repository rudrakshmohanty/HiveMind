import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Select,
  SelectItem,
  Tag,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react';
import {
  Add,
  Chat,
  CheckmarkFilled,
  Menu,
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
  sendMessageStream,
} from './api';
import './index.scss';

const API_BASE = '/api';

const DEFAULT_SETTINGS = {
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 1024,
};

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

function statusTagType(status) {
  if (status === 'ok') return 'green';
  if (status === 'warn') return 'yellow';
  return 'red';
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user';

  return (
    <article className={`bubble ${isUser ? 'bubble-user' : 'bubble-assistant'}`}>
      <div className="bubble-avatar" aria-hidden="true">
        {isUser ? <Chat /> : <Script />}
      </div>
      <div className="bubble-body">
        <div className="bubble-meta">
          <span>{isUser ? 'You' : message.model || 'Assistant'}</span>
          <span>{formatTime(message.created_at)}</span>
        </div>
        <div className="bubble-content">{message.content}</div>
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Chat />
      </div>
      <h2>Start a private conversation</h2>
      <p>Choose a model, write a prompt, and let the local Ollama backend handle the rest.</p>
    </div>
  );
}

export default function App() {
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
  const [settings, setSettings] = useState(() => {
    const stored = window.localStorage.getItem('ollama-chat-settings');
    return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
  });

  const messagesEndRef = useRef(null);

  const focusComposer = () => {
    document.getElementById('composer')?.focus();
  };

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) || null,
    [conversations, activeConversationId],
  );

  const filteredConversations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((conversation) => conversationTitle(conversation).toLowerCase().includes(term));
  }, [conversations, searchTerm]);

  const persistSettings = (nextSettings) => {
    setSettings(nextSettings);
    window.localStorage.setItem('ollama-chat-settings', JSON.stringify(nextSettings));
  };

  const refreshConversations = async () => {
    const data = await fetchConversations(API_BASE);
    setConversations(data || []);
  };

  const refreshModels = async () => {
    const data = await fetchModels(API_BASE);
    const availableModels = data.models || [];
    setModels(availableModels);
    if (availableModels.length > 0 && !availableModels.some((model) => model.name === selectedModel)) {
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
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load app data');
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const keyHandler = (event) => {
      if (event.key === 'Escape' && settingsOpen) {
        setSettingsOpen(false);
      }
    };

    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [settingsOpen]);

  const handleNewConversation = async () => {
    try {
      const title = composerValue.trim().slice(0, 50) || 'New chat';
      const conversation = await createConversation(API_BASE, {
        title,
        model: selectedModel,
        temperature: settings.temperature,
        top_p: settings.topP,
        max_tokens: settings.maxTokens,
      });

      setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
      setActiveConversationId(conversation.id);
      setMessages([]);
      setSidebarOpen(false);
      focusComposer();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create conversation');
    }
  };

  const handleSelectConversation = async (conversationId) => {
    setActiveConversationId(conversationId);
    setSidebarOpen(false);
    setErrorMessage('');

    try {
      await syncConversation(conversationId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load conversation');
      setMessages([]);
    }
  };

  const handleDeleteConversation = async (event, conversationId) => {
    event.stopPropagation();

    try {
      await deleteConversation(API_BASE, conversationId);
      setConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete conversation');
    }
  };

  const ensureConversation = async (messageText) => {
    if (activeConversationId) return activeConversationId;

    const conversation = await createConversation(API_BASE, {
      title: messageText.slice(0, 50) || 'New chat',
      model: selectedModel,
      temperature: settings.temperature,
      top_p: settings.topP,
      max_tokens: settings.maxTokens,
    });

    setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
    setActiveConversationId(conversation.id);
    return conversation.id;
  };

  const handleSend = async () => {
    const text = composerValue.trim();
    if (!text || sending) return;

    setSending(true);
    setErrorMessage('');
    setSettingsOpen(false);
    setComposerValue('');

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
      });

      if (!stream) {
        throw new Error('Streaming response is unavailable');
      }

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
              const streamIndex = next.findIndex((item) => item.id === 'streaming-assistant');
              if (streamIndex === -1) return current;
              next[streamIndex] = { ...next[streamIndex], content: assistantContent };
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
      const message = error instanceof Error ? error.message : 'Unable to send message';
      setErrorMessage(message);
      setMessages((current) => {
        const next = [...current];
        const streamIndex = next.findIndex((item) => item.id === 'streaming-assistant');
        if (streamIndex !== -1) {
          next[streamIndex] = {
            ...next[streamIndex],
            content: `Error: ${message}`,
          };
        }
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

  const handleSettingsSave = () => {
    persistSettings(settings);
    setSettingsOpen(false);
  };

  const modelSummary = models.find((model) => model.name === selectedModel) || models[0] || null;

  return (
    <div className={`app-shell ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-copy">
            <p className="eyebrow">Self-hosted AI workspace</p>
            <h1>Ollama Chat</h1>
            <p>Carbon UI, local models, and conversation history in one place.</p>
          </div>

          <div className="sidebar-brand-actions">
            <Button kind="primary" renderIcon={Add} size="sm" onClick={handleNewConversation}>
              New chat
            </Button>
            <Button kind="tertiary" renderIcon={Renew} size="sm" onClick={refreshModels}>
              Refresh
            </Button>
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

        <div className="conversation-stack">
          {filteredConversations.length === 0 ? (
            <div className="sidebar-empty">
              <p>No conversations yet.</p>
            </div>
          ) : (
            filteredConversations.map((conversation) => {
              const isActive = conversation.id === activeConversationId;
              return (
                <div
                  key={conversation.id}
                  className={`conversation-card ${isActive ? 'conversation-card-active' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectConversation(conversation.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleSelectConversation(conversation.id);
                    }
                  }}
                >
                  <div className="conversation-card-main">
                    <div className="conversation-card-title">{conversationTitle(conversation)}</div>
                    <div className="conversation-card-meta">
                      <span>{conversation.message_count ?? 0} messages</span>
                      <span>{formatTime(conversation.updated_at)}</span>
                    </div>
                  </div>
                  <Button
                    kind="ghost"
                    size="sm"
                    hasIconOnly
                    renderIcon={TrashCan}
                    iconDescription={`Delete ${conversationTitle(conversation)}`}
                    onClick={(event) => handleDeleteConversation(event, conversation.id)}
                  />
                </div>
              );
            })
          )}
        </div>

        <div className="sidebar-footer">
          <Button kind="ghost" size="sm" renderIcon={Settings} onClick={() => setSettingsOpen(true)}>
            Settings
          </Button>
          <div className="sidebar-status-line">
            <span className={`status-dot status-${status}`} />
            <span>{statusDetail}</span>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div className="header-left">
            <Button
              kind="ghost"
              size="sm"
              hasIconOnly
              renderIcon={Menu}
              iconDescription="Toggle Sidebar"
              className="sidebar-toggle-btn"
              onClick={() => setSidebarOpen((current) => !current)}
            />
            <div>
              <p className="eyebrow">Local inference</p>
              <h2>{activeConversation ? conversationTitle(activeConversation) : 'New chat'}</h2>
            </div>
          </div>

          <div className="header-controls">
            <Tag type={statusTagType(status)}>
              {status === 'ok' ? 'Ready' : status === 'warn' ? 'Limited' : 'Offline'}
            </Tag>
            <Select
              id="model-select"
              labelText="Model"
              hideLabel
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              size="sm"
            >
              {models.length === 0 && <SelectItem text="Loading models..." value="" />}
              {models.map((model) => (
                <SelectItem key={model.name} text={model.name} value={model.name} />
              ))}
            </Select>
          </div>
        </header>

        <section className="status-grid">
          <Tile className="status-card">
            <p className="status-label">Backend</p>
            <div className="status-value">
              {status === 'ok' ? <CheckmarkFilled /> : <WarningFilled />}
              <span>{status === 'ok' ? 'Connected' : 'Attention needed'}</span>
            </div>
          </Tile>

          <Tile className="status-card">
            <p className="status-label">Model</p>
            <div className="status-value">
              <span>{modelSummary?.name || 'No model selected'}</span>
            </div>
            <p className="status-caption">{modelSummary ? formatModelSize(modelSummary) : 'Load a model to begin'}</p>
          </Tile>

          <Tile className="status-card">
            <p className="status-label">Conversations</p>
            <div className="status-value">
              <span>{conversations.length}</span>
            </div>
            <p className="status-caption">Saved locally in your database</p>
          </Tile>
        </section>

        <section className="chat-panel">
          {errorMessage && (
            <div className="error-banner" role="alert">
              <WarningFilled />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="message-stream">
            {messages.length === 0 ? <EmptyState /> : messages.map((message) => <MessageBubble key={message.id} message={message} />)}
            <div ref={messagesEndRef} />
          </div>

          <div className="composer-panel">
            <TextArea
              id="composer"
              labelText="Write a message"
              hideLabel
              placeholder="Ask something, paste code, or describe the task..."
              value={composerValue}
              onChange={(event) => setComposerValue(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              rows={4}
            />

            <div className="composer-actions">
              <div className="composer-hint">
                <span>Enter to send</span>
                <span>Shift+Enter for a new line</span>
              </div>
              <Button kind="primary" renderIcon={Send} disabled={!composerValue.trim() || sending} onClick={handleSend}>
                {sending ? 'Sending' : 'Send'}
              </Button>
            </div>
          </div>
        </section>
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
                  onChange={(event) => persistSettings({ ...settings, temperature: Number(event.target.value) })}
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
                  onChange={(event) => persistSettings({ ...settings, topP: Number(event.target.value) })}
                />
              </label>

              <label>
                <span>Max tokens</span>
                <input
                  type="number"
                  min="1"
                  max="8192"
                  value={settings.maxTokens}
                  onChange={(event) => persistSettings({ ...settings, maxTokens: Number(event.target.value) || 1 })}
                />
              </label>
            </div>

            <div className="settings-footer">
              <Button kind="secondary" onClick={() => persistSettings(DEFAULT_SETTINGS)}>
                Reset
              </Button>
              <Button kind="primary" onClick={handleSettingsSave}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}