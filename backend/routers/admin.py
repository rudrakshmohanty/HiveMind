from fastapi import APIRouter, Depends, HTTPException

try:
    from .. import database
    from ..auth import require_admin
    from ..services import conversation_service
except ImportError:
    import database
    from auth import require_admin
    from services import conversation_service

router = APIRouter()


def _serialize_user(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "username": doc["username"],
        "email": doc["email"],
        "role": doc.get("role", "user"),
        "created_at": doc["created_at"],
    }


@router.get("/users")
async def list_users(admin: dict = Depends(require_admin)):
    users = list(database.users_collection.find().sort("created_at", -1))
    result = []
    for u in users:
        row = _serialize_user(u)
        row["conversation_count"] = database.conversations_collection.count_documents(
            {"user_id": str(u["_id"])}
        )
        result.append(row)
    return result


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    if str(admin["_id"]) == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    result = database.users_collection.delete_one({"_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"deleted": user_id}


@router.patch("/users/{user_id}/role")
async def set_user_role(user_id: str, role: str, admin: dict = Depends(require_admin)):
    if role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'user'")
    result = database.users_collection.update_one({"_id": user_id}, {"$set": {"role": role}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user_id": user_id, "role": role}


@router.get("/conversations")
async def list_all_conversations(limit: int = 100, admin: dict = Depends(require_admin)):
    return conversation_service.list_conversations(database.db, limit=limit, user_id=None)


@router.get("/stats")
async def get_stats(admin: dict = Depends(require_admin)):
    return {
        "users": database.users_collection.count_documents({}),
        "conversations": database.conversations_collection.count_documents({}),
        "messages": database.messages_collection.count_documents({}),
        "assistants": database.assistants_collection.count_documents({}),
    }
