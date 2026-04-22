"""
FastAPI backend for the Ollama Chat application.

Endpoints:
  - /api/health     - Health check
  - /api/status     - Ollama status and model list
  - /api/models     - Available Ollama models
  - /api/chat       - Non-streaming chat
  - /api/chat/stream - Streaming chat (SSE)
  - /api/conversations/* - CRUD for conversations
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect
from .database import engine, Base
from .routers import chat, conversations, health

app = FastAPI(title="Ollama Chat", version="0.1.0")

# CORS for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create tables on startup
Base.metadata.create_all(bind=engine)

app.include_router(health.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(conversations.router, prefix="/api/conversations")


@app.on_event("startup")
async def startup():
    """Verify database tables are created."""
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    print(f"Database tables: {tables}")


@app.get("/health")
async def root_health():
    return {"status": "ok"}
