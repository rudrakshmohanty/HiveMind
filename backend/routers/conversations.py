from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

try:
    from .. import schemas, database
    from ..services import conversation_service
except ImportError:
    import schemas, database
    from services import conversation_service

router = APIRouter()


@router.post("/", response_model=schemas.ConversationInfo)
async def create_conversation(
    db = Depends(database.get_db),
    payload: Optional[schemas.ConversationCreateRequest] = None,
    title: str = "New Chat",
    model: str = "mistral",
    temperature: float = 0.7,
    top_p: float = 0.9,
    max_tokens: int = 512,
):
    data = payload or schemas.ConversationCreateRequest(
        title=title,
        model=model,
        temperature=temperature,
        top_p=top_p,
        max_tokens=max_tokens,
    )
    conv = conversation_service.create_conversation(
        db,
        title=data.title,
        model=data.model,
        temperature=data.temperature,
        top_p=data.top_p,
        max_tokens=data.max_tokens,
    )
    return schemas.ConversationInfo(
        id=conv["id"], title=conv["title"], model_name=conv["model_name"],
        temperature=conv["temperature"], top_p=conv["top_p"],
        max_tokens=conv["max_tokens"], created_at=conv["created_at"],
        updated_at=conv["updated_at"], archived=conv["archived"],
        message_count=0,
    )


@router.get("/", response_model=list[schemas.ConversationInfo])
async def list_conversations(db = Depends(database.get_db), limit: int = 50):
    convs = conversation_service.list_conversations(db, limit=limit)
    result = []
    for c in convs:
        result.append(schemas.ConversationInfo(
            id=c["id"], title=c["title"], model_name=c["model_name"],
            temperature=c["temperature"], top_p=c["top_p"],
            max_tokens=c["max_tokens"], created_at=c["created_at"],
            updated_at=c["updated_at"], archived=c["archived"],
            message_count=c["message_count"],
        ))
    return result


@router.get("/{conv_id}", response_model=schemas.ConversationDetail)
async def get_conversation_detail(conv_id: str, db = Depends(database.get_db)):
    conv = conversation_service.get_conversation(db, conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    messages = conversation_service.get_conversation_messages(db, conv_id)
    return schemas.ConversationDetail(
        id=conv["id"], title=conv["title"], model_name=conv["model_name"],
        messages=[schemas.MessageResponse(
            id=m["id"], conversation_id=m["conversation_id"], role=m["role"],
            content=m["content"], model=m["model"], tokens_used=m["tokens_used"],
            response_time_ms=m["response_time_ms"], created_at=m["created_at"],
        ) for m in messages],
        created_at=conv["created_at"], updated_at=conv["updated_at"],
    )


@router.delete("/{conv_id}")
async def delete_conversation(conv_id: str, db = Depends(database.get_db)):
    if not conversation_service.delete_conversation(db, conv_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"detail": "Conversation deleted"}


@router.patch("/{conv_id}")
async def update_conversation(
    conv_id: str,
    db = Depends(database.get_db),
    payload: Optional[schemas.ConversationUpdateRequest] = None,
    title: Optional[str] = None,
    model: Optional[str] = None,
    archived: Optional[bool] = None,
):
    conv = conversation_service.get_conversation(db, conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    data = payload or schemas.ConversationUpdateRequest(title=title, model=model, archived=archived)
    if data.title is not None:
        conv["title"] = data.title
    if data.model is not None:
        conv["model_name"] = data.model
    if data.archived is not None:
        conv["archived"] = data.archived
    from datetime import datetime
    conversation_service.conversations_collection.update_one(
        {"_id": conv_id},
        {"$set": {
            "title": conv["title"],
            "model_name": conv["model_name"],
            "archived": conv["archived"],
            "updated_at": datetime.utcnow(),
        }},
    )
    return {"id": conv_id, "title": conv["title"], "model_name": conv["model_name"], "archived": conv["archived"]}
