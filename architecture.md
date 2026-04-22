# Self-Hosted AI Chat Application - Full Architecture

## 1. SYSTEM ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER DEVICES                              │
│              (Web Browser / Mobile Safari/Chrome)                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                    HTTP/WebSocket
                         │
┌────────────────────────▼────────────────────────────────────────┐
│              FRONTEND - React + Carbon Design System             │
│                      (Port: 3000)                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ • Chat Interface (Messages, User Input)                  │   │
│  │ • Model Selector (Dropdown/Modal)                        │   │
│  │ • Conversation History Panel                             │   │
│  │ • Settings Panel                                         │   │
│  │ • Responsive Design (Mobile/Tablet/Desktop)              │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                   REST API + WebSocket
                    (JSON Payloads)
                         │
┌────────────────────────▼────────────────────────────────────────┐
│            BACKEND API - FastAPI + Python                        │
│                      (Port: 8000)                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Endpoints:                                                │   │
│  │ • POST /api/chat/completions                             │   │
│  │ • GET /api/models (list available models)                │   │
│  │ • GET /api/health (Ollama health check)                  │   │
│  │ • WebSocket /ws/chat (streaming responses)               │   │
│  │ • POST /api/conversations                                │   │
│  │ • GET /api/conversations/{id}                            │   │
│  │ • DELETE /api/conversations/{id}                         │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                   HTTP (localhost)
                         │
┌────────────────────────▼────────────────────────────────────────┐
│         OLLAMA SERVICE - Docker Container                        │
│                      (Port: 11434)                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ • LLM Models (mistral, neural-chat, llama2, etc.)        │   │
│  │ • Model Management                                        │   │
│  │ • Inference Engine                                        │   │
│  │ • REST API Interface                                      │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │
              Docker Volumes (Model Storage)
                         │
┌────────────────────────▼────────────────────────────────────────┐
│          DATA STORAGE - SQLite / PostgreSQL                      │
│              (Conversation History)                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ • Users (optional)                                        │   │
│  │ • Conversations                                           │   │
│  │ • Messages                                                │   │
│  │ • Chat Metadata                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. DETAILED COMPONENT BREAKDOWN

### 2.1 FRONTEND (React + Carbon)
**Location:** `/frontend`

**Key Components:**
```
frontend/
├── public/
│   ├── index.html
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── ChatWindow/          # Main chat display
│   │   ├── MessageBubble/       # Individual message UI
│   │   ├── InputBar/            # User input area + send button
│   │   ├── ModelSelector/       # Model dropdown/modal
│   │   ├── Sidebar/             # Conversation history + menu
│   │   ├── Header/              # App title + settings
│   │   └── SettingsPanel/       # Model params, theme, etc.
│   ├── pages/
│   │   ├── ChatPage.jsx         # Main chat interface
│   │   └── SettingsPage.jsx     # Settings/preferences
│   ├── hooks/
│   │   ├── useChat.js           # Chat logic & API calls
│   │   ├── useModels.js         # Model fetching
│   │   └── useConversations.js  # Conversation management
│   ├── services/
│   │   ├── api.js               # Axios/Fetch wrapper for API
│   │   ├── ollama.js            # Ollama API client
│   │   └── websocket.js         # WebSocket handler
│   ├── store/                   # State management (Redux/Context)
│   │   ├── chatSlice.js
│   │   ├── modelSlice.js
│   │   └── store.js
│   ├── styles/
│   │   ├── variables.scss       # Carbon theme overrides
│   │   └── globals.scss
│   ├── App.jsx
│   ├── App.scss
│   └── index.js
├── package.json
├── .env.example
└── .gitignore

**Key Dependencies:**
- react, react-dom
- carbon-react (Carbon Design System)
- axios (API requests)
- react-markdown (Message rendering)
- zustand or redux (State management)
- react-router-dom (Navigation)
```

