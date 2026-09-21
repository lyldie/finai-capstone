# finai-backend/routers/users.py
from fastapi import APIRouter, HTTPException
from bson import ObjectId
from database import db
from typing import List
from pydantic import BaseModel, Field
from passlib.context import CryptContext

from schemas.user import UserResponse

router = APIRouter(prefix="/api/users", tags=["Admin Users"])

# Separate CryptContext instance, identical config to the one in main.py. bcrypt hashing
# is stateless, so a second instance with the same scheme is fully interchangeable --
# avoids a circular import between this router and main.py.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# --- SCHEMAS PARA SA PROFILE UPDATES ---
class UpdateIncomeSchema(BaseModel):
    monthly_income: float = Field(..., gt=0)


class ChangePinSchema(BaseModel):
    old_pin: str
    new_pin: str = Field(..., min_length=4, max_length=4, pattern=r"^\d{4}$")


class ChangePasswordSchema(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=6)


async def _require_admin(requester_id: str):
    """FIX: get_all_users and delete_user previously had NO access control at all --
    anyone could list every user's name/email/role, or delete any account, just by
    calling the endpoint. This is a minimum bar (checks the requester's stored role),
    not full authentication -- same honest caveat as everywhere else in this backend:
    without real auth tokens, a requester_id can still be spoofed by a deliberate
    caller. It does stop accidental/naive misuse and casual discovery, which is a real
    improvement over having no check whatsoever."""
    try:
        oid = ObjectId(requester_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid requester ID")
    requester = await db.users.find_one({"_id": oid})
    if not requester or requester.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")


# --- EXISTING ADMIN ENDPOINTS ---
@router.get("/", response_model=List[UserResponse])
async def get_all_users(requester_id: str):
    await _require_admin(requester_id)
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
async def delete_user(user_id: str, requester_id: str):
    await _require_admin(requester_id)
    try:
        oid = ObjectId(user_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid User ID format")

    result = await db.users.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.expenses.delete_many({"user_id": user_id})
    await db.accounts.delete_many({"user_id": user_id, "account_role": "user"})
    # NOTE: budgets, goals, notifications, and user-created categories tied to this
    # user_id are not cleaned up here -- they become harmless orphaned documents
    # (nothing will ever query them again since the user_id no longer exists), not a
    # correctness bug, just data hygiene. Worth a dedicated cleanup pass if desired.
    
    return {"message": "User and their data deleted successfully"}


# --- PROFILE ENDPOINTS ---
@router.patch("/{user_id}/update-income")
async def update_income(user_id: str, data: UpdateIncomeSchema):
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
async def change_pin(user_id: str, data: ChangePinSchema):
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid User ID")
    
    user = await db.users.find_one({"_id": oid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    stored_pin = str(user.get("pin", ""))

    # FIX: PINs are now bcrypt hashes (see main.py's /initial-setup and /verify-pin
    # fixes) -- comparing against data.old_pin as plaintext could never match a real
    # hash. Same auto-upgrade pattern as /verify-pin: if a legacy plaintext PIN is
    # found instead, it's accepted once via direct comparison, consistent with how
    # /verify-pin already handles the same transition.
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
async def change_password(user_id: str, data: ChangePasswordSchema):
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid User ID")
    
    user = await db.users.find_one({"_id": oid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    stored_password = user.get("password", "")

    # FIX: passwords have always been bcrypt-hashed at registration (main.py's
    # /register), so the previous plaintext comparison here could never succeed for a
    # correct password -- and if it somehow had, the next line stored the new password
    # UNHASHED, which would have permanently locked the user out at their next login
    # (pwd_context.verify() throws on a non-hash string, caught by /login as a 500).
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