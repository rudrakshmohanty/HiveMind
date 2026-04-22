from fastapi import APIRouter
from .. import schemas
from ..services import ollama_service

router = APIRouter()


@router.get("/status", response_model=schemas.HealthStatus)
async def health_status():
    """Health check endpoint."""
    try:
        models = await ollama_service.get_available_models()
        ollama_status = "ok" if models else "no_models"
    except Exception:
        ollama_status = "error"
    return schemas.HealthStatus(ollama=ollama_status)


@router.get("/models", response_model=schemas.OllamaModelsResponse)
async def get_models():
    """Get available Ollama models."""
    models = await ollama_service.get_available_models()
    return schemas.OllamaModelsResponse(models=[
        schemas.OllamaModel(**m) for m in models
    ])
