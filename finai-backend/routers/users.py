# finai-backend/routers/users.py
from fastapi import APIRouter, HTTPException
from bson import ObjectId
from database import db
from typing import List

# 🚨 DITO NATIN SIYA I-I-IMPORT:
from schemas.user import UserResponse

router = APIRouter(prefix="/api/users", tags=["Admin Users"])

@router.get("/", response_model=List[UserResponse])
async def get_all_users():
    users = []
    async for user in db.users.find():
        user_data = {
            "id": str(user["_id"]),
            "name": user.get("name", "Unknown User"),
            "email": user.get("email", "No Email"),
            "role": user.get("role", "user")
        }
        users.append(UserResponse(**user_data))
    return users

@router.delete("/{user_id}")
async def delete_user(user_id: str):
    try:
        oid = ObjectId(user_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid User ID format")

    result = await db.users.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Cascade delete: Buburahin din ang transactions at accounts ng user
    await db.expenses.delete_many({"user_id": user_id})
    await db.accounts.delete_many({"user_id": user_id, "account_role": "user"})
    
    return {"message": "User and their data deleted successfully"}