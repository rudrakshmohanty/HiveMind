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

import asyncio
import hashlib
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

# How many files to embed concurrently. Higher = faster, but uses more RAM
# and may overwhelm Ollama on low-end hardware. Tune with INDEX_CONCURRENCY env var.
INDEX_CONCURRENCY = int(os.getenv("INDEX_CONCURRENCY", "4"))

# Max texts sent in a single /api/embed call. Larger batches reduce HTTP
# round-trips but use more memory per request.
EMBED_BATCH_SIZE = int(os.getenv("EMBED_BATCH_SIZE", "32"))

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
    Embed a single text — used at query time (one query per chat message).

    Embeddings are only comparable when produced by the same model, so
    indexing and retrieval must both use EMBED_MODEL.
    """
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{OLLAMA_BASE_URL}/api/embeddings",
            json={"model": EMBED_MODEL, "prompt": text},
        )
        resp.raise_for_status()
        return resp.json()["embedding"]


async def embed_texts_batch(texts: list[str]) -> list[list[float]]:
    """
    Embed multiple texts in a single Ollama request using /api/embed.

    This is the key performance improvement over embed_text: instead of one
    HTTP round-trip per chunk, we send all chunks for a file together and get
    all embeddings back in one response. For a file with 10 chunks, this is
    10× fewer network calls.

    Requires Ollama ≥ 0.1.31. The response shape is:
      { "embeddings": [[float, ...], [float, ...], ...] }
    """
    if not texts:
        return []
    async with httpx.AsyncClient(timeout=300.0) as client:
        resp = await client.post(
            f"{OLLAMA_BASE_URL}/api/embed",
            json={"model": EMBED_MODEL, "input": texts},
        )
        resp.raise_for_status()
        return resp.json()["embeddings"]


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


def file_content_hash(content: str) -> str:
    """MD5 of file content — used to detect unchanged files during re-indexing."""
    return hashlib.md5(content.encode("utf-8", errors="ignore")).hexdigest()


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
    force_full: bool = False,
) -> dict:
    """
    Incremental indexing pipeline (default) or full re-index (force_full=True).

    Incremental mode
    ----------------
    Each chunk stored in ChromaDB carries the MD5 hash of its source file.
    On re-index we:
      1. Load existing hashes from ChromaDB (metadata only — no vectors, fast).
      2. Hash every file on disk.
      3. Skip files whose hash is unchanged  →  zero embedding work for them.
      4. Delete and re-embed only changed/new files.
      5. Delete chunks whose source file no longer exists on disk.

    For a 1 000-file project where 50 files changed this means ~95 % fewer
    embedding calls vs always wiping and re-indexing from scratch.
    A first-time index (no existing data) automatically indexes everything.

    Full mode (force_full=True)
    ---------------------------
    Wipes the entire collection and re-embeds every file unconditionally.
    Use this when you want a guaranteed clean slate.

    Concurrency / batching
    ----------------------
    Up to INDEX_CONCURRENCY files embed simultaneously.  Each file's chunks
    are grouped into EMBED_BATCH_SIZE-sized batches → one HTTP call per batch,
    not one per chunk.

    Cancellation
    ------------
    CancelledError propagates through every `await`, so deleting an assistant
    mid-index stops all concurrent tasks at the next network call.
    """
    files = collect_files(codebase_path)
    total_files = len(files)
    collection = get_collection(assistant_id)

    # rel_path → Path for the current codebase state
    current_files: dict[str, Path] = {
        str(f.relative_to(codebase_path)): f for f in files
    }

    if force_full:
        # Wipe everything and queue every file for embedding
        existing = collection.get()
        if existing["ids"]:
            await asyncio.to_thread(collection.delete, ids=existing["ids"])
        to_index: list[tuple[str, str, str]] = []   # (rel_path, content, hash)
        for rel_path, file_path in current_files.items():
            try:
                content = file_path.read_text(encoding="utf-8", errors="ignore")
                if content.strip():
                    to_index.append((rel_path, content, file_content_hash(content)))
            except Exception:
                pass
        skipped = 0
    else:
        # Load existing hashes — metadata only, no embedding vectors
        existing_data = await asyncio.to_thread(collection.get, include=["metadatas"])

        ids_by_file: dict[str, list[str]] = {}
        hash_by_file: dict[str, str] = {}
        for doc_id, meta in zip(
            existing_data.get("ids", []),
            existing_data.get("metadatas", []) or [],
        ):
            if not meta:
                continue
            rel = meta.get("file")
            h   = meta.get("hash")
            if rel:
                ids_by_file.setdefault(rel, []).append(doc_id)
                if h:
                    hash_by_file[rel] = h

        # Delete chunks for files removed from disk
        removed = set(ids_by_file) - set(current_files)
        if removed:
            gone_ids = [doc_id for r in removed for doc_id in ids_by_file[r]]
            await asyncio.to_thread(collection.delete, ids=gone_ids)

        # Decide which files need re-embedding
        to_index = []
        skipped  = 0
        for rel_path, file_path in current_files.items():
            try:
                content = file_path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                skipped += 1
                continue

            current_hash = file_content_hash(content)
            if hash_by_file.get(rel_path) == current_hash:
                skipped += 1    # unchanged — keep existing chunks as-is
                continue

            # Changed or new file — remove stale chunks before re-embedding
            if rel_path in ids_by_file:
                await asyncio.to_thread(collection.delete, ids=ids_by_file[rel_path])

            if content.strip():
                to_index.append((rel_path, content, current_hash))

    # state["done"] starts at `skipped` so the progress bar reflects files
    # that were already up-to-date as immediately processed.
    state = {"done": skipped, "new_chunks": 0}
    semaphore = asyncio.Semaphore(INDEX_CONCURRENCY)

    if on_progress:
        on_progress(state["done"], total_files, 0)

    async def process_file(rel_path: str, content: str, content_hash: str) -> None:
        async with semaphore:
            try:
                chunks = chunk_file(content, rel_path)
                if not chunks:
                    return

                texts = [c["text"] for c in chunks]

                all_embeddings: list[list[float]] = []
                for i in range(0, len(texts), EMBED_BATCH_SIZE):
                    all_embeddings.extend(await embed_texts_batch(texts[i : i + EMBED_BATCH_SIZE]))

                await asyncio.to_thread(
                    collection.add,
                    ids=[str(uuid.uuid4()) for _ in chunks],
                    embeddings=all_embeddings,
                    documents=texts,
                    metadatas=[
                        {
                            "file": c["file"],
                            "start_line": c["start_line"],
                            "end_line": c["end_line"],
                            "hash": content_hash,   # stored for future incremental runs
                        }
                        for c in chunks
                    ],
                )

                state["done"] += 1
                state["new_chunks"] += len(chunks)
                if on_progress:
                    on_progress(state["done"], total_files, state["new_chunks"])

            except asyncio.CancelledError:
                raise
            except Exception:
                state["done"] += 1
                if on_progress:
                    on_progress(state["done"], total_files, state["new_chunks"])

    await asyncio.gather(*[process_file(r, c, h) for r, c, h in to_index])

    # Query live count so total_chunks reflects unchanged + newly added chunks.
    total_chunks = await asyncio.to_thread(collection.count)

    return {
        "indexed_files": total_files,
        "total_chunks": total_chunks,
        "total_files": total_files,
    }


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
