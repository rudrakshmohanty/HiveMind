"""
RAG Service — the brain of Retrieval-Augmented Generation.

WHAT IS RAG?
  Without RAG, the LLM only knows what it was trained on. It has never seen
  your code. RAG fixes this by retrieving relevant pieces of your codebase at
  query time and handing them to the model as extra context.

  Three phases:
    1. INDEXING   — read the codebase, split into chunks, convert each chunk
                    into an embedding vector, store in a vector database.
    2. RETRIEVAL  — embed the user's question, search for the closest chunks.
    3. INJECTION  — prepend those chunks as a system message so the LLM can
                    answer based on actual code instead of guessing.

WHAT IS AN EMBEDDING?
  An embedding is a list of ~768 floating-point numbers that represents the
  *meaning* of a piece of text. Two chunks that talk about the same concept
  will have embedding vectors that point in nearly the same direction, even if
  they use different words. That's how we find "relevant" chunks without doing
  keyword search.

  Example (very simplified):
    "function that handles login"  → [0.12, -0.34, 0.87, ...]
    "def authenticate_user()"      → [0.11, -0.33, 0.85, ...]   ← close!
    "how to bake bread"            → [-0.91, 0.22, -0.44, ...]  ← far away

WHY CHUNK?
  LLMs have a limited context window (4 K-32 K tokens). A real codebase has
  millions of tokens. Chunking lets us feed only the 3-5 most relevant
  snippets instead of the entire project.

  We use overlapping chunks so a function that straddles a chunk boundary
  still appears complete in at least one chunk.
"""

import os
import uuid
from pathlib import Path
from typing import Optional

import chromadb
import httpx

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# nomic-embed-text is a fast, accurate open-source embedding model.
# Pull it once with: ollama pull nomic-embed-text
EMBED_MODEL = os.getenv("EMBED_MODEL", "nomic-embed-text")

# ChromaDB stores its data in this local folder (no server needed).
CHROMA_PATH = os.getenv("CHROMA_PATH", "./chroma_db")

# ---------------------------------------------------------------------------
# File-type and directory filters
# ---------------------------------------------------------------------------

SUPPORTED_EXTENSIONS = {
    # Source code
    ".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".go", ".rs",
    ".cpp", ".c", ".h", ".hpp", ".cs", ".rb", ".php", ".swift",
    ".kt", ".scala", ".r", ".lua", ".sh", ".bash", ".zsh",
    ".vue", ".svelte",
    # Config / docs
    ".md", ".txt", ".yaml", ".yml", ".toml", ".json", ".xml",
    ".html", ".css", ".scss", ".sql",
}

# Directories that should never be indexed
SKIP_DIRS = {
    "node_modules", ".git", "__pycache__", "dist", "build",
    ".next", ".nuxt", "venv", ".venv", ".env", "env", "coverage",
    ".pytest_cache", ".mypy_cache", "target", "out",
    ".idea", ".vscode", "__snapshots__", ".turbo", ".cache",
}

# Chunking parameters
CHUNK_LINES = 60    # lines per chunk
CHUNK_OVERLAP = 10  # lines shared between adjacent chunks (prevents split functions)
MAX_FILE_BYTES = 500_000  # skip files larger than 500 KB

# ---------------------------------------------------------------------------
# ChromaDB client (lazy singleton)
# ---------------------------------------------------------------------------

_chroma_client: Optional[chromadb.PersistentClient] = None


def get_chroma_client() -> chromadb.PersistentClient:
    """
    Returns a persistent ChromaDB client.
    'Persistent' means it saves data to CHROMA_PATH on disk — your index
    survives restarts without re-indexing.
    """
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)
    return _chroma_client


# ---------------------------------------------------------------------------
# Embedding
# ---------------------------------------------------------------------------

async def embed_text(text: str) -> list[float]:
    """
    Call Ollama's /api/embeddings endpoint to get a vector for `text`.

    This uses the same EMBED_MODEL for both indexing and querying — that's
    crucial. Embeddings are only comparable when produced by the same model.
    Mixing models would give you garbage similarity scores.
    """
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{OLLAMA_BASE_URL}/api/embeddings",
            json={"model": EMBED_MODEL, "prompt": text},
        )
        resp.raise_for_status()
        return resp.json()["embedding"]


# ---------------------------------------------------------------------------
# ChromaDB collection management
# ---------------------------------------------------------------------------

def get_collection(assistant_id: str):
    """
    Get (or create) the vector collection for a specific assistant.

    Each assistant gets its own isolated namespace inside ChromaDB.
    hnsw:space=cosine means similarity is measured by cosine distance —
    ideal for text embeddings where direction matters, not magnitude.
    """
    client = get_chroma_client()
    return client.get_or_create_collection(
        name=f"assistant_{assistant_id}",
        metadata={"hnsw:space": "cosine"},
    )