**Features:**
- ✅ Real-time chat with streaming responses
- ✅ Mobile-responsive layout (Carbon handles this)
- ✅ Model selection & switching mid-conversation
- ✅ Conversation history sidebar
- ✅ Settings for temperature, context length, etc.
- ✅ Dark/Light theme toggle (Carbon native)
- ✅ Message copying & regeneration

---

### 2.2 BACKEND (FastAPI + Python)
**Location:** `/backend`

**Project Structure:**
```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                  # FastAPI app initialization
│   ├── config.py                # Configuration & env vars
│   ├── models/                  # Pydantic models (schemas)
│   │   ├── __init__.py
│   │   ├── chat.py              # ChatRequest, ChatResponse
│   │   ├── model.py             # ModelInfo, ModelList
│   │   └── conversation.py      # Conversation, Message
│   ├── routes/                  # API endpoints
│   │   ├── __init__.py
│   │   ├── chat.py              # /api/chat/completions
│   │   ├── models.py            # /api/models
│   │   ├── conversations.py     # /api/conversations
│   │   ├── health.py            # /api/health
│   │   └── ws.py                # /ws/chat (WebSocket)
│   ├── services/                # Business logic
│   │   ├── __init__.py
│   │   ├── ollama_client.py     # Ollama API client
│   │   ├── chat_service.py      # Chat logic & streaming
│   │   ├── conversation_service.py
│   │   └── model_service.py
│   ├── database/                # Database & ORM
│   │   ├── __init__.py
│   │   ├── database.py          # SQLAlchemy setup
│   │   └── models.py            # SQLAlchemy models
│   ├── middleware/
│   │   ├── __init__.py
│   │   ├── cors.py              # CORS configuration
│   │   └── error_handler.py     # Global error handling
│   └── utils/
│       ├── __init__.py
│       ├── logger.py            # Logging setup
│       └── validators.py        # Input validation
├── tests/
│   ├── __init__.py
│   ├── test_chat.py
│   ├── test_models.py
│   └── conftest.py
├── .env.example
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── pytest.ini
└── README.md

**Key Dependencies:**
- fastapi
- uvicorn (ASGI server)
- python-dotenv
- sqlalchemy (ORM)
- pydantic (Data validation)
- httpx (Async HTTP client)
- aiosqlite (Async SQLite)
- websockets
```

**Key Endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat/completions` | Send message, get response (non-streaming) |
| GET | `/api/models` | List available Ollama models |
| GET | `/api/health` | Check Ollama & API health |
| WS | `/ws/chat` | WebSocket for streaming chat |
| POST | `/api/conversations` | Create new conversation |
| GET | `/api/conversations` | List user conversations |
| GET | `/api/conversations/{id}` | Get conversation with history |
| DELETE | `/api/conversations/{id}` | Delete conversation |
| POST | `/api/conversations/{id}/messages` | Add message to conversation |

---

### 2.3 OLLAMA (Docker Service)
**Docker Configuration:**

```yaml
# docker-compose.yml
version: '3.8'

services:
  ollama:
    image: ollama/ollama:latest
    container_name: ollama-service
    ports:
      - "11434:11434"
    volumes:
      - ollama_models:/root/.ollama
    environment:
      - OLLAMA_HOST=0.0.0.0:11434
    restart: unless-stopped

  backend:
    build: ./backend
    container_name: ai-chat-backend
    ports:
      - "8000:8000"
    depends_on:
      - ollama
    environment:
      - OLLAMA_BASE_URL=http://ollama:11434
      - DATABASE_URL=sqlite:///./chat.db
    volumes:
      - ./backend:/app
    restart: unless-stopped

  frontend:
    build: ./frontend
    container_name: ai-chat-frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend
    environment:
      - REACT_APP_API_URL=http://localhost:8000/api
      - REACT_APP_WS_URL=ws://localhost:8000/ws
    restart: unless-stopped

volumes:
  ollama_models:
