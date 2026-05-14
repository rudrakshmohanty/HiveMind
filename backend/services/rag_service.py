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
import logging
import os
import re
import time
import uuid
from pathlib import Path
from typing import Optional

import chromadb
import httpx

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# nomic-embed-text is a fast, accurate open-source embedding model.
# Pull it once with: ollama pull nomic-embed-text
EMBED_MODEL = os.getenv("EMBED_MODEL", "nomic-embed-text")

# ChromaDB stores its data in this local folder (no server needed).
CHROMA_PATH = os.getenv("CHROMA_PATH", "./chroma_db")

# How many files to embed concurrently.
INDEX_CONCURRENCY = int(os.getenv("INDEX_CONCURRENCY", "6"))

# Max texts sent in a single /api/embed call.
EMBED_BATCH_SIZE = int(os.getenv("EMBED_BATCH_SIZE", "32"))

# How many times to retry a failed embedding request before giving up.
EMBED_RETRIES = int(os.getenv("EMBED_RETRIES", "3"))

# Cosine distance threshold for retrieval (0 = identical, 2 = opposite).
# Chunks with distance above this value are excluded from query results.
MIN_RELEVANCE_DISTANCE = float(os.getenv("MIN_RELEVANCE_DISTANCE", "0.7"))

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
    "chroma_db",
}

# Chunking parameters
CHUNK_LINES   = 60    # lines per chunk
CHUNK_OVERLAP = 10    # lines shared between adjacent chunks
MAX_FILE_BYTES = 500_000  # skip files larger than 500 KB

# ---------------------------------------------------------------------------
# Persistent HTTP client
# ---------------------------------------------------------------------------

_http_client: Optional[httpx.AsyncClient] = None


def _get_http_client() -> httpx.AsyncClient:
    """
    Reuses a single AsyncClient for all Ollama calls.
    Avoids TCP handshake + TLS overhead on every embedding request —
    especially important during indexing where hundreds of requests fire.
    """
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=10.0, read=300.0, write=60.0, pool=10.0),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
    return _http_client


# ---------------------------------------------------------------------------
# Query embedding cache
# ---------------------------------------------------------------------------

_embed_cache: dict[str, tuple[list[float], float]] = {}
_EMBED_CACHE_TTL = 300   # seconds — embeddings are stable within a session
_EMBED_CACHE_MAX = 256   # max entries before evicting the oldest 20%


# ---------------------------------------------------------------------------
# ChromaDB client (lazy singleton)
# ---------------------------------------------------------------------------

_chroma_client: Optional[chromadb.PersistentClient] = None

