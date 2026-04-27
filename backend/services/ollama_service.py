import os
from typing import AsyncGenerator
import httpx

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")


async def get_available_models() -> list[dict]:
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
        resp.raise_for_status()
        data = resp.json()
        return data.get("models", [])


async def chat_completion(request_data: dict) -> dict:
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json=request_data,
        )
        resp.raise_for_status()
        return resp.json()


async def stream_chat(request_data: dict) -> AsyncGenerator[str, None]:
    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream("POST", f"{OLLAMA_BASE_URL}/api/chat", json=request_data) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                data_str = line.removeprefix("data: ").strip()
                if not data_str or data_str == "{}":
                    continue
                yield data_str
