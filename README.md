<p align="center">
  <img src="assets/logo2.png" alt="HiveMind" />
</p>

<h1 align="center">HiveMind</h1>
<p align="center"><strong>Your own private AI, running entirely on your computer.</strong></p>

<p align="center">
  HiveMind is a chat app powered by AI — like ChatGPT, but everything stays on your machine.<br/>
  No subscriptions, no cloud, no data sent anywhere. You own it completely.
</p>

<p align="center">
  <a href="https://fastapi.tiangolo.com"><img src="https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white" /></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black" /></a>
  <a href="https://www.mongodb.com"><img src="https://img.shields.io/badge/MongoDB-7-47A248?style=flat-square&logo=mongodb&logoColor=white" /></a>
  <a href="https://ollama.com"><img src="https://img.shields.io/badge/Ollama-local_LLM-black?style=flat-square" /></a>
  <a href="https://www.trychroma.com"><img src="https://img.shields.io/badge/ChromaDB-vector_store-FF6B35?style=flat-square" /></a>
  <img src="https://img.shields.io/badge/license-MIT-blueviolet?style=flat-square" />
  <img src="https://img.shields.io/badge/runs-100%25_local-success?style=flat-square" />
</p>

---

## Screenshots

> _Screenshots below show HiveMind running locally in both light and dark mode._

| Chat                                    | Assistants                                          |
| --------------------------------------- | --------------------------------------------------- |
| ![Chat view](assets/screenshots/chat.png) | ![Assistants page](assets/screenshots/assistants.png) |

| Code rendering                            | Model selector                               |
| ----------------------------------------- | -------------------------------------------- |
| ![Code blocks](assets/screenshots/code.png) | ![Model picker](assets/screenshots/models.png) |

---

## What makes HiveMind different

Most AI chat tools (ChatGPT, Claude, Gemini) live in the cloud — every message you type is sent to a company's server. HiveMind flips this. The AI model runs **directly on your computer** using [Ollama](https://ollama.com). Nothing leaves your device.

```
┌─────────────────────────────────────────────────────────────┐
│                        Your Machine                         │
│                                                             │
│   Browser  ──►  HiveMind  ──►  Ollama  ──►  AI Model        │
│              (FastAPI/React)              (Mistral, Llama…) │
│                    │                                        │
│                    ▼                                        │
│              MongoDB + ChromaDB                             │
│           (chats + file knowledge)                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Features

### 💬 Chat

- Streams responses token-by-token as the AI thinks — no waiting for a full reply
- Full conversation history, saved locally in MongoDB
- Rename any conversation inline in the sidebar
- Keyboard shortcuts: `⌘N` new chat · `⌘K` quick chat · `⌘,` settings

### 🤖 Model management

- Pull and switch between any model available in Ollama
- Models are grouped by category in the picker:| Category                           | Examples                    | Use for                        |
  | ---------------------------------- | --------------------------- | ------------------------------ |
  | **High** — thinking / heavy | DeepSeek-R, QwQ, large 70B+ | Complex reasoning, code review |
  | **Low** — fast / everyday   | Mistral, Phi-3, Gemma       | Quick questions, general chat  |
  | **Vision** — multimodal     | LLaVA, Moondream            | Questions about images         |
  | **RAG** — embedding only    | nomic-embed-text, mxbai     | Indexing (not for chatting)    |
- Attach images when using a vision model

### 🧠 Codespace Assistants (RAG)

- Create a named assistant and point it at any local folder
- HiveMind indexes every file — chunks it, embeds it, stores it in ChromaDB
- When you chat with an assistant, the most relevant passages are automatically injected as context
- **Smart re-indexing** — skips files that haven't changed (mtime + MD5 check), so re-index is fast even on large codebases
- **Add extra paths** — append additional directories to an existing assistant without re-indexing from scratch
- **Per-assistant preferred model** — pin a specific model to each assistant, auto-selected when you open that assistant's chat

### 🎨 Interface

- Soft brutalist design system: sharp corners, offset shadows, accent purple
- Light and dark mode
- Syntax-highlighted code blocks with copy button, language label, and font ligatures
- Full GFM Markdown rendering: tables, task lists, blockquotes, headings, inline code

---

## How RAG works

```
You ask: "How does the login system work?"
                    │
                    ▼
      Your question → embedding (pattern of numbers)
                    │
                    ▼
      ChromaDB finds the 8 most relevant
      passages from your indexed files
                    │
                    ▼
      AI reads those passages + your question
                    │
                    ▼
      Answers based on what's actually in your files
      — not guesswork
