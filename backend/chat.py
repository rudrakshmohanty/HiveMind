from fastapi import APIRouter, HTTPException
import httpx
import os

router = APIRouter()
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")

@router.post("/chat")
async def chat_endpoint(payload: dict):
    prompt = payload.get("prompt")
    if not prompt:
        raise HTTPException(status_code=400, detail="'prompt' field is required")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={"model": "mistral", "messages": [{"role": "user", "content": prompt}], "stream": False},
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
            return {"response": data.get("message", {}).get("content", "")}
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
