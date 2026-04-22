import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchModels, fetchConversations, sendMessage, sendMessageStream, createChat } from './api';
import './index.css';

const API_BASE = '/api';

function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60_000) return 'now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function MessageBubble({ message }) {
  const { role, content } = message;

  // Simple markdown-like rendering
  const rendered = content
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');

  return (
    <div className={`message ${role}`}>
      <div className="message-avatar">
        {role === 'user' ? '👤' : '🤖'}
      </div>
      <div className="message-content" dangerouslySetInnerHTML={{ __html: rendered }} />
    </div>
  );
}

function LoadingDots() {
  return (
    <div className="message assistant">
      <div className="message-avatar">🤖</div>
      <div className="message-content">
        <div className="loading-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('mistral');
  const [status, setStatus] = useState('loading');
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({ temperature: 0.7, top_p: 0.9, maxTokens: 4096 });

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const loadModels = useCallback(async () => {
    try {
      const data = await fetchModels(API_BASE);
      setModels(data.models || []);
      if (data.models.length > 0 && !selectedModel) {
        setSelectedModel(data.models[0].name);
      }
    } catch (e) {
      setStatus('error');
    }
  }, [selectedModel]);

  const loadConversations = useCallback(async () => {
    try {
      const data = await fetchConversations(API_BASE);
      setConversations(data);
    } catch (e) {
      // Silently fail — sidebar stays empty
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    loadModels();
    loadConversations();
    // Check health
    (async () => {
      try {
        const resp = await fetch(`${API_BASE}/health`);
        if (!resp.ok) setStatus('error');
        else setStatus('ok');
      } catch {
        setStatus('error');
      }
    })();
  }, [loadModels, loadConversations]);

  // Load conversation when switching
  useEffect(() => {
    setMessages([]);
  }, [activeConvId]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [input]);

  const handleNewChat = () => {
    setActiveConvId(null);
    setMessages([]);
    textareaRef.current?.focus();
  };

  const handleSelectConversation = async (id) => {
    setActiveConvId(id);
    setMessages([]);

    // Fetch conversation messages
    const resp = await fetch(`${API_BASE}/conversations/${id}`);
    if (!resp.ok) return;
    const data = await resp.json();
    setActiveConvId(id);
    setMessages(data.messages || []);
  };

  const handleDeleteConversation = async (e, id) => {
    e.stopPropagation();
    await fetch(`${API_BASE}/conversations/${id}`, { method: 'DELETE' });
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConvId === id) {
      setActiveConvId(null);
      setMessages([]);
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      model: selectedModel,
      created_at: new Date().toISOString(),
      conversation_id: activeConvId,
    };

    setMessages(prev => [...prev, userMsg]);
    const currentInput = input.trim();
    setInput('');
    setShowSettings(false);

    try {
      const resp = await sendMessageStream(
        API_BASE,
        {
          message: currentInput,
          model: selectedModel,
          temperature: settings.temperature,
          top_p: settings.top_p,
          max_tokens: settings.maxTokens,
          conversation_id: activeConvId,
        }
      );

      // Streaming response
      let assistantMsgId = null;
      let contentParts = [];

      const assistantMsg = {
        id: 'streaming',
        role: 'assistant',
        content: '',
        model: selectedModel,
        created_at: new Date().toISOString(),
        conversation_id: activeConvId,
      };

      setMessages(prev => [...prev, assistantMsg]);

      const reader = resp.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process SSE chunks
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            contentParts.push(data.content);
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last.id === 'streaming') {
                return [...prev.slice(0, -1), { ...last, content: contentParts.join('') }];
              }
              return prev;
            });
          } catch {
            // Skip malformed chunks
          }
        }
      }

      // Final message
      const fullContent = contentParts.join('');
      assistantMsgId = Date.now().toString();
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last.id === 'streaming') {
          return [...prev.slice(0, -1), { ...last, id: assistantMsgId, content: fullContent }];
        }
        return prev;
      });

      // Update conversation list
      loadConversations();
    } catch (e) {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last.id === 'streaming') {
          return [...prev.slice(0, -1), { ...last, content: 'Error: ' + e.message }];
        }
        return prev;
      });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSettingsSave = () => {
    setShowSettings(false);
  };

  const activeConvTitle = conversations.find(c => c.id === activeConvId)?.title || '';

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>💬 Ollama Chat</h2>
          <button className="new-chat-btn" onClick={handleNewChat}>
            <span>+</span> New Chat
          </button>
        </div>
        <div className="conversation-list">
          {conversations.length === 0 && (
            <div style={{ padding: '20px 12px', color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center' }}>
              No conversations yet
            </div>
          )}
          {conversations.map(c => (
            <div
              key={c.id}
              className={`conversation-item ${activeConvId === c.id ? 'active' : ''}`}
              onClick={() => handleSelectConversation(c.id)}
            >
              <span className="conversation-item-title">{c.title}</span>
              <span className="conversation-item-time">{formatTime(c.updated_at)}</span>
              <button className="conversation-item-delete" onClick={(e) => handleDeleteConversation(e, c.id)}>
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="sidebar-footer">
          <button onClick={() => setShowSettings(true)}>⚙️ Settings</button>
          <button onClick={loadModels}>🔄 Refresh</button>
        </div>
      </div>

      {/* Main area */}
      <div className="main-content">
        <div className="chat-header">
          <select
            className="model-selector"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={status !== 'ok'}
          >
            {models.length === 0 && <option value="">Loading models...</option>}
            {models.map(m => (
              <option key={m.name} value={m.name}>{m.name}</option>
            ))}
          </select>

          {activeConvTitle && (
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
              — {activeConvTitle}
            </span>
          )}

          <div className={`status-indicator ${status === 'loading' ? 'loading' : status === 'ok' ? 'ok' : 'error'}`} />
        </div>

        <div className="messages-area">
          {messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">💬</div>
              <h3>Welcome to Ollama Chat</h3>
              <p>Send a message to start a new conversation</p>
            </div>
          ) : (
            messages.map(m => <MessageBubble key={m.id} message={m} />)
          )}
          {status === 'error' && messages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--danger)', padding: 20 }}>
              <p>⚠️ Cannot connect to Ollama. Make sure Ollama is running.</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-area">
          <div className="input-wrapper">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message... (Shift+Enter for newline)"
              rows={1}
            />
            <button
              className="send-btn"
              onClick={handleSend}
              disabled={!input.trim()}
            >
              ➤
            </button>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>⚙️ Chat Settings</h3>

            <div className="setting-group">
              <label>Temperature ({settings.temperature})</label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={settings.temperature}
                onChange={(e) => setSettings(s => ({ ...s, temperature: parseFloat(e.target.value) }))}
              />
            </div>

            <div className="setting-group">
              <label>Top P ({settings.top_p})</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.top_p}
                onChange={(e) => setSettings(s => ({ ...s, top_p: parseFloat(e.target.value) }))}
              />
            </div>

            <div className="setting-group">
              <label>Max Tokens</label>
              <input
                type="number"
                min="1"
                max="8192"
                value={settings.maxTokens}
                onChange={(e) => setSettings(s => ({ ...s, maxTokens: parseInt(e.target.value) }))}
              />
            </div>

            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setShowSettings(false)}>Cancel</button>
              <button className="save-btn" onClick={handleSettingsSave}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
