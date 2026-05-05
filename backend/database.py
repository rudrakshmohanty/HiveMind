import os

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL")
MONGODB_DB = os.getenv("MONGODB_DB", "ollama-idea-test")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

client = MongoClient(MONGODB_URL, serverSelectionTimeoutMS=5000)
db = client[MONGODB_DB]

conversations_collection = db["conversations"]
messages_collection = db["messages"]
assistants_collection = db["assistants"]


def ensure_indexes() -> None:
    conversations_collection.create_index("updated_at")
    messages_collection.create_index([("conversation_id", 1), ("created_at", 1)])


def get_db():
    yield db
