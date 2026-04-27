import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session

try:
    from ..models import Conversation, Message
    from ..database import SessionLocal
except ImportError:
    from models import Conversation, Message
    from database import SessionLocal


def create_conversation(db: Session, title: str = "New Chat", model: str = "mistral",
                        temperature: float = 0.7, top_p: float = 0.9, max_tokens: int = 512) -> Conversation:
    conv_id = str(uuid.uuid4())
    conv = Conversation(
        id=conv_id,
        title=title,
        model_name=model,
        temperature=temperature,
        top_p=top_p,
        max_tokens=max_tokens,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


def add_message(db: Session, conversation_id: str, role: str, content: str,
                model: str, tokens_used: int = 0, response_time_ms: float = None) -> Message:
    msg_id = str(uuid.uuid4())
    msg = Message(
        id=msg_id,
        conversation_id=conversation_id,
        role=role,
        content=content,
        model=model,
        tokens_used=tokens_used,
        response_time_ms=response_time_ms,
        created_at=datetime.utcnow(),
    )
    db.add(msg)
    # Update conversation's updated_at
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if conv:
        conv.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(msg)
    return msg


def get_conversation(db: Session, conv_id: str) -> Optional[Conversation]:
    return db.query(Conversation).filter(Conversation.id == conv_id).first()


def list_conversations(db: Session, limit: int = 50) -> list[Conversation]:
    return db.query(Conversation).order_by(Conversation.updated_at.desc()).limit(limit).all()


def delete_conversation(db: Session, conv_id: str) -> bool:
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        return False
    db.delete(conv)
    db.commit()
    return True


def get_conversation_messages(db: Session, conv_id: str) -> list[Message]:
    return db.query(Message).filter(Message.conversation_id == conv_id).order_by(Message.created_at).all()


def create_conversation_message_pair(db: Session, conv_id: str, user_msg: str,
                                      assistant_msg: str, model: str,
                                      tokens_used: int = 0, response_time_ms: float = None):
    """Add both user and assistant message in one transaction."""
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise ValueError(f"Conversation {conv_id} not found")
    conv.updated_at = datetime.utcnow()
    user_message = Message(
        id=str(uuid.uuid4()),
        conversation_id=conv_id,
        role="user",
        content=user_msg,
        model=model,
        created_at=datetime.utcnow(),
    )
    assistant_message = Message(
        id=str(uuid.uuid4()),
        conversation_id=conv_id,
        role="assistant",
        content=assistant_msg,
        model=model,
        tokens_used=tokens_used,
        response_time_ms=response_time_ms,
        created_at=datetime.utcnow(),
    )
    db.add(user_message)
    db.add(assistant_message)
    db.commit()
    return user_message, assistant_message
