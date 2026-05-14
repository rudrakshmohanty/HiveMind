import uuid
from datetime import datetime
from typing import Optional

try:
    from ..database import conversations_collection, messages_collection
except ImportError:
    from database import conversations_collection, messages_collection


def _serialize_conversation(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "title": doc.get("title", "New Chat"),
        "model_name": doc.get("model_name", "mistral"),
        "temperature": doc.get("temperature", 0.7),
        "top_p": doc.get("top_p", 0.9),
        "max_tokens": doc.get("max_tokens", 512),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
        "archived": doc.get("archived", False),
        "assistant_id": doc.get("assistant_id"),
        "assistant_name": doc.get("assistant_name"),
        "user_id": doc.get("user_id"),
    }


def _serialize_message(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "conversation_id": doc.get("conversation_id"),
        "role": doc.get("role"),
        "content": doc.get("content", ""),
        "model": doc.get("model", "mistral"),
        "tokens_used": doc.get("tokens_used", 0),
        "response_time_ms": doc.get("response_time_ms"),
        "created_at": doc.get("created_at"),
    }


def create_conversation(db, title: str = "New Chat", model: str = "mistral",
                        temperature: float = 0.7, top_p: float = 0.9, max_tokens: int = 512,
                        assistant_id: Optional[str] = None, assistant_name: Optional[str] = None,
                        user_id: Optional[str] = None) -> dict:
    conv_id = str(uuid.uuid4())
    now = datetime.utcnow()
    conv_doc = {
        "_id": conv_id,
        "title": title,
        "model_name": model,
        "temperature": temperature,
        "top_p": top_p,
        "max_tokens": max_tokens,
        "created_at": now,
        "updated_at": now,
        "archived": False,
        "assistant_id": assistant_id,
        "assistant_name": assistant_name,
        "user_id": user_id,
    }
    conversations_collection.insert_one(conv_doc)
    return _serialize_conversation(conv_doc)


def update_conversation_title(db, conv_id: str, title: str) -> None:
    conversations_collection.update_one(
        {"_id": conv_id},
        {"$set": {"title": title, "updated_at": datetime.utcnow()}},
    )


def should_autotitle_conversation(conversation: Optional[dict]) -> bool:
    if not conversation:
        return False
    title = (conversation.get("title") or "").strip().lower()
    return title in {"", "new chat"}


def add_message(db, conversation_id: str, role: str, content: str,
                model: str, tokens_used: int = 0, response_time_ms: float = None) -> dict:
    msg_id = str(uuid.uuid4())
    now = datetime.utcnow()
    msg_doc = {
        "_id": msg_id,
        "conversation_id": conversation_id,
        "role": role,
        "content": content,
        "model": model,
        "tokens_used": tokens_used,
        "response_time_ms": response_time_ms,
        "created_at": now,
    }
    messages_collection.insert_one(msg_doc)
    conversations_collection.update_one(
        {"_id": conversation_id},
        {"$set": {"updated_at": now}},
    )
    return _serialize_message(msg_doc)


def get_conversation(db, conv_id: str) -> Optional[dict]:
    conv = conversations_collection.find_one({"_id": conv_id})
    return _serialize_conversation(conv) if conv else None


def list_conversations(db, limit: int = 50, user_id: Optional[str] = None) -> list[dict]:
    query = {} if user_id is None else {"user_id": user_id}
    conversations = conversations_collection.find(query).sort("updated_at", -1).limit(limit)
    result = []
    for conv in conversations:
        conv_data = _serialize_conversation(conv)
        conv_data["message_count"] = messages_collection.count_documents({"conversation_id": conv_data["id"]})
        result.append(conv_data)
    return result


def delete_conversation(db, conv_id: str) -> bool:
    conv_result = conversations_collection.delete_one({"_id": conv_id})
    if conv_result.deleted_count == 0:
        return False
    messages_collection.delete_many({"conversation_id": conv_id})
    return True


def get_conversation_messages(db, conv_id: str) -> list[dict]:
    messages = messages_collection.find({"conversation_id": conv_id}).sort("created_at", 1)
    return [_serialize_message(message) for message in messages]


def create_conversation_message_pair(db, conv_id: str, user_msg: str,
                                      assistant_msg: str, model: str,
                                      tokens_used: int = 0, response_time_ms: float = None):
    """Add both user and assistant message in one transaction."""
    conv = conversations_collection.find_one({"_id": conv_id})
    if not conv:
        raise ValueError(f"Conversation {conv_id} not found")
    now = datetime.utcnow()
    conversations_collection.update_one({"_id": conv_id}, {"$set": {"updated_at": now}})
    user_message = {
        "_id": str(uuid.uuid4()),
        "conversation_id": conv_id,
        "role": "user",
        "content": user_msg,
        "model": model,
        "tokens_used": 0,
        "response_time_ms": None,
        "created_at": now,
    }
    assistant_message = {
        "_id": str(uuid.uuid4()),
        "conversation_id": conv_id,
        "role": "assistant",
        "content": assistant_msg,
        "model": model,
        "tokens_used": tokens_used,
        "response_time_ms": response_time_ms,
        "created_at": now,
    }
    messages_collection.insert_many([user_message, assistant_message])
    return _serialize_message(user_message), _serialize_message(assistant_message)
