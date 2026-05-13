from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
import asyncio
import time
import json
import httpx

try:
    from .. import schemas, database
    from ..services import conversation_service, ollama_service, rag_service
except ImportError:
    import schemas, database
    from services import conversation_service, ollama_service, rag_service

router = APIRouter()


def build_auto_title(message_text: str) -> str:
    cleaned = " ".join(message_text.strip().split())
    if not cleaned:
        return "New Chat"

    title = cleaned[:50]
    return f"{title.rstrip()}..." if len(title) < len(cleaned) else title


@router.post("/chat", response_model=schemas.MessageResponse)
async def send_chat(req: schemas.ChatRequest, db = Depends(database.get_db)):
    """Non-streaming chat endpoint."""
    model = req.model or "mistral"
    temperature = req.temperature
    top_p = req.top_p
    max_tokens = req.max_tokens
    message_text = req.message

    # Create conversation if needed
    conv_id = req.conversation_id
    if not conv_id:
        conv = conversation_service.create_conversation(
            db, title=message_text[:50] or "New Chat", model=model,
            temperature=temperature, top_p=top_p, max_tokens=max_tokens,
        )
        conv_id = conv["id"]
        # Update settings for first message
        conversation_service.conversations_collection.update_one(
            {"_id": conv_id},
            {"$set": {
                "temperature": temperature,
                "top_p": top_p,
                "max_tokens": max_tokens,
                "model_name": model,
            }},
        )
    else:
        conv = conversation_service.get_conversation(db, conv_id)
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")

    if conversation_service.should_autotitle_conversation(conv):
        conversation_service.update_conversation_title(db, conv_id, build_auto_title(message_text))
        conv = conversation_service.get_conversation(db, conv_id)

    # Get conversation history for context
    history_msgs = conversation_service.get_conversation_messages(db, conv_id)
    messages_history = [{"role": m["role"], "content": m["content"]} for m in history_msgs]

    # Call Ollama
    start_time = time.time()
    request_data = {
        "model": model,
        "messages": messages_history + [{"role": "user", "content": message_text}],
        "stream": False,
        "options": {
            "temperature": temperature,
            "top_p": top_p,
        },
    }

    try:
        result = await ollama_service.chat_completion(request_data)
        elapsed = (time.time() - start_time) * 1000
        content = result.get("message", {}).get("content", "")
        tokens_used = result.get("eval_count", 0)

        user_msg = conversation_service.add_message(
            db, conv_id, "user", message_text, model,
            response_time_ms=elapsed,
        )

        assistant_msg = conversation_service.add_message(
            db, conv_id, "assistant", content, model,
            tokens_used=tokens_used, response_time_ms=elapsed,
        )

        return schemas.MessageResponse(
            id=assistant_msg["id"],
            conversation_id=conv_id,
            role="assistant",
            content=content,
            model=model,
            tokens_used=tokens_used,
            response_time_ms=elapsed,
            created_at=assistant_msg["created_at"],
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ollama error: {str(e)}")


@router.get("/chat/stream")
async def send_chat_stream(request: Request):
    """Streaming chat endpoint.

    Query params: message, conversation_id, model, temperature, top_p, max_tokens
    """
    message_text = request.query_params.get("message", "")
    if not message_text:
        raise HTTPException(status_code=400, detail="'message' query parameter is required")

    conv_id = request.query_params.get("conversation_id")
    model = request.query_params.get("model", "mistral")
    temperature = float(request.query_params.get("temperature", 0.7))
    top_p = float(request.query_params.get("top_p", 0.9))

    # Create or look up conversation outside the generator
    # so we can return 404 without leaking the session
    if not conv_id:
        conv = conversation_service.create_conversation(
            database.db, title=message_text[:50] or "New Chat", model=model,
            temperature=temperature, top_p=top_p,
        )
        conv_id = conv["id"]
    else:
        conv = conversation_service.get_conversation(database.db, conv_id)
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")

    if conversation_service.should_autotitle_conversation(conv):
        conversation_service.update_conversation_title(db, conv_id, build_auto_title(message_text))
        conv = conversation_service.get_conversation(db, conv_id)

    # Get conversation history
    db = database.db
    history_msgs = conversation_service.get_conversation_messages(db, conv_id)
    messages_history = [{"role": m["role"], "content": m["content"]} for m in history_msgs]

    # Add user message
    conversation_service.add_message(db, conv_id, "user", message_text, model)

    request_data = {
        "model": model,
        "messages": messages_history + [{"role": "user", "content": message_text}],
        "stream": True,
        "options": {
            "temperature": temperature,
            "top_p": top_p,
        },
    }

    async def generate():
        content_buffer = []
        try:
            async for chunk in ollama_service.stream_chat(request_data):
                try:
                    chunk_json = json.loads(chunk)
                    delta = chunk_json.get("message", {}).get("content", "")
                    content_buffer.append(delta)
                    yield f"data: {json.dumps({'content': delta})}\n\n"
                except json.JSONDecodeError:
                    continue
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                yield f"data: {json.dumps({'error': f'Model not found: {model} — run `ollama pull {model}`'})}\n\n"
            else:
                yield f"data: {json.dumps({'error': f'Ollama error ({e.response.status_code}): {e.response.text[:200]}'})}\n\n"
        except httpx.ConnectError:
            yield f"data: {json.dumps({'error': 'Cannot connect to Ollama — run `ollama serve` in a terminal'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            full_response = "".join(content_buffer)
            if full_response:
                conversation_service.add_message(db, conv_id, "assistant", full_response, model)

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/chat/stream")
async def send_chat_stream_post(req: schemas.ChatRequest):
    """Streaming chat via POST."""
    conv_id = req.conversation_id
    model = req.model or "mistral"
    temperature = req.temperature
    top_p = req.top_p

    # Create or look up conversation outside the generator
    if not conv_id:
        conv = conversation_service.create_conversation(
            database.db, title=req.message[:50] or "New Chat", model=model,
            temperature=temperature, top_p=top_p,
        )
        conv_id = conv["id"]
    else:
        conv = conversation_service.get_conversation(database.db, conv_id)
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")

    # Get conversation history + add user message
    db = database.db
    history_msgs = conversation_service.get_conversation_messages(db, conv_id)
    messages_history = [{"role": m["role"], "content": m["content"]} for m in history_msgs]
    conversation_service.add_message(db, conv_id, "user", req.message, model)

    # ------------------------------------------------------------------
    # RAG CONTEXT INJECTION
    # If the request carries an assistant_id, retrieve the top-K most
    # relevant code chunks from that assistant's vector index and prepend
    # them as a system message.
    #
    # WHY A SYSTEM MESSAGE?
    # Ollama / most LLMs treat the "system" role as ground-truth context
    # the model should always respect. Putting the code there tells the
    # model: "answer based on this, not on what you were trained on."
    # ------------------------------------------------------------------
    messages_for_ollama = []

    if req.assistant_id:
        try:
            chunks, indexed_files = await asyncio.gather(
                rag_service.query_context(req.assistant_id, req.message),
                asyncio.to_thread(rag_service.get_indexed_files, req.assistant_id),
            )
            assistant_doc = database.assistants_collection.find_one({"_id": req.assistant_id})
            project_name = assistant_doc.get("name", "the project") if assistant_doc else "the project"

            file_manifest = "\n".join(f"  - {f}" for f in indexed_files) if indexed_files else "  (none)"
            context_text = "\n\n---\n\n".join(chunks) if chunks else "(no relevant snippets found)"

            messages_for_ollama.append({
                "role": "system",
                "content": (
                    f"You are a coding assistant for '{project_name}'.\n\n"
                    f"INDEXED FILES ({len(indexed_files)} total):\n{file_manifest}\n\n"
                    "RETRIEVED CODE SNIPPETS (most relevant to the current query):\n\n"
                    f"{context_text}\n\n"
                    "Instructions: answer based on the code above. Always mention the file path "
                    "when referencing specific code. If the answer isn't in the snippets, say so."
                ),
            })
        except Exception:
            pass

    user_msg: dict = {"role": "user", "content": req.message}
    if req.images:
        user_msg["images"] = req.images
    messages_for_ollama.extend(messages_history + [user_msg])

    request_data = {
        "model": model,
        "messages": messages_for_ollama,
        "stream": True,
        "options": {"temperature": temperature, "top_p": top_p},
    }

    async def generate():
        content_buffer = []
        try:
            async for chunk in ollama_service.stream_chat(request_data):
                try:
                    chunk_json = json.loads(chunk)
                    delta = chunk_json.get("message", {}).get("content", "")
                    content_buffer.append(delta)
                    yield f"data: {json.dumps({'content': delta})}\n\n"
                except json.JSONDecodeError:
                    continue
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                yield f"data: {json.dumps({'error': f'Model not found: {model} — run `ollama pull {model}`'})}\n\n"
            else:
                yield f"data: {json.dumps({'error': f'Ollama error ({e.response.status_code}): {e.response.text[:200]}'})}\n\n"
        except httpx.ConnectError:
            yield f"data: {json.dumps({'error': 'Cannot connect to Ollama — run `ollama serve` in a terminal'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            full_response = "".join(content_buffer)
            if full_response:
                conversation_service.add_message(db, conv_id, "assistant", full_response, model)

    return StreamingResponse(generate(), media_type="text/event-stream")