```

1. **Index** — HiveMind walks your folder, reads every file, splits content into overlapping chunks
2. **Embed** — each chunk is converted to a vector (via `nomic-embed-text`) that captures its meaning mathematically
3. **Store** — vectors + file metadata are persisted in ChromaDB
4. **Retrieve** — at query time, your question is embedded and the closest chunks are fetched
5. **Generate** — the LLM answers using retrieved context alongside your question

---

## Tech stack

### AI & models

| Tool                                                         | Role                                              |
| ------------------------------------------------------------ | ------------------------------------------------- |
| [Ollama](https://ollama.com)                                    | Runs any LLM locally — no internet needed        |
| [nomic-embed-text](https://ollama.com/library/nomic-embed-text) | Embedding model for RAG indexing                  |
| [ChromaDB](https://www.trychroma.com)                           | Vector database — stores and searches embeddings |

### Backend

| Tool                                   | Role                             |
| -------------------------------------- | -------------------------------- |
| [FastAPI](https://fastapi.tiangolo.com)   | REST + SSE API server            |
| [Uvicorn](https://www.uvicorn.org)        | ASGI server                      |
| [Pydantic](https://docs.pydantic.dev)     | Request/response validation      |
| [PyMongo](https://pymongo.readthedocs.io) | MongoDB driver                   |
| [MongoDB](https://www.mongodb.com)        | Conversation + assistant storage |

### Frontend

| Tool                                                                                                          | Role                                |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| [React 18](https://react.dev)                                                                                    | UI framework                        |
| [Vite](https://vitejs.dev)                                                                                       | Dev server + bundler                |
| [react-markdown](https://github.com/remarkjs/react-markdown) + [remark-gfm](https://github.com/remarkjs/remark-gfm) | Full GFM Markdown rendering         |
| [highlight.js](https://highlightjs.org)                                                                          | Syntax highlighting for code blocks |
| [Sass](https://sass-lang.com)                                                                                    | Custom design system styles         |
| [IBM Carbon](https://carbondesignsystem.com)                                                                     | Form inputs + icon library          |

---

## What you need

| Tool                   | What it does                   | Install                                                    |
| ---------------------- | ------------------------------ | ---------------------------------------------------------- |
| **Ollama**       | Runs AI models on your machine | [ollama.com](https://ollama.com)                              |
| **MongoDB**      | Stores chat history            | [mongodb.com](https://www.mongodb.com/try/download/community) |
| **Python 3.10+** | Powers the backend             | [python.org](https://www.python.org/downloads/)               |
| **Node.js 18+**  | Builds the frontend            | [nodejs.org](https://nodejs.org)                              |

---

## Setup

### 1 · Clone the repo

```bash
git clone https://github.com/rudrakshmohanty/hivemind.git
cd hivemind
```

### 2 · Install backend dependencies

```bash
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
```

### 3 · Pull AI models

```bash
ollama pull mistral              # chat model (swap for any you like)
ollama pull nomic-embed-text     # required for Codespace Assistants
```

### 4 · Start MongoDB

```bash
# macOS (Homebrew)
brew services start mongodb-community

# Linux
sudo systemctl start mongod
```

### 5 · Start the backend

```bash
source .venv/bin/activate
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

`Application startup complete.` means it's running. API docs are at `http://localhost:8000/docs`.

### 6 · Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open **[http://localhost:5173](http://localhost:5173)** — HiveMind is ready.

---

## Docker (one-command setup)

```bash
docker compose up --build
```

