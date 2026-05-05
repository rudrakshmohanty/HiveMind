from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    conversation_id: Optional[str] = None
    model: str = "mistral"
    temperature: float = Field(0.7, ge=0, le=1)
    top_p: float = Field(0.9, ge=0, le=1)
    max_tokens: int = Field(512, ge=1)
    # When set, the chat router will retrieve relevant code chunks from this
    # assistant's vector index and inject them as system context.
    assistant_id: Optional[str] = None


class ConversationCreateRequest(BaseModel):
    title: str = Field("New Chat", min_length=1)
    model: str = "mistral"
    temperature: float = Field(0.7, ge=0, le=1)
    top_p: float = Field(0.9, ge=0, le=1)
    max_tokens: int = Field(512, ge=1)


class ConversationUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1)
    model: Optional[str] = None
    archived: Optional[bool] = None


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    conversation_id: str
    role: str
    content: str
    model: str
    tokens_used: int
    response_time_ms: Optional[float] = None
    created_at: datetime

class ConversationInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

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

class ConversationDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: str
    title: str
    model_name: str
    messages: List[MessageResponse]
    created_at: datetime
    updated_at: datetime

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


# ---------------------------------------------------------------------------
# Assistant schemas
# ---------------------------------------------------------------------------

class AssistantCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = ""
    codebase_path: str = Field(..., min_length=1)


class AssistantInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: str
    name: str
    description: str
    codebase_path: str
    indexed_files: int
    total_chunks: int
    index_status: str
    last_indexed: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
