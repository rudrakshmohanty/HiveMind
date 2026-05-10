"""
FastAPI backend for HiveMind.

Endpoints:
    - /api/health      - Health check
    - /api/status      - Ollama status and model list
    - /api/models      - Available Ollama models
    - /api/chat        - Non-streaming chat
    - /api/chat/stream - Streaming chat (SSE)
    - /api/conversations/* - CRUD for conversations
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:
    from .database import ensure_indexes
    from .routers import assistants, chat, conversations, health
except ImportError:
    from database import ensure_indexes
    from routers import assistants, chat, conversations, health

app = FastAPI(title="HiveMind", version="0.1.0")

# CORS for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(conversations.router, prefix="/api/conversations")
app.include_router(assistants.router, prefix="/api/assistants")


@app.on_event("startup")
async def startup():
    """Create MongoDB indexes used by the chat history queries."""
    ensure_indexes()
    print("MongoDB indexes ensured")


@app.get("/health")
async def root_health():
    return {"status": "ok"}