def delete_collection(assistant_id: str) -> None:
    """Remove all indexed vectors for an assistant."""
    client = get_chroma_client()
    try:
        client.delete_collection(f"assistant_{assistant_id}")
    except Exception:
        pass


def collection_count(assistant_id: str) -> int:
    """Return how many chunks are currently stored for an assistant."""
    try:
        return get_collection(assistant_id).count()
    except Exception:
        return 0


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------

def chunk_file(content: str, file_path: str) -> list[dict]:
    """
    Split a source file into overlapping line-based chunks.

    Each chunk carries the file path as a header so the LLM knows where
    the code lives when it references it in its answer.

    Overlap example (CHUNK_LINES=4, CHUNK_OVERLAP=1):
      Lines 1-4  → chunk 0
      Lines 4-7  → chunk 1   (line 4 shared)
      Lines 7-10 → chunk 2   (line 7 shared)
    """
    lines = content.splitlines()
    chunks = []
    i = 0
    while i < len(lines):
        segment = lines[i: i + CHUNK_LINES]
        text = "\n".join(segment)
        if text.strip():
            chunks.append({
                "text": f"# File: {file_path}\n\n{text}",
                "file": file_path,
                "start_line": i + 1,
                "end_line": i + len(segment),
            })
        i += CHUNK_LINES - CHUNK_OVERLAP
    return chunks


# ---------------------------------------------------------------------------
# File collection
# ---------------------------------------------------------------------------

def collect_files(codebase_path: str) -> list[Path]:
    """
    Walk the directory tree and return all indexable source files,
    skipping build artifacts, dependencies, and oversized files.
    """
    root = Path(codebase_path)
    if not root.exists():
        raise ValueError(f"Path does not exist: {codebase_path}")

    files = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        # Skip if any ancestor directory is in the blocklist
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue
        try:
            if path.stat().st_size > MAX_FILE_BYTES:
                continue
        except OSError:
            continue
        files.append(path)
    return files


# ---------------------------------------------------------------------------
# Indexing pipeline
# ---------------------------------------------------------------------------

async def index_codebase(
    assistant_id: str,
    codebase_path: str,
    on_progress: Optional[callable] = None,
) -> dict:
    """
    Full indexing pipeline for one assistant.

    on_progress(indexed_files, total_files, total_chunks) is called after each
    file finishes so the router can push live progress to the status dict.
    Because asyncio.CancelledError propagates through every `await`, cancelling
    the parent task (on assistant deletion) stops indexing immediately at the
    next embedding call.
    """
    files = collect_files(codebase_path)
    total_files = len(files)
    collection = get_collection(assistant_id)

    # Wipe existing index so a re-index starts clean
    existing = collection.get()
    if existing["ids"]:
        collection.delete(ids=existing["ids"])

    indexed_files = 0
    total_chunks = 0

    # Emit initial state so the frontend knows the total file count immediately
    if on_progress:
        on_progress(0, total_files, 0)

    for file_path in files:
        try:
            content = file_path.read_text(encoding="utf-8", errors="ignore")
            if not content.strip():
                continue

            rel_path = str(file_path.relative_to(codebase_path))
            chunks = chunk_file(content, rel_path)

            for chunk in chunks:
                # Each await here is a cancellation point — if the parent task
                # is cancelled (e.g. assistant deleted) this raises CancelledError
                # and unwinds the whole pipeline immediately.
                embedding = await embed_text(chunk["text"])
                collection.add(
                    ids=[str(uuid.uuid4())],
                    embeddings=[embedding],
                    documents=[chunk["text"]],
                    metadatas=[{
                        "file": chunk["file"],
                        "start_line": chunk["start_line"],
                        "end_line": chunk["end_line"],
                    }],
                )
                total_chunks += 1

            indexed_files += 1
            if on_progress:
                on_progress(indexed_files, total_files, total_chunks)

        except Exception:
            # Skip files that can't be read or embedded (but let CancelledError propagate)
            continue

    return {"indexed_files": indexed_files, "total_chunks": total_chunks, "total_files": total_files}


# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------

async def query_context(assistant_id: str, query: str, top_k: int = 5) -> list[str]:
    """
    Retrieve the top-K most relevant code chunks for a user query.

    This is the *read* side of RAG:
      1. Embed the query (same model as indexing)
      2. ChromaDB computes cosine similarity between the query vector
         and every stored chunk vector
      3. Return the top_k closest chunks as plain text

    Cosine similarity: measures the angle between two vectors.
      score = 1.0 → identical meaning
      score = 0.0 → completely unrelated
    ChromaDB returns results sorted by relevance automatically.
    """
    collection = get_collection(assistant_id)
    count = collection.count()
    if count == 0:
        return []

    query_embedding = await embed_text(query)
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(top_k, count),
        include=["documents"],
    )

    return results.get("documents", [[]])[0]
