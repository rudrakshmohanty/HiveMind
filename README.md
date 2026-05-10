# HiveMind

**Your own private AI, running entirely on your computer.**

HiveMind is a chat app powered by AI — like ChatGPT, but everything stays on your machine. No subscriptions, no cloud, no data sent anywhere. You own it completely.

The real superpower: you can teach HiveMind about *your own projects*. Point it at a codebase, a folder of documents, or any local files — and it will actually read and understand them before answering your questions.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://www.mongodb.com)
[![Ollama](https://img.shields.io/badge/Ollama-local_LLM-black?style=flat-square)](https://ollama.com)
[![ChromaDB](https://img.shields.io/badge/ChromaDB-vector_store-FF6B35?style=flat-square)](https://www.trychroma.com)

---

## Why HiveMind?

Most AI chat tools (ChatGPT, Claude, Gemini) live in the cloud. Every message you type is sent to a company's server, processed there, and sent back. That works — but it means your conversations and files leave your device.

HiveMind flips this. The AI model runs directly on your own computer using a free tool called [Ollama](https://ollama.com). Nothing is transmitted. It's yours.

**What you get:**

- Chat with an AI model that runs locally — no internet connection needed once set up
- Your conversations are saved and searchable, like a chat history
- Create "assistants" that have actually read your files, so they can answer specific questions about them
- Switch between different AI models (think of models like different experts — some are faster, some are smarter, some specialize in code)

---

## What can I use it for?

Here are some real examples of what people use HiveMind for:

- **Ask questions about a codebase** — "What does the login system do?" or "Where is the payment logic?"
- **Summarize documents** — point it at a folder of PDFs or notes and ask "What are the key themes here?"
- **Private journaling assistant** — chat with an AI without anything leaving your computer
- **Learning tool** — ask it to explain confusing concepts from your own study materials
- **Developer productivity** — get answers about a project without having to paste code into ChatGPT

---

## How it works (plain English)

HiveMind has two main parts:

### 1. Regular chat

You open the app, pick an AI model, and start chatting. It streams responses back to you token by token — you see the words appear as the AI "thinks", rather than waiting for a complete response. Your conversation history is automatically saved.

### 2. Codespace Assistants (the smart part)

This is what makes HiveMind special.

Imagine you have a big project folder with hundreds of files. You want to ask the AI questions about it — but you can't paste the whole thing into a chat box.

HiveMind solves this by **indexing** your folder first. Here's what that means in simple steps:

1. **Reading** — HiveMind walks through every file in your folder and reads them
2. **Chunking** — it breaks the content into small overlapping pieces (like cutting a book into passages)
3. **Understanding** — each piece is converted into a set of numbers that captures its meaning (this is called an *embedding*)
4. **Storing** — all those number-sets are stored in a fast lookup database (ChromaDB)

Later, when you ask a question:

1. Your question is also converted into numbers the same way
2. HiveMind searches the database for the passages whose numbers are closest to your question's numbers
3. Those passages are shown to the AI *alongside* your question
4. The AI answers using that real context — not guesswork

```text
You ask: "How does the login system work?"
                    │
                    ▼
      Converted into a pattern of numbers
                    │
                    ▼
      HiveMind finds the 5 most relevant
      passages from your files
                    │
                    ▼
      AI reads those passages + your question
                    │
                    ▼
      AI answers based on what's actually in your files
```

This technique is called **RAG** (Retrieval-Augmented Generation) — a fancy name for "look things up before answering."

---

## Technologies used

HiveMind is built on a carefully chosen set of open-source technologies. Here's what each one is and why it's in the project:

### AI Concepts & Techniques

**RAG — Retrieval-Augmented Generation**
The core technique behind Codespace Assistants. Instead of asking the AI to answer from memory (which leads to guessing or hallucination), RAG first *retrieves* relevant passages from your actual files, then feeds them to the AI alongside your question. The result is answers grounded in real content. HiveMind implements RAG entirely locally — no data leaves your machine.

**LLM — Large Language Model**
The AI "brain" that generates responses. LLMs are trained on huge amounts of text and learn to predict and generate human-like language. In HiveMind, the LLM runs locally via Ollama — models like Mistral, LLaMA 3, and Phi-3 are all LLMs you can use.

**Embeddings**
A way of converting text into a list of numbers that captures its meaning. Two pieces of text that mean similar things will produce numbers that are mathematically close together. HiveMind uses embeddings to understand both your files (during indexing) and your questions (at query time), so it can find the most relevant content even if the exact words don't match.

**Vector Search / Cosine Similarity**
When you ask a question, HiveMind converts it into numbers (an embedding) and then searches for the file chunks whose numbers are closest — this is vector search. "Closest" is measured using cosine similarity, a mathematical formula that finds how similar two sets of numbers are regardless of their size. This is how HiveMind finds the most relevant passages without doing a simple keyword search.

**Streaming (Server-Sent Events)**
Rather than waiting for the AI to finish its entire response and sending it all at once, HiveMind streams tokens (words or word-pieces) back to the browser as they're generated. This is done using Server-Sent Events (SSE), a web standard for pushing data from server to browser in real time. It's what makes responses feel live rather than delayed.

**Text Chunking**
When indexing a project, HiveMind can't store entire files as single embeddings — the meaning becomes too diluted. Instead, files are split into small overlapping passages (chunks). Each chunk gets its own embedding. Overlapping ensures context isn't lost at the boundaries between chunks.

---

### AI & Models

**[Ollama](https://ollama.com)**
The engine that runs AI models locally on your computer. Think of it like a container that packages large language models (LLMs) so they can run without internet access. HiveMind talks to Ollama to send your messages and receive responses.

**[nomic-embed-text](https://ollama.com/library/nomic-embed-text)**
A specialized AI model that doesn't chat — it converts text into patterns of numbers called *embeddings*. These numbers represent the meaning of text in a way computers can compare mathematically. HiveMind uses it to understand and index your files for the Codespace Assistants feature.

**[ChromaDB](https://www.trychroma.com)**
A vector database — a special kind of database designed to store and search embeddings. When HiveMind indexes your files, it stores all the embeddings in ChromaDB. At query time, ChromaDB finds the passages most semantically similar to your question in milliseconds.

---

### Backend

**[Python](https://www.python.org)**
The programming language the backend is written in. Python is widely used in AI and data work, which makes it a natural fit here.

**[FastAPI](https://fastapi.tiangolo.com)**
A modern Python web framework used to build the API (Application Programming Interface) — the set of endpoints that the frontend calls to send messages, load conversations, and trigger indexing. FastAPI is fast, easy to read, and automatically generates interactive documentation.

**[Uvicorn](https://www.uvicorn.org)**
The server that runs the FastAPI application. It handles incoming requests and routes them to the right place.

**[Pydantic](https://docs.pydantic.dev)**
A Python library used for data validation. It ensures that the data flowing between the frontend and backend is always in the right shape and type.

**[PyMongo](https://pymongo.readthedocs.io)**
The official Python driver for MongoDB — the library that lets the backend read and write conversations to the database.

**[python-dotenv](https://pypi.org/project/python-dotenv)**
Loads configuration from a `.env` file so you can customize settings (like the database URL) without changing the source code.

---

### Frontend

**[React](https://react.dev)**
A JavaScript library for building user interfaces. The entire HiveMind UI — the chat panel, sidebar, assistant pages — is built as React components. React makes it easy to build interactive, dynamic interfaces that update in real time.

**[Vite](https://vitejs.dev)**
The build tool that compiles and serves the React frontend during development and packages it for production. It's fast and has minimal configuration.

**[IBM Carbon Design System](https://carbondesignsystem.com)**
A professional, open-source design system from IBM that provides the UI components (buttons, inputs, selects, icons) used throughout HiveMind. It ensures the interface is consistent, accessible, and polished without building everything from scratch.

**[react-markdown](https://github.com/remarkjs/react-markdown)**
A React component that renders Markdown text as formatted HTML. This is how AI responses that include headings, bold text, bullet points, and code blocks are displayed properly in the chat.

**[Sass](https://sass-lang.com)**
A CSS preprocessor used to write the custom styles for HiveMind. It extends regular CSS with features like variables and nesting, making stylesheets easier to maintain.

---

### Database & Storage

**[MongoDB](https://www.mongodb.com)**
A document database that stores all your conversations and messages. Unlike traditional row-and-column databases, MongoDB stores data as flexible JSON-like documents — well suited for chat history where each conversation can have a variable number of messages.

**ChromaDB** *(also listed above)*
Handles the vector storage side — all the indexed embeddings from your codespace assistants live here, persisted to disk in the `chroma_db/` folder.

---

### Infrastructure

**[Docker Compose](https://docs.docker.com/compose)**
A tool for defining and running multi-container applications. The `docker-compose.yml` file in this repo describes all four services (Ollama, MongoDB, backend, frontend) so the entire stack can be started with one command.

---

## What you need before starting

You don't need to be a developer to use HiveMind, but you do need to install a few tools. Here's what each one does:

| Tool | What it does | Install link |
| --- | --- | --- |
| **Ollama** | Runs the AI model on your computer | [ollama.com](https://ollama.com) |
| **MongoDB** | Saves your chat history (like a local database) | [mongodb.com](https://www.mongodb.com/try/download/community) |
| **Python 3.11+** | Runs the backend (the behind-the-scenes engine) | [python.org](https://www.python.org/downloads/) |
| **Node.js 18+** | Runs the frontend (the visual interface in your browser) | [nodejs.org](https://nodejs.org) |

> **Not a developer?** Think of Ollama as the "engine" that runs AI models, MongoDB as a filing cabinet for your chats, Python as what powers the server behind the scenes, and Node.js as what builds the website you look at.

---

## Setup guide (step by step)

### Step 1 — Download HiveMind

Open a terminal and run:

```bash
git clone https://github.com/rudrakshmohanty/hivemind.git
cd hivemind
```

> Don't have `git`? You can also click the green **Code** button at the top of this page and choose **Download ZIP**, then unzip it.

### Step 2 — Set up the Python environment

This creates an isolated workspace for HiveMind's backend so it doesn't interfere with anything else on your computer:

```bash
python3 -m venv .venv
source .venv/bin/activate        # On Windows: .venv\Scripts\activate

pip install -r backend/requirements.txt
```

> The last line installs all the Python packages HiveMind needs — kind of like installing apps from an app store, but for code libraries.

### Step 3 — Download the AI models

Ollama lets you download different AI models, similar to how you'd download different apps. Run:

```bash
# Download a chat model (you can swap this for any model you like)
ollama pull mistral

# Download the embedding model — needed for Codespace Assistants
ollama pull nomic-embed-text
```

> **What's `nomic-embed-text`?** This is a special model that doesn't chat — instead, it converts text into patterns of numbers (embeddings). HiveMind uses it to understand the meaning of your files when building an assistant. You only download it once.

### Step 4 — Start MongoDB

MongoDB is your chat history database. It usually starts automatically after installation. If it doesn't:

```bash
# macOS (if installed via Homebrew)
brew services start mongodb-community

# Linux
sudo systemctl start mongod
```

> On Windows, MongoDB runs as a background service and should start on its own.

### Step 5 — Start the backend

The backend is the server that handles all the AI logic. In a terminal:

```bash
source .venv/bin/activate
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

You should see something like `Application startup complete.` — that means it's running.

> The backend runs at `http://localhost:8000`. You can visit `http://localhost:8000/docs` in your browser to see all the available API endpoints (useful if you're a developer).

### Step 6 — Start the frontend

Open a **new** terminal window (keep the backend running in the first one):

```bash
cd frontend
npm install
npm run dev
```

Now open [http://localhost:3000](http://localhost:3000) in your browser. HiveMind is ready.

---

## Using Codespace Assistants

This is the feature that lets you chat with an AI that has actually read your files.

### Before you start

Make sure you've downloaded `nomic-embed-text` (Step 3). Without it, indexing won't work.

### Creating an assistant

1. In the HiveMind sidebar, click **Assistants**
2. Click **New assistant**
3. Give it a name (e.g. "My React Project" or "Work Notes")
4. Enter the **full path** to the folder you want it to learn

   > A full path looks like `/Users/yourname/Documents/myproject` on Mac/Linux, or `C:\Users\yourname\Documents\myproject` on Windows.

5. Click **Save**, then click **Index** on the assistant card
6. Wait for indexing to finish. A small project takes under a minute; a large codebase might take 5–10 minutes. You'll see the status update automatically.
7. Once it says **Ready**, click **Open chat**

### What to ask

Once your assistant is ready, you can ask it anything about the folder you pointed it at:

- *"Give me an overview of this project"*
- *"How does the user authentication work?"*
- *"What files are responsible for sending emails?"*
- *"Explain the main function to me like I'm 12"*
- *"What are the most complex parts of this codebase?"*

### Re-indexing

If you add new files or make big changes to the project, click **Index** again. HiveMind will re-read everything and update its knowledge.

---

## Running with Docker (easier setup)

If you know what Docker is, you can run the entire HiveMind stack with one command — no need to install Python, MongoDB, or Node.js manually:

```bash
docker compose up --build
```

| Service | Address |
| --- | --- |
| HiveMind (frontend) | `http://localhost:3000` |
| Backend API | `http://localhost:8000` |
| Ollama | `http://localhost:11434` |

> **After starting Docker**, you still need to pull the models manually inside the Ollama container:
>
> ```bash
> docker exec -it ollama-service ollama pull mistral
> docker exec -it ollama-service ollama pull nomic-embed-text
> ```

---

## Choosing an AI model

When you first open HiveMind, you'll pick which AI model to chat with. Think of models like hiring different people for the same job — they have different strengths and require different amounts of resources.

| Model | Size | Best for | RAM needed |
| --- | --- | --- | --- |
| `phi3` | 3.8B | Low-end machines, quick answers | ~4 GB |
| `mistral` | 7B | Balanced, general purpose | ~8 GB |
| `llama3` | 8B | Strong reasoning, nuanced answers | ~8 GB |
| `codellama` | 7B | Code-heavy questions | ~8 GB |
| `gemma2` | 9B | High quality, well-rounded | ~10 GB |

> **Not sure which to pick?** Start with `mistral`. It's fast and handles most tasks well. You can always switch.
>
> Browse the full model library at [ollama.com/library](https://ollama.com/library).

---

## Configuration (advanced)

You can customize HiveMind by creating a file called `.env` inside the `backend/` folder. This file lets you change things like which database to use or where files are stored.

```env
OLLAMA_BASE_URL=http://localhost:11434
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB=hivemind
EMBED_MODEL=nomic-embed-text
CHROMA_PATH=./chroma_db
```

| Setting | Default | What it controls |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Where HiveMind looks for Ollama |
| `MONGODB_URL` | `mongodb://localhost:27017` | Where your chat history is stored |
| `MONGODB_DB` | `hivemind` | The name of the database |
| `EMBED_MODEL` | `nomic-embed-text` | Which model converts text to embeddings |
| `CHROMA_PATH` | `./chroma_db` | Where the assistant knowledge is stored on disk |

> Most users never need to touch this file. Only change it if you know what you're doing or if the defaults conflict with something else on your system.

---

## Project structure (for developers)

```text
hivemind/
├── backend/
│   ├── main.py                     # FastAPI app entry point
│   ├── database.py                 # MongoDB connection + collections
│   ├── schemas.py                  # Pydantic request / response models
│   ├── requirements.txt            # Python dependencies
│   ├── routers/
│   │   ├── chat.py                 # Streaming chat endpoints (RAG-aware)
│   │   ├── conversations.py        # Conversation CRUD
│   │   ├── assistants.py           # Codespace assistant CRUD + indexing
│   │   └── health.py               # Status + available model list
│   └── services/
│       ├── ollama_service.py       # Ollama HTTP client (chat + embeddings)
│       ├── conversation_service.py # Conversation persistence logic
│       └── rag_service.py          # File chunking, embedding, ChromaDB retrieval
├── frontend/
│   ├── src/
│   │   ├── App.jsx                 # Root component — chat view + navigation
│   │   ├── AssistantsPage.jsx      # Codespace assistants workspace
│   │   ├── api.js                  # API client
│   │   └── index.scss              # Global styles (Carbon Design System)
│   ├── package.json
│   └── vite.config.js
├── docker-compose.yml
└── README.md
```

**Tech stack:** React 18 · Vite · IBM Carbon Design System · FastAPI · Uvicorn · Pydantic · MongoDB · ChromaDB · Ollama

---

## Troubleshooting

**The app loads but the AI doesn't respond**
Make sure Ollama is running. Open a terminal and run `ollama list` — you should see at least one model. If Ollama isn't running, start it with `ollama serve`.

**Indexing gets stuck or fails**
Make sure you've pulled `nomic-embed-text` with `ollama pull nomic-embed-text`. This model is required for indexing to work.

**MongoDB connection error**
Start MongoDB manually using the command for your OS in Step 4. If MongoDB isn't installed, download it from [mongodb.com](https://www.mongodb.com/try/download/community).

**The frontend says "cannot connect to backend"**
Make sure the backend is still running (Step 5). Each time you restart your computer, you'll need to start the backend again.

---

## Contributing

All contributions are welcome — whether it's a bug report, a feature idea, or a pull request.

1. Fork this repository
2. Create a branch: `git checkout -b feature/your-idea`
3. Make your changes and commit: `git commit -m 'describe what you did'`
4. Push it: `git push origin feature/your-idea`
5. Open a pull request and describe what you changed and why

---

## Acknowledgements

HiveMind was built by [Rudraksh Mohanty](https://github.com/rudrakshmohanty) with help and suggestions from [Claude](https://claude.ai) (Anthropic's AI assistant).

Claude assisted throughout the development process — from architectural decisions and debugging, to writing documentation and thinking through the RAG pipeline design. This project is a good example of what's possible when a developer and an AI work closely together.

---

## License

[MIT](LICENSE) — free to use, modify, and distribute.