```

**Ollama Interaction:**
- FastAPI calls Ollama's `/api/generate` endpoint for completions
- Ollama models: `mistral`, `neural-chat`, `llama2`, `vicuna`, `orca2`, etc.

---

## 3. DATA MODELS

### 3.1 Frontend State (Zustand/Redux)
```typescript
// Chat State
{
  messages: [
    {
      id: "msg-1",
      role: "user|assistant",
      content: string,
      timestamp: datetime,
      model: string
    }
  ],
  currentModel: "mistral",
  isLoading: boolean,
  error: string | null
}

// Models State
{
  availableModels: [
    { name: "mistral", size: "7B", loaded: true },
    { name: "llama2", size: "13B", loaded: false }
  ],
  selectedModel: "mistral"
}

// Conversations State
{
  conversations: [
    { id: "conv-1", title: "...", created_at, updated_at, message_count }
  ],
  currentConversationId: "conv-1"
}
```

### 3.2 Database Schema (SQLAlchemy)
```sql
-- Users (Optional, for future multi-user support)
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username VARCHAR UNIQUE,
  email VARCHAR UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Conversations
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  user_id INTEGER FOREIGN KEY,
  title VARCHAR DEFAULT "New Chat",
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP,
  archived BOOLEAN DEFAULT FALSE
);

-- Messages
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  conversation_id UUID FOREIGN KEY,
  role VARCHAR (user|assistant|system),
  content TEXT,
  model VARCHAR,
  tokens_used INTEGER,
  response_time_ms FLOAT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Model Preferences (Optional)
CREATE TABLE model_preferences (
  id INTEGER PRIMARY KEY,
  user_id INTEGER FOREIGN KEY,
  model_name VARCHAR,
  temperature FLOAT,
  top_p FLOAT,
  context_length INTEGER,
  created_at TIMESTAMP
);
```

---

## 4. API REQUEST/RESPONSE EXAMPLES

### 4.1 POST /api/chat/completions
**Request:**
```json
{
  "conversation_id": "conv-123",
  "message": "What is the capital of France?",
  "model": "mistral",
  "temperature": 0.7,
  "top_p": 0.9,
  "max_tokens": 512
}
```

**Response:**
```json
{
  "id": "msg-456",
  "conversation_id": "conv-123",
  "role": "assistant",
  "content": "The capital of France is Paris...",
  "model": "mistral",
  "tokens_used": 45,
  "response_time_ms": 2341,
  "created_at": "2026-04-21T18:10:16Z"
}
```

### 4.2 WebSocket /ws/chat (Streaming)
**Connection URL:** `ws://localhost:8000/ws/chat?conversation_id=conv-123&model=mistral`

**Server sends (chunks):**
```json
{
  "type": "token",
  "content": "The",
  "timestamp": "2026-04-21T18:10:16Z"
}
{
  "type": "token",
  "content": " capital"
}
...
{
  "type": "complete",
  "message_id": "msg-456",
  "total_tokens": 45,
  "response_time_ms": 2341
}
```

### 4.3 GET /api/models
**Response:**
```json
{
  "models": [
    {
      "name": "mistral",
      "size": "7.3B",
      "modified_at": "2026-04-21T10:00:00Z",
      "loaded": true,
      "vram_required_mb": 4096
    },
    {
      "name": "llama2",
      "size": "13B",
      "modified_at": "2026-04-20T15:30:00Z",
      "loaded": false,
      "vram_required_mb": 8192
    }
  ]
}
```

---

## 5. DEPLOYMENT & DOCKER SETUP

**Docker Compose:**
- Single command to spin up: `docker-compose up -d`
- Services auto-connect via internal Docker network
- Volumes persist Ollama models & database

**Access Points:**
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000`
- API Docs: `http://localhost:8000/docs` (Swagger UI)
- Ollama: `http://localhost:11434`

**Environment Variables:**
```
# Frontend (.env)
REACT_APP_API_URL=http://localhost:8000/api
REACT_APP_WS_URL=ws://localhost:8000/ws

# Backend (.env)
OLLAMA_BASE_URL=http://ollama:11434
DATABASE_URL=sqlite:///./chat.db
DEBUG=True
```

---

## 6. DATA FLOW DIAGRAM

### Scenario: User sends a message

