import os

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(override=False)  # Docker Compose env vars take precedence over .env

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DB = os.getenv("MONGODB_DB", "hivemind")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

client = MongoClient(MONGODB_URL, serverSelectionTimeoutMS=5000)
db = client[MONGODB_DB]

conversations_collection = db["conversations"]
messages_collection = db["messages"]
assistants_collection = db["assistants"]
users_collection = db["users"]


def ensure_indexes() -> None:
    conversations_collection.create_index("updated_at")
    conversations_collection.create_index("user_id")
    messages_collection.create_index([("conversation_id", 1), ("created_at", 1)])
    assistants_collection.create_index("user_id")
    users_collection.create_index("email", unique=True)
    users_collection.create_index("username", unique=True)


def get_db():
    yield db