| Service     | URL                        |
| ----------- | -------------------------- |
| HiveMind    | `http://localhost:3000`  |
| Backend API | `http://localhost:8000`  |
| Ollama      | `http://localhost:11434` |

After starting, pull models inside the container:

```bash
docker exec -it ollama-service ollama pull mistral
docker exec -it ollama-service ollama pull nomic-embed-text
```

---

## Using Codespace Assistants

1. Click **Assistants** in the sidebar
2. Click **New assistant**, enter a name and the full path to your folder_(e.g. `/Users/you/projects/my-app`)_
3. Click **Index** on the assistant card and wait for it to finish
4. Once it shows **Ready**, click **Open chat**
5. Ask anything about the folder — the AI has actually read it

**Tips:**

- Re-click **Index** any time you add new files — smart indexing only re-processes changed files
- Use the **+** button on a card to add extra folders to an existing assistant
- Use the model picker on each card to pin a preferred model for that assistant

---

## Model guide

| Model         | Size | Good for                       | RAM    |
| ------------- | ---- | ------------------------------ | ------ |
| `phi3`      | 3.8B | Fast answers, low-end machines | ~4 GB  |
| `mistral`   | 7B   | Balanced, general purpose      | ~8 GB  |
| `llama3`    | 8B   | Strong reasoning               | ~8 GB  |
| `codellama` | 7B   | Code-heavy questions           | ~8 GB  |
| `gemma2`    | 9B   | High quality, well-rounded     | ~10 GB |
| `llava`     | 7B   | Image understanding (vision)   | ~8 GB  |

> Not sure? Start with `mistral`. Browse the full library at [ollama.com/library](https://ollama.com/library).

---

## Configuration

Create `backend/.env` to override defaults:

```env
OLLAMA_BASE_URL=http://localhost:11434
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB=hivemind
EMBED_MODEL=nomic-embed-text
CHROMA_PATH=./chroma_db
```

---

## Project structure

```
hivemind/
├── backend/
│   ├── main.py                      # FastAPI entry point
│   ├── database.py                  # MongoDB connection
│   ├── schemas.py                   # Pydantic models
│   ├── requirements.txt
│   ├── routers/
│   │   ├── chat.py                  # Streaming chat + RAG injection
│   │   ├── conversations.py         # Conversation CRUD + rename
│   │   ├── assistants.py            # Assistant CRUD, indexing, add-path
│   │   └── health.py                # Status + model list
│   └── services/
│       ├── ollama_service.py        # Ollama HTTP client
│       ├── conversation_service.py  # Persistence logic
│       └── rag_service.py           # Chunking, embedding, smart indexing
├── frontend/
│   ├── index.html                   # Google Fonts (Space Grotesk + JetBrains Mono)
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx                  # Root — chat, sidebar, model select, markdown
│       ├── AssistantsPage.jsx       # Assistants workspace
│       ├── api.js                   # API client
│       └── index.scss               # Design system (brutalist · purple accent)
├── assets/
├── docker-compose.yml
└── README.md
```

---

## Troubleshooting

**AI doesn't respond**
Run `ollama list` — you should see at least one model. If not: `ollama serve` then `ollama pull mistral`.

**Indexing fails**
Make sure `nomic-embed-text` is pulled: `ollama pull nomic-embed-text`.

**MongoDB error**
Start it manually (see Step 4). Download from [mongodb.com](https://www.mongodb.com/try/download/community) if not installed.

**"Cannot connect to backend"**
The backend needs to be running (Step 5). Restart it after rebooting.

---

## Contributing

1. Fork the repository
2. Create a branch: `git checkout -b feature/your-idea`
3. Commit your changes: `git commit -m 'what and why'`
4. Push: `git push origin feature/your-idea`
5. Open a pull request

Bug reports and feature ideas are welcome as issues.

---

## Acknowledgements

Built by [Rudraksh Mohanty](https://github.com/rudrakshmohanty) with [Claude](https://claude.ai) (Anthropic) - architecture and RAG pipeline design.

---

## License

[MIT](LICENSE) — free to use, modify, and distribute.