# Serializes ChromaDB writes — SQLite under the hood can't handle concurrent
# writes from multiple asyncio.to_thread calls without "database is locked" errors.
_chroma_write_lock = asyncio.Lock()


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
    Embed a single text — used at query time.

    Results are cached for _EMBED_CACHE_TTL seconds so repeated or similar
    queries (e.g., follow-up questions about the same topic) skip the Ollama
    round-trip entirely.
    """
    cache_key = hashlib.md5(text.encode("utf-8")).hexdigest()
    now = time.monotonic()

    if cache_key in _embed_cache:
        vec, ts = _embed_cache[cache_key]
        if now - ts < _EMBED_CACHE_TTL:
            return vec

    embeddings = await embed_texts_batch([text])
    vec = embeddings[0]

    _embed_cache[cache_key] = (vec, now)
    if len(_embed_cache) > _EMBED_CACHE_MAX:
        sorted_keys = sorted(_embed_cache, key=lambda k: _embed_cache[k][1])
        for k in sorted_keys[: _EMBED_CACHE_MAX // 5]:
            del _embed_cache[k]

    return vec


async def embed_texts_batch(texts: list[str]) -> list[list[float]]:
    """
    Embed multiple texts in a single Ollama request using /api/embed.

    Retries up to EMBED_RETRIES times with exponential backoff on transient
    errors (Ollama restart, network blip, temporary overload).

    Requires Ollama ≥ 0.1.31. Response shape:
      { "embeddings": [[float, ...], [float, ...], ...] }
    """
    if not texts:
        return []

    client = _get_http_client()
    last_err: Exception = RuntimeError("no attempts made")

    for attempt in range(EMBED_RETRIES):
        try:
            resp = await client.post(
                f"{OLLAMA_BASE_URL}/api/embed",
                json={"model": EMBED_MODEL, "input": texts},
            )
            resp.raise_for_status()
            return resp.json()["embeddings"]
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            last_err = exc
            if attempt < EMBED_RETRIES - 1:
                wait = 2 ** attempt  # 1s, 2s, 4s
                logger.warning("Embed attempt %d failed (%s), retrying in %ds…", attempt + 1, exc, wait)
                await asyncio.sleep(wait)

    raise last_err


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
# Code-aware chunking
# ---------------------------------------------------------------------------

# Regex patterns for top-level definition starts (per file extension).
# These mark preferred split points — keeping each function/class intact.
_BOUNDARY_PATTERNS: dict[str, re.Pattern] = {
    ".py":   re.compile(r"^(async def |def |class )\w"),
    ".js":   re.compile(r"^(function |class |export\b)"),
    ".jsx":  re.compile(r"^(function |class |export\b)"),
    ".ts":   re.compile(r"^(function |class |export\b|interface |type \w+ =)"),
    ".tsx":  re.compile(r"^(function |class |export\b|interface |type \w+ =)"),
    ".go":   re.compile(r"^func "),
    ".rs":   re.compile(r"^(pub fn |fn |pub struct |struct |impl |pub impl )"),
}


def _line_chunks(lines: list[str], file_path: str, line_offset: int = 0) -> list[dict]:
    """Pure line-based chunking with overlap — fallback for non-code or large sections."""
    chunks = []
    i = 0
    while i < len(lines):
        segment = lines[i : i + CHUNK_LINES]
        text = "\n".join(segment)
        if text.strip():
            chunks.append({
                "text": f"# File: {file_path}\n\n{text}",
                "file": file_path,
                "start_line": line_offset + i + 1,
                "end_line": line_offset + i + len(segment),
            })
        i += CHUNK_LINES - CHUNK_OVERLAP
    return chunks


def chunk_file(content: str, file_path: str) -> list[dict]:
    """
    Split a file into chunks, preferring natural code boundaries.

    For Python, JS/TS, Go, and Rust we locate top-level definitions
    (def/class/function/func/…) and treat those lines as section starts.
    Each section becomes one chunk when it fits within CHUNK_LINES.
    Sections that exceed CHUNK_LINES are sub-split with overlap so no
    chunk grows beyond a reasonable token budget.

    Non-code files (Markdown, YAML, JSON, …) fall back to line-based
    chunking identical to the previous approach.
    """
    lines = content.splitlines()
    if not lines:
        return []

    ext = Path(file_path).suffix.lower()
    boundary_re = _BOUNDARY_PATTERNS.get(ext)

    if not boundary_re:
        return _line_chunks(lines, file_path)

    # Find all line indices where a top-level definition begins
    section_starts = [i for i, line in enumerate(lines) if boundary_re.match(line)]
    if not section_starts:
        return _line_chunks(lines, file_path)

    # Build (start, end) pairs for each logical section
    sections: list[tuple[int, int]] = []
    if section_starts[0] > 0:
        sections.append((0, section_starts[0]))  # preamble (imports, constants)
    for j, start in enumerate(section_starts):
        end = section_starts[j + 1] if j + 1 < len(section_starts) else len(lines)
        sections.append((start, end))

    chunks: list[dict] = []
    for start, end in sections:
        seg = lines[start:end]
        if len(seg) <= CHUNK_LINES:
            # Section fits in one chunk — keep it whole
            text = "\n".join(seg)
            if text.strip():
                chunks.append({
                    "text": f"# File: {file_path}\n\n{text}",
                    "file": file_path,
                    "start_line": start + 1,
                    "end_line": end,
                })
        else:
            # Oversized section (very long function) — sub-split with overlap
            chunks.extend(_line_chunks(seg, file_path, line_offset=start))

    return chunks


# ---------------------------------------------------------------------------
# File collection
# ---------------------------------------------------------------------------

def _scan_root(root: Path, prefix: str) -> list[tuple[Path, str]]:
    """Walk one directory and return (absolute_path, file_key) pairs."""
    result = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(root)
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue
        try:
            if path.stat().st_size > MAX_FILE_BYTES:
                continue
        except OSError:
            continue
        result.append((path, f"{prefix}{rel}"))
    return result


def collect_files(codebase_path: str, extra_paths: Optional[list] = None) -> list:
    """
    Walk all directories and return (absolute_path, file_key) pairs.

    Main codebase: file_key = relative/path.py
    Extra paths:   file_key = [root_name]/relative/path.py
    This prevents key collisions when merging multiple codebases.
    """
    main_root = Path(codebase_path).expanduser().resolve()
    if not main_root.exists():
        raise ValueError(f"Path does not exist: {codebase_path}")

    result = _scan_root(main_root, "")
    for ep in (extra_paths or []):
        ep_root = Path(ep).expanduser().resolve()
        if ep_root.exists():
            result.extend(_scan_root(ep_root, f"[{ep_root.name}]/"))
    return result


# ---------------------------------------------------------------------------
# Indexing pipeline
# ---------------------------------------------------------------------------

async def index_codebase(
    assistant_id: str,
    codebase_path: str,
    extra_paths: Optional[list] = None,
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
    not one per chunk.  Failed batches are retried up to EMBED_RETRIES times.

    Cancellation
    ------------
    CancelledError propagates through every `await`, so deleting an assistant
    mid-index stops all concurrent tasks at the next network call.
    """
    files_with_keys = collect_files(codebase_path, extra_paths)
    total_files = len(files_with_keys)
    collection = get_collection(assistant_id)

    # file_key → absolute Path for the current codebase state
    current_files: dict[str, Path] = {key: path for path, key in files_with_keys}

    if force_full:
        # Wipe everything and queue every file for embedding
        existing = collection.get()
        if existing["ids"]:
            await asyncio.to_thread(collection.delete, ids=existing["ids"])
        to_index: list[tuple[str, str, str, float]] = []   # (file_key, content, hash, mtime)
        for file_key, file_path in current_files.items():
            try:
                content = file_path.read_text(encoding="utf-8", errors="ignore")
                mtime = file_path.stat().st_mtime
                if content.strip():
                    to_index.append((file_key, content, file_content_hash(content), mtime))
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

        # Load mtime stamps stored in existing chunk metadata
        mtime_by_file: dict[str, float] = {}
        for meta in (existing_data.get("metadatas") or []):
            if meta:
                rel = meta.get("file")
                mt  = meta.get("mtime")
                if rel and mt and rel not in mtime_by_file:
                    mtime_by_file[rel] = float(mt)

        # Decide which files need re-embedding
        to_index = []
        skipped  = 0
        for file_key, file_path in current_files.items():
            try:
                stat = file_path.stat()
            except OSError:
                skipped += 1
                continue

            # Fast path: mtime unchanged → skip before even reading the file
            if mtime_by_file.get(file_key) == stat.st_mtime and file_key in hash_by_file:
                skipped += 1
                continue

            try:
                content = file_path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                skipped += 1
                continue

            current_hash = file_content_hash(content)
            if hash_by_file.get(file_key) == current_hash:
                skipped += 1    # content identical despite mtime change (e.g. touch)
                continue

            # Changed or new file — remove stale chunks before re-embedding
            if file_key in ids_by_file:
                await asyncio.to_thread(collection.delete, ids=ids_by_file[file_key])

            if content.strip():
                to_index.append((file_key, content, current_hash, stat.st_mtime))

    # state["done"] starts at `skipped` so the progress bar reflects files
    # that were already up-to-date as immediately processed.
    state = {"done": skipped, "new_chunks": 0}
    semaphore = asyncio.Semaphore(INDEX_CONCURRENCY)

    if on_progress:
        on_progress(state["done"], total_files, 0)

    async def process_file(rel_path: str, content: str, content_hash: str, mtime: float = 0.0) -> None:
        async with semaphore:
            try:
                chunks = chunk_file(content, rel_path)
                if not chunks:
                    return

                texts = [c["text"] for c in chunks]

                all_embeddings: list[list[float]] = []
                for i in range(0, len(texts), EMBED_BATCH_SIZE):
                    all_embeddings.extend(await embed_texts_batch(texts[i : i + EMBED_BATCH_SIZE]))

                async with _chroma_write_lock:
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
                                "hash": content_hash,
                                "mtime": mtime,
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
            except Exception as exc:
                logger.warning("Failed to index %s: %s", rel_path, exc)
                state["done"] += 1
                if on_progress:
                    on_progress(state["done"], total_files, state["new_chunks"])

    await asyncio.gather(*[process_file(r, c, h, mt) for r, c, h, mt in to_index])

    # Query live count so total_chunks reflects unchanged + newly added chunks.
    total_chunks = await asyncio.to_thread(collection.count)

    return {
        "indexed_files": total_files,
        "total_chunks": total_chunks,
        "total_files": total_files,
    }


