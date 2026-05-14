import re

from pydantic import BaseModel, Field, ConfigDict, EmailStr, field_validator
from typing import Optional, List, Any, Dict
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
    # Base64-encoded images for multimodal models (e.g. llava). Never persisted to DB.
    images: Optional[List[str]] = None


class ConversationCreateRequest(BaseModel):
    title: str = Field("New Chat", min_length=1)
    model: str = "mistral"
    temperature: float = Field(0.7, ge=0, le=1)
    top_p: float = Field(0.9, ge=0, le=1)
    max_tokens: int = Field(512, ge=1)
    assistant_id: Optional[str] = None
    assistant_name: Optional[str] = None


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
    assistant_id: Optional[str] = None
    assistant_name: Optional[str] = None

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


class AssistantUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = None
    codebase_path: Optional[str] = Field(default=None, min_length=1)
    preferred_model: Optional[str] = None


class AssistantInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: str
    name: str
    description: str
    codebase_path: str
    extra_paths: List[str] = []
    indexed_files: int
    total_chunks: int
    index_status: str
    last_indexed: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    preferred_model: Optional[str] = None


# ---------------------------------------------------------------------------
# Auth / User schemas
# ---------------------------------------------------------------------------

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9_-]+$")
    email: str = Field(..., min_length=5)
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        missing = []
        if not re.search(r"[A-Z]", v):
            missing.append("uppercase letter")
        if not re.search(r"[a-z]", v):
            missing.append("lowercase letter")
        if not re.search(r"\d", v):
            missing.append("number")
        if missing:
            raise ValueError(f"Password must contain at least one {', one '.join(missing)}")
        return v


class UserLogin(BaseModel):
    identifier: str = Field(..., description="Username or email")
    password: str


class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    role: str
    settings: Dict[str, Any] = {}
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class UserSettingsUpdate(BaseModel):
    settings: Dict[str, Any]
