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
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

try:
    from .database import ensure_indexes
    from .routers import assistants, chat, conversations, health
except ImportError:
    from database import ensure_indexes
    from routers import assistants, chat, conversations, health

app = FastAPI(title="HiveMind", version="0.1.0")


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    msgs = [f"{'.'.join(str(l) for l in e['loc'])}: {e['msg']}" for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": "; ".join(msgs)})


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": f"Unexpected server error: {str(exc)}"})


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
