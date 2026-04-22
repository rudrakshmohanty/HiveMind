from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import schemas, database
from ..services import conversation_service

router = APIRouter()


@router.get("/", response_model=list[schemas.ConversationInfo])
async def list_conversations(db: Session = Depends(database.get_db), limit: int = 50):
    convs = conversation_service.list_conversations(db, limit=limit)
    result = []
    for c in convs:
        msg_count = len(c.messages)
        result.append(schemas.ConversationInfo(
            id=c.id, title=c.title, model_name=c.model_name,
            temperature=c.temperature, top_p=c.top_p,
            max_tokens=c.max_tokens, created_at=c.created_at,
            updated_at=c.updated_at, archived=c.archived,
            message_count=msg_count,
        ))
    return result


@router.get("/{conv_id}", response_model=schemas.ConversationDetail)
async def get_conversation_detail(conv_id: str, db: Session = Depends(database.get_db)):
    conv = conversation_service.get_conversation(db, conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    messages = conversation_service.get_conversation_messages(db, conv_id)
    return schemas.ConversationDetail(
        id=conv.id, title=conv.title, model_name=conv.model_name,
        messages=[schemas.MessageResponse(
            id=m.id, conversation_id=m.conversation_id, role=m.role,
            content=m.content, model=m.model, tokens_used=m.tokens_used,
            response_time_ms=m.response_time_ms, created_at=m.created_at,
        ) for m in messages],
        created_at=conv.created_at, updated_at=conv.updated_at,
    )


@router.delete("/{conv_id}")
async def delete_conversation(conv_id: str, db: Session = Depends(database.get_db)):
    if not conversation_service.delete_conversation(db, conv_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"detail": "Conversation deleted"}


@router.patch("/{conv_id}")
async def update_conversation(conv_id: str, title: str = None, model: str = None,
                              db: Session = Depends(database.get_db)):
    conv = conversation_service.get_conversation(db, conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if title:
        conv.title = title
    if model:
        conv.model_name = model
    db.commit()
    db.refresh(conv)
    return {"id": conv.id, "title": conv.title, "model_name": conv.model_name}