```
1. User types message in React UI
   ↓
2. Frontend calls POST /api/chat/completions
   (with message, model, temperature, etc.)
   ↓
3. Backend creates Message record in DB
   ↓
4. Backend calls Ollama /api/generate endpoint
   (with model name + prompt)
   ↓
5. Ollama generates response (streaming or buffered)
   ↓
6. Backend streams back to Frontend via WebSocket OR
   returns full response in HTTP response
   ↓
7. Frontend displays response in real-time or all-at-once
   ↓
8. Backend saves assistant's response to DB
   ↓
9. Frontend updates UI with final message
```

---

## 7. FEATURE ROADMAP (Phase 1: MVP)

### Phase 1 (MVP)
- ✅ Chat interface with text input/output
- ✅ Model selection & switching
- ✅ Ollama integration
- ✅ Conversation history sidebar
- ✅ Streaming responses
- ✅ Mobile-responsive design
- ✅ Basic settings (temperature, max_tokens)
- ✅ Dark/Light theme

### Phase 2 (Enhancement)
- 🔲 User authentication & multi-user support
- 🔲 Prompt templates & presets
- 🔲 Message editing & regeneration
- 🔲 Conversation export (PDF, JSON)
- 🔲 Search conversations
- 🔲 API rate limiting
- 🔲 Persistent settings per user

### Phase 3 (Advanced)
- 🔲 Image upload support (if Ollama supports multimodal)
- 🔲 File upload & context injection
- 🔲 System prompt customization
- 🔲 Chat branching (conversation trees)
- 🔲 Analytics & usage metrics
- 🔲 Model fine-tuning interface

---

## 8. TECH STACK SUMMARY

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18+ | UI framework |
| | Carbon Design | Component library |
| | Axios/Fetch | HTTP client |
| | Zustand/Redux | State management |
| | SCSS/CSS3 | Styling |
| **Backend** | FastAPI | API framework |
| | Uvicorn | ASGI server |
| | SQLAlchemy | ORM |
| | Pydantic | Data validation |
| | WebSockets | Real-time communication |
| **Models** | Ollama | LLM runtime |
| | Mistral/LLama2/etc | LLM weights |
| **Database** | SQLite (dev) | Data persistence |
| | PostgreSQL (prod) | Production database |
| **DevOps** | Docker | Containerization |
| | Docker Compose | Orchestration |

---

## 9. KEY CONSIDERATIONS

### Security
- ✅ CORS properly configured (Frontend ↔ Backend)
- ✅ Input validation (Pydantic models)
- ✅ Rate limiting on API endpoints
- ✅ No credentials stored client-side
- ✅ HTTPS in production (nginx reverse proxy)

### Performance
- ✅ WebSocket for streaming (reduces latency)
- ✅ Async/await in FastAPI (non-blocking)
- ✅ Database indexing on conversation_id, user_id
- ✅ Lazy load models (Ollama only loads on demand)
- ✅ Frontend code-splitting & lazy component loading

### Scalability
- ✅ Stateless backend (scales horizontally)
- ✅ Database abstraction (SQLite → PostgreSQL)
- ✅ Microservice-ready (decouple frontend/backend)
- ✅ Model caching in Ollama

---

## 10. LOCAL DEVELOPMENT WORKFLOW

```bash
# Clone repo
git clone <repo>
cd fantastic-goggles

# Start services
docker-compose up -d

# Or run individually (development):
# Terminal 1: Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Terminal 2: Frontend
cd frontend
npm install
npm start

# Terminal 3: Ollama (if not Docker)
ollama serve

# Access:
# Frontend: http://localhost:3000
# Backend Docs: http://localhost:8000/docs
# Ollama: http://localhost:11434
```

---

## Summary

This architecture provides a **production-ready** foundation for a self-hosted AI chat application. The separation of concerns (Frontend → Backend → Ollama) ensures scalability, maintainability, and flexibility. FastAPI + React + Carbon delivers a modern, responsive UX while Docker ensures consistent deployment across environments.

**Next Step:** Begin implementation with Phase 1 MVP components.
