"""
FastAPI backend for the Ollama‑chat MVP.

Endpoints:
  - /api/status  – Returns a health check of the Ollama container and the list of loaded models.
  - (other endpoints will be added later)
"""

import os
from fastapi import FastAPI
import httpx

app = FastAPI(title="Ollama Chat Backend")
import chat
app.include_router(chat.router, prefix="/api")

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")

@app.get("/api/status")
async def status() -> dict:
    """Health check that pings the Ollama container.

    It tries to fetch the list of available models from the Ollama API.
    Returns a JSON object with the overall status and the raw Ollama response.
    """
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=2)
            resp.raise_for_status()
            return {"status": "ok", "ollama_models": resp.json()}
        except httpx.HTTPError as exc:
            return {"status": "error", "detail": str(exc)}
        except Exception as exc:
            return {"status": "error", "detail": str(exc)}

# A simple health‑check endpoint that can be used by Kubernetes or other orchestrators.
@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
