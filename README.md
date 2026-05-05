# Ollama Chat

A local AI chat app with conversation history, streaming responses, and **RAG-powered codespace assistants** — everything runs on your machine, no cloud required.

**Stack:** FastAPI · React · MongoDB · Ollama · ChromaDB

---

## Prerequisites

| Tool | Version | Purpose |
| --- | --- | --- |
| [Ollama](https://ollama.com) | latest | Local LLM inference + embeddings |
| [MongoDB](https://www.mongodb.com/try/download/community) | 6+ | Conversation storage |
| Python | 3.11+ | Backend |
| Node.js | 18+ | Frontend |

---

## Quick start (local)

### 1. Clone and set up the Python environment

```bash
git clone <repo-url>
cd ollama-idea-test

python3 -m venv .ollama-test-venv
source .ollama-test-venv/bin/activate   # Windows: .ollama-test-venv\Scripts\activate

pip install -r backend/requirements.txt
```

### 2. Pull the models you need

```bash
# A chat model — swap for any model you have installed
ollama pull mistral

# The embedding model — REQUIRED for RAG / codespace assistants
ollama pull nomic-embed-text
```

> `nomic-embed-text` converts code and text into vectors so the assistant can
> find relevant snippets at query time. You only need to pull it once.

### 3. Start MongoDB

If MongoDB is installed locally it usually starts automatically. To start it manually:

```bash
# macOS (Homebrew)
brew services start mongodb-community

# Linux (systemd)
sudo systemctl start mongod
```

The backend defaults to `mongodb://localhost:27017`. Override with the `MONGODB_URL` env var if needed.

### 4. Start the backend

```bash
source .ollama-test-venv/bin/activate
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API is now available at `http://localhost:8000`.

### 5. Start the frontend

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## Using codespace assistants (RAG)

RAG (Retrieval-Augmented Generation) lets you create assistants that *know* a specific codebase. Instead of guessing, the model is shown the most relevant code snippets for every question you ask.

**How it works:**

1. **Index** — the backend walks your project directory, splits each file into overlapping chunks, embeds them with `nomic-embed-text`, and stores the vectors in ChromaDB on disk.
2. **Retrieve** — when you send a message, your question is embedded and the 5 closest chunks are fetched from ChromaDB using cosine similarity.
3. **Generate** — those chunks are injected as a system message before your question reaches the LLM, so it answers from real code.

**Steps:**

1. Make sure `nomic-embed-text` is pulled (step 2 above).
2. Click **Assistants** in the sidebar.
3. Click **New assistant** → enter a name and the absolute path to any local project.
4. Click **Index** on the assistant card and wait. Progress polls every 2.5 seconds. Indexing time depends on project size (typically 1–5 minutes).
5. Once status shows **Ready**, click **Open chat**.
6. Ask anything about the codebase — `how does auth work?`, `where is X defined?`, `explain this module`.

You can re-index at any time after making code changes.

---

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API endpoint |
| `MONGODB_URL` | `mongodb://localhost:27017` | MongoDB connection string |
| `MONGODB_DB` | `ollama-idea-test` | Database name |
| `EMBED_MODEL` | `nomic-embed-text` | Ollama model used for embeddings |
| `CHROMA_PATH` | `./chroma_db` | Where ChromaDB stores vector data on disk |

Create a `.env` file in the `backend/` directory to override any of these.

---

## Run with Docker Compose

```bash
docker compose up --build
```

| Service | URL |
| --- | --- |
| Frontend | `http://localhost:3000` |
| Backend API | `http://localhost:8000` |
| Ollama | `http://localhost:11434` |

> The Docker stack does not include an embedding model pull step.
> You'll still need to run `ollama pull nomic-embed-text` inside the Ollama container
> before using the codespace assistant indexing feature.

---

## Project structure

```text
ollama-idea-test/
├── backend/
│   ├── main.py                    # FastAPI app entry point
│   ├── database.py                # MongoDB connection + collections
│   ├── schemas.py                 # Pydantic request/response models
│   ├── requirements.txt
│   ├── routers/
│   │   ├── chat.py                # Streaming chat endpoints (RAG-aware)
│   │   ├── conversations.py       # Conversation CRUD
│   │   ├── assistants.py          # Codespace assistant CRUD + indexing
│   │   └── health.py              # Status + model list
│   └── services/
│       ├── ollama_service.py      # Ollama API client
│       ├── conversation_service.py
│       └── rag_service.py         # Chunking, embedding, ChromaDB retrieval
├── frontend/
│   ├── src/
│   │   ├── App.jsx                # Main app (chat view + navigation)
│   │   ├── AssistantsPage.jsx     # Codespace assistants workspace
│   │   ├── api.js                 # API client functions
│   │   └── index.scss             # Styles (Carbon Design System)
│   └── package.json
├── chroma_db/                     # ChromaDB vector store (auto-created on first index)
└── docker-compose.yml
```
