# finai-backend/routers/users.py
from fastapi import APIRouter, HTTPException, Depends
from bson import ObjectId
from database import db
from typing import List
from pydantic import BaseModel, Field
from passlib.context import CryptContext

from schemas.user import UserResponse
from auth import get_current_admin, get_current_user
from .logs import log_action

router = APIRouter(prefix="/api/users", tags=["Admin Users"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class UpdateIncomeSchema(BaseModel):
    monthly_income: float = Field(..., gt=0)


class ChangePinSchema(BaseModel):
    old_pin: str
    new_pin: str = Field(..., min_length=4, max_length=4, pattern=r"^\d{4}$")


class ChangePasswordSchema(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=6)


@router.get("/", response_model=List[UserResponse])
async def get_all_users(admin: dict = Depends(get_current_admin), archived: bool = False):
    """CHANGED: added `archived` query param, same pattern as the other
    3 routers -- default excludes archived users."""
    query = {"is_archived": True if archived else {"$ne": True}}
    users = []
    async for user in db.users.find(query):
        user_data = {
            "id": str(user["_id"]),
            "name": user.get("name", "Unknown User"),
            "email": user.get("email", "No Email"),
            "role": user.get("role", "user"),
            "is_archived": user.get("is_archived", False),
        }
        users.append(UserResponse(**user_data))
    return users


@router.patch("/{user_id}/archive")
async def archive_user(user_id: str, admin: dict = Depends(get_current_admin)):
    """NEW: replaces delete_user entirely. This is a real safety improvement,
    not just a style change -- the old delete_user PERMANENTLY destroyed the
    user's expenses and accounts with no way back. Archiving instead:
      - blocks the user's future logins (see main.py's /login check)
      - keeps every expense, account, goal, and budget of theirs intact
      - can be undone with restore_user below
    """
    try:
        oid = ObjectId(user_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid User ID format")

    target_user = await db.users.find_one({"_id": oid})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    if target_user.get("role") == "admin":
        raise HTTPException(status_code=403, detail="Admin accounts cannot be archived through this endpoint.")

    await db.users.update_one({"_id": oid}, {"$set": {"is_archived": True}})
    await log_action(admin["name"], f"Archived user '{target_user.get('name', user_id)}'")

    return {"message": "User archived successfully"}


@router.patch("/{user_id}/restore")
async def restore_user(user_id: str, admin: dict = Depends(get_current_admin)):
    """NEW: the undo for archive_user above. The user can log in again
    immediately after this."""
    try:
        oid = ObjectId(user_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid User ID format")

    target_user = await db.users.find_one({"_id": oid})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    await db.users.update_one({"_id": oid}, {"$set": {"is_archived": False}})
    await log_action(admin["name"], f"Restored user '{target_user.get('name', user_id)}'")

    return {"message": "User restored successfully"}


# --- PROFILE ENDPOINTS (unchanged -- called by the user themselves, not the
# admin panel; see earlier notes on the separate "regular users have no
# token" gap, not part of this pass) ---
@router.patch("/{user_id}/update-income")
async def update_income(user_id: str, data: UpdateIncomeSchema, current_user: dict = Depends(get_current_user)):
    if user_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only update your own profile.")
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid User ID")

    result = await db.users.update_one(
        {"_id": oid},
        {"$set": {"monthly_income": data.monthly_income}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    return {"status": "Success", "message": "Monthly income updated successfully!"}


@router.patch("/{user_id}/change-pin")
async def change_pin(user_id: str, data: ChangePinSchema, current_user: dict = Depends(get_current_user)):
    if user_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only change your own PIN.")
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid User ID")

    user = await db.users.find_one({"_id": oid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    stored_pin = str(user.get("pin", ""))

    pin_matches = False
    if stored_pin:
        try:
            pin_matches = pwd_context.verify(data.old_pin, stored_pin)
        except Exception:
            pin_matches = (stored_pin == data.old_pin)

    if stored_pin and not pin_matches:
        raise HTTPException(status_code=400, detail="Mali ang iyong kasalukuyang PIN.")

    await db.users.update_one(
        {"_id": oid},
        {"$set": {"pin": pwd_context.hash(data.new_pin)}}
    )
    return {"status": "Success", "message": "PIN changed successfully!"}


@router.patch("/{user_id}/change-password")
async def change_password(user_id: str, data: ChangePasswordSchema, current_user: dict = Depends(get_current_user)):
    if user_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only change your own password.")
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid User ID")

    user = await db.users.find_one({"_id": oid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    stored_password = user.get("password", "")

    try:
        if not pwd_context.verify(data.old_password[:72], stored_password):
            raise HTTPException(status_code=400, detail="Mali ang iyong kasalukuyang password.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Mali ang iyong kasalukuyang password.")

    await db.users.update_one(
        {"_id": oid},
        {"$set": {"password": pwd_context.hash(data.new_password[:72])}}
    )
    return {"status": "Success", "message": "Password changed successfully!"}
