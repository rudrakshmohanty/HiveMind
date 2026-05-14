from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

try:
    from .. import schemas, database
    from ..auth import get_current_user
    from ..services import conversation_service
except ImportError:
    import schemas
    import database
    from auth import get_current_user
    from services import conversation_service

router = APIRouter()


def _check_ownership(conv: dict, current_user: dict) -> None:
    """Raise 404 if user doesn't own the conversation (admins bypass)."""
    if current_user.get("role") == "admin":
        return
    if conv.get("user_id") and conv["user_id"] != str(current_user["_id"]):
        raise HTTPException(status_code=404, detail="Conversation not found")


@router.post("", response_model=schemas.ConversationInfo)
async def create_conversation(
    db=Depends(database.get_db),
    current_user: dict = Depends(get_current_user),
    payload: Optional[schemas.ConversationCreateRequest] = None,
    title: str = "New Chat",
    model: str = "mistral",
    temperature: float = 0.7,
    top_p: float = 0.9,
    max_tokens: int = 512,
    assistant_id: Optional[str] = None,
    assistant_name: Optional[str] = None,
):
    data = payload or schemas.ConversationCreateRequest(
        title=title,
        model=model,
        temperature=temperature,
        top_p=top_p,
        max_tokens=max_tokens,
        assistant_id=assistant_id,
        assistant_name=assistant_name,
    )
    conv = conversation_service.create_conversation(
        db,
        title=data.title,
        model=data.model,
        temperature=data.temperature,
        top_p=data.top_p,
        max_tokens=data.max_tokens,
        assistant_id=data.assistant_id,
        assistant_name=data.assistant_name,
        user_id=str(current_user["_id"]),
    )
    return schemas.ConversationInfo(
        id=conv["id"], title=conv["title"], model_name=conv["model_name"],
        temperature=conv["temperature"], top_p=conv["top_p"],
        max_tokens=conv["max_tokens"], created_at=conv["created_at"],
        updated_at=conv["updated_at"], archived=conv["archived"],
        message_count=0,
        assistant_id=conv.get("assistant_id"),
        assistant_name=conv.get("assistant_name"),
    )


@router.get("", response_model=list[schemas.ConversationInfo])
async def list_conversations(
    db=Depends(database.get_db),
    current_user: dict = Depends(get_current_user),
    limit: int = 50,
):
    user_id = None if current_user.get("role") == "admin" else str(current_user["_id"])
    convs = conversation_service.list_conversations(db, limit=limit, user_id=user_id)
    return [
        schemas.ConversationInfo(
            id=c["id"], title=c["title"], model_name=c["model_name"],
            temperature=c["temperature"], top_p=c["top_p"],
            max_tokens=c["max_tokens"], created_at=c["created_at"],
            updated_at=c["updated_at"], archived=c["archived"],
            message_count=c["message_count"],
            assistant_id=c.get("assistant_id"),
            assistant_name=c.get("assistant_name"),
        )
        for c in convs
    ]


@router.get("/{conv_id}", response_model=schemas.ConversationDetail)
async def get_conversation_detail(
    conv_id: str,
    db=Depends(database.get_db),
    current_user: dict = Depends(get_current_user),
):
    conv = conversation_service.get_conversation(db, conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    _check_ownership(conv, current_user)
    messages = conversation_service.get_conversation_messages(db, conv_id)
    return schemas.ConversationDetail(
        id=conv["id"], title=conv["title"], model_name=conv["model_name"],
        messages=[
            schemas.MessageResponse(
                id=m["id"], conversation_id=m["conversation_id"], role=m["role"],
                content=m["content"], model=m["model"], tokens_used=m["tokens_used"],
                response_time_ms=m["response_time_ms"], created_at=m["created_at"],
            )
            for m in messages
        ],
        created_at=conv["created_at"], updated_at=conv["updated_at"],
    )


@router.delete("/{conv_id}")
async def delete_conversation(
    conv_id: str,
    db=Depends(database.get_db),
    current_user: dict = Depends(get_current_user),
):
    conv = conversation_service.get_conversation(db, conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    _check_ownership(conv, current_user)
    conversation_service.delete_conversation(db, conv_id)
    return {"detail": "Conversation deleted"}


@router.patch("/{conv_id}")
async def update_conversation(
    conv_id: str,
    db=Depends(database.get_db),
    current_user: dict = Depends(get_current_user),
    payload: Optional[schemas.ConversationUpdateRequest] = None,
    title: Optional[str] = None,
    model: Optional[str] = None,
    archived: Optional[bool] = None,
):
    conv = conversation_service.get_conversation(db, conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    _check_ownership(conv, current_user)

    data = payload or schemas.ConversationUpdateRequest(title=title, model=model, archived=archived)
    updates: dict = {"updated_at": datetime.utcnow()}
    if data.title is not None:
        updates["title"] = data.title
    if data.model is not None:
        updates["model_name"] = data.model
    if data.archived is not None:
        updates["archived"] = data.archived

    conversation_service.conversations_collection.update_one({"_id": conv_id}, {"$set": updates})
    return {
        "id": conv_id,
        "title": updates.get("title", conv["title"]),
        "model_name": updates.get("model_name", conv["model_name"]),
        "archived": updates.get("archived", conv["archived"]),
    }
