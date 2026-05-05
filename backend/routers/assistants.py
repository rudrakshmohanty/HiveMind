"""
Assistants router — manages codespace assistants.

An "assistant" is a named bot backed by a RAG index of a specific codebase.
You create one, point it at a local directory, hit "Index", and then every
chat message sent with that assistant_id automatically gets relevant code
chunks injected as context before reaching the LLM.

Endpoints:
  GET    /api/assistants                     list all assistants
  POST   /api/assistants                     create a new assistant
  GET    /api/assistants/{id}                get one assistant
  DELETE /api/assistants/{id}                delete assistant + vector index
  POST   /api/assistants/{id}/index          trigger (re-)indexing
  GET    /api/assistants/{id}/index/status   poll indexing progress
"""

import asyncio
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

try:
    from .. import database, schemas
    from ..services import rag_service
except ImportError:
    import database
    import schemas
    from services import rag_service

router = APIRouter()

# ---------------------------------------------------------------------------
# In-memory state
# ---------------------------------------------------------------------------
# _index_status: live progress dict the frontend polls
#   { assistant_id: { status, indexed_files, total_files, total_chunks, percent } }
#
# _index_tasks: the asyncio.Task for each running index job.
#   Storing the Task lets us call .cancel() immediately when an assistant is
#   deleted — the CancelledError propagates through every `await` inside
#   rag_service.index_codebase (including the httpx embedding calls) so
#   indexing stops within one network round-trip.

_index_status: dict[str, dict] = {}
_index_tasks:  dict[str, asyncio.Task] = {}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _serialize(doc: dict) -> dict:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    return doc


async def _cancel_task(assistant_id: str) -> None:
    """Cancel a running index task and wait for it to finish cleaning up."""
    task = _index_tasks.pop(assistant_id, None)
    if task and not task.done():
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("", response_model=list[schemas.AssistantInfo])
async def list_assistants():
    docs = list(database.assistants_collection.find().sort("created_at", -1))
    results = []
    for doc in docs:
        item = _serialize(doc)
        if item["id"] in _index_status:
            item["index_status"] = _index_status[item["id"]].get("status", item["index_status"])
        results.append(item)
    return results


@router.post("", response_model=schemas.AssistantInfo, status_code=201)
async def create_assistant(req: schemas.AssistantCreateRequest):
    """Create a new assistant. Indexing is NOT triggered here — call /index."""
    assistant_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    doc = {
        "_id": assistant_id,
        "name": req.name,
        "description": req.description or "",
        "codebase_path": req.codebase_path,
        "indexed_files": 0,
        "total_chunks": 0,
        "index_status": "not_indexed",
        "last_indexed": None,
        "created_at": now,
        "updated_at": now,
    }
    database.assistants_collection.insert_one(doc)
    return _serialize(doc)


@router.get("/{assistant_id}", response_model=schemas.AssistantInfo)
async def get_assistant(assistant_id: str):
    doc = database.assistants_collection.find_one({"_id": assistant_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Assistant not found")
    result = _serialize(doc)
    if assistant_id in _index_status:
        result["index_status"] = _index_status[assistant_id].get("status", result["index_status"])
    return result


@router.delete("/{assistant_id}")
async def delete_assistant(assistant_id: str):
    """
    Delete the assistant and its vector index.

    If indexing is in progress we cancel the asyncio Task first.
    The CancelledError propagates through every `await` in the indexing
    pipeline so it stops within one Ollama embedding call — typically < 1 s.
    """
    doc = database.assistants_collection.find_one({"_id": assistant_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Assistant not found")

    # Stop indexing immediately if it's running
    await _cancel_task(assistant_id)

    database.assistants_collection.delete_one({"_id": assistant_id})
    rag_service.delete_collection(assistant_id)
    _index_status.pop(assistant_id, None)

    return {"deleted": assistant_id}


@router.post("/{assistant_id}/index")
async def trigger_index(assistant_id: str):
    """
    Start (re-)indexing in the background via asyncio.create_task.

    We use create_task (not FastAPI BackgroundTasks) because it gives us
    a Task handle we can .cancel() later. Returns immediately; client polls
    GET /{id}/index/status for live progress.
    """
    doc = database.assistants_collection.find_one({"_id": assistant_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Assistant not found")

    # If already indexing, cancel it first (supports re-index while running)
    await _cancel_task(assistant_id)

    _index_status[assistant_id] = {
        "status": "indexing",
        "indexed_files": 0,
        "total_files": 0,
        "total_chunks": 0,
        "percent": 0,
    }
    database.assistants_collection.update_one(
        {"_id": assistant_id},
        {"$set": {"index_status": "indexing", "updated_at": datetime.now(timezone.utc)}},
    )

    task = asyncio.create_task(_run_indexing(assistant_id, doc["codebase_path"]))
    _index_tasks[assistant_id] = task

    return {"status": "indexing"}


@router.get("/{assistant_id}/index/status")
async def get_index_status(assistant_id: str):
    """Return live progress while indexing, or the final DB state when done."""
    if assistant_id in _index_status:
        return _index_status[assistant_id]

    doc = database.assistants_collection.find_one({"_id": assistant_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Assistant not found")

    return {
        "status": doc.get("index_status", "not_indexed"),
        "indexed_files": doc.get("indexed_files", 0),
        "total_files": doc.get("indexed_files", 0),
        "total_chunks": doc.get("total_chunks", 0),
        "percent": 100 if doc.get("index_status") == "ready" else 0,
    }


# ---------------------------------------------------------------------------
# Indexing task
# ---------------------------------------------------------------------------

async def _run_indexing(assistant_id: str, codebase_path: str) -> None:
    """
    Runs as an asyncio Task so it can be cancelled at any await point.

    Progress callback updates _index_status after each file so the frontend
    sees live file counts and a percentage when it polls.
    """
    try:
        def on_progress(indexed: int, total: int, chunks: int) -> None:
            _index_status[assistant_id] = {
                "status": "indexing",
                "indexed_files": indexed,
                "total_files": total,
                "total_chunks": chunks,
                "percent": round(indexed / total * 100) if total > 0 else 0,
            }

        result = await rag_service.index_codebase(
            assistant_id, codebase_path, on_progress=on_progress
        )

        now = datetime.now(timezone.utc)
        database.assistants_collection.update_one(
            {"_id": assistant_id},
            {"$set": {
                "indexed_files": result["indexed_files"],
                "total_chunks": result["total_chunks"],
                "index_status": "ready",
                "last_indexed": now,
                "updated_at": now,
            }},
        )
        _index_status[assistant_id] = {
            "status": "ready",
            "indexed_files": result["indexed_files"],
            "total_files": result["total_files"],
            "total_chunks": result["total_chunks"],
            "percent": 100,
        }

    except asyncio.CancelledError:
        # Task was cancelled (e.g. assistant deleted while indexing).
        # Clean up our status entry and let the cancellation propagate normally.
        _index_status.pop(assistant_id, None)
        raise

    except Exception as exc:
        database.assistants_collection.update_one(
            {"_id": assistant_id},
            {"$set": {"index_status": "error", "updated_at": datetime.now(timezone.utc)}},
        )
        _index_status[assistant_id] = {"status": "error", "message": str(exc)}

    finally:
        _index_tasks.pop(assistant_id, None)
