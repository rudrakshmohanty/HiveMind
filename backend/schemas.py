from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    conversation_id: Optional[str] = None
    model: str = "mistral"
    temperature: float = Field(0.7, ge=0, le=1)
    top_p: float = Field(0.9, ge=0, le=1)
    max_tokens: int = Field(512, ge=1)


class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    model: str
    tokens_used: int
    response_time_ms: Optional[float] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationInfo(BaseModel):
    id: str
    title: str
    model_name: str
    temperature: float
    top_p: float
    max_tokens: int
    created_at: datetime
    updated_at: datetime
    archived: bool
    message_count: int

    class Config:
        from_attributes = True


class ConversationDetail(BaseModel):
    id: str
    title: str
    model_name: str
    messages: List[MessageResponse]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class OllamaModel(BaseModel):
    name: str
    size: Optional[int] = None
    family: Optional[str] = None
    format: Optional[str] = None
    parameter_size: Optional[str] = None
    quantization_level: Optional[str] = None


class OllamaModelsResponse(BaseModel):
    models: List[OllamaModel]


class HealthStatus(BaseModel):
    ollama: str
    api: str = "ok"
