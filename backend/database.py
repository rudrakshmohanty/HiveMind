from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    os.getenv("OLLAMA_BASE_URL", "http://ollama:11434"),
    "sqlite:///./chat.db",
)
# Use postgresql+psycopg2:// for production if DATABASE_URL starts with postgresql
if DATABASE_URL.startswith("http"):
    DATABASE_URL = "sqlite:///./chat.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
