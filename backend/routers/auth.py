import uuid
from collections import defaultdict
from datetime import datetime, timezone
from time import time

from fastapi import APIRouter, Depends, HTTPException, Request

try:
    from .. import schemas, database
    from ..auth import create_access_token, get_current_user, hash_password, verify_password
except ImportError:
    import schemas
    import database
    from auth import create_access_token, get_current_user, hash_password, verify_password

router = APIRouter()

# ---------------------------------------------------------------------------
# In-memory rate limiter: max 5 login attempts per IP per 60 seconds
# ---------------------------------------------------------------------------
_login_attempts: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT_MAX = 5
_RATE_LIMIT_WINDOW = 60  # seconds


def _check_rate_limit(ip: str) -> None:
    now = time()
    window_start = now - _RATE_LIMIT_WINDOW
    attempts = [t for t in _login_attempts[ip] if t > window_start]
    _login_attempts[ip] = attempts
    if len(attempts) >= _RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=429,
            detail=f"Too many login attempts. Wait {_RATE_LIMIT_WINDOW} seconds before trying again.",
            headers={"Retry-After": str(_RATE_LIMIT_WINDOW)},
        )
    _login_attempts[ip].append(now)


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _serialize_user(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "username": doc["username"],
        "email": doc["email"],
        "role": doc.get("role", "user"),
        "settings": doc.get("settings", {}),
        "created_at": doc["created_at"],
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/register", response_model=schemas.TokenResponse, status_code=201)
async def register(req: schemas.UserCreate):
    if database.users_collection.find_one({"username": req.username}):
        raise HTTPException(status_code=400, detail="Username already taken")
    if database.users_collection.find_one({"email": req.email}):
        raise HTTPException(status_code=400, detail="Email already registered")

    is_first_user = database.users_collection.count_documents({}) == 0

    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    user_doc = {
        "_id": user_id,
        "username": req.username,
        "email": req.email,
        "hashed_password": hash_password(req.password),
        "role": "admin" if is_first_user else "user",
        "settings": {},
        "created_at": now,
        "updated_at": now,
    }
    database.users_collection.insert_one(user_doc)

    token = create_access_token(user_id, user_doc["role"])
    return {"access_token": token, "token_type": "bearer", "user": _serialize_user(user_doc)}


@router.post("/login", response_model=schemas.TokenResponse)
async def login(req: schemas.UserLogin, request: Request):
    _check_rate_limit(_get_client_ip(request))

    user = database.users_collection.find_one(
        {"$or": [{"email": req.identifier}, {"username": req.identifier}]}
    )
    if not user or not verify_password(req.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid username/email or password")

    # Clear attempts on successful login
    _login_attempts.pop(_get_client_ip(request), None)

    token = create_access_token(str(user["_id"]), user["role"])
    return {"access_token": token, "token_type": "bearer", "user": _serialize_user(user)}


@router.get("/me", response_model=schemas.UserResponse)
async def me(current_user: dict = Depends(get_current_user)):
    return _serialize_user(current_user)


@router.patch("/me/settings")
async def update_settings(
    req: schemas.UserSettingsUpdate,
    current_user: dict = Depends(get_current_user),
):
    database.users_collection.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"settings": req.settings, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"settings": req.settings}