# ---------------------------------------------------------------------------
# File manifest
# ---------------------------------------------------------------------------

def get_indexed_files(assistant_id: str) -> list[str]:
    """Return the sorted list of unique file paths stored in this assistant's index."""
    try:
        data = get_collection(assistant_id).get(include=["metadatas"])
        seen: set[str] = set()
        for meta in (data.get("metadatas") or []):
            if meta and meta.get("file"):
                seen.add(meta["file"])
        return sorted(seen)
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------

async def query_context(assistant_id: str, query: str, top_k: int = 5) -> list[str]:
    """
    Retrieve the top-K most relevant code chunks for a user query.

    This is the *read* side of RAG:
      1. Embed the query (cached — repeated queries skip the Ollama call).
      2. ChromaDB computes cosine similarity between the query vector
         and every stored chunk vector.
      3. Filter out low-relevance results (distance > MIN_RELEVANCE_DISTANCE).
      4. Deduplicate overlapping chunks from the same file.
      5. Return up to top_k chunks as plain text.

    Fetching top_k * 3 candidates before filtering gives the deduplication
    step room to work without returning too few results.
    """
    collection = get_collection(assistant_id)
    count = collection.count()
    if count == 0:
        return []

    query_embedding = await embed_text(query)
    n_fetch = min(top_k * 3, count)

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=n_fetch,
        include=["documents", "metadatas", "distances"],
    )

    docs      = results.get("documents",  [[]])[0]
    metadatas = results.get("metadatas",  [[]])[0]
    distances = results.get("distances",  [[]])[0]

    seen_buckets: set[str] = set()
    filtered: list[str] = []

    for doc, meta, dist in zip(docs, metadatas, distances):
        if dist > MIN_RELEVANCE_DISTANCE:
            continue  # irrelevant — skip rather than inject noise

        if meta:
            file  = meta.get("file", "")
            start = meta.get("start_line", 0)
            # Group by ~half-chunk-size windows so adjacent overlapping chunks
            # from the same file don't both make it into the result set.
            bucket = f"{file}:{start // (CHUNK_LINES // 2)}"
            if bucket in seen_buckets:
                continue
            seen_buckets.add(bucket)

        filtered.append(doc)
        if len(filtered) >= top_k:
            break

    return filtered
