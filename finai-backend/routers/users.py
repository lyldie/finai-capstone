# finai-backend/routers/users.py
from fastapi import APIRouter, HTTPException
from bson import ObjectId
from database import db
from typing import List
from pydantic import BaseModel 

from schemas.user import UserResponse

router = APIRouter(prefix="/api/users", tags=["Admin Users"])

# --- SCHEMAS PARA SA PROFILE UPDATES ---
class UpdateIncomeSchema(BaseModel):
    monthly_income: float

class ChangePinSchema(BaseModel):
    old_pin: str
    new_pin: str

class ChangePasswordSchema(BaseModel):
    old_password: str
    new_password: str


# --- EXISTING ADMIN ENDPOINTS ---
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
    
    await db.expenses.delete_many({"user_id": user_id})
    await db.accounts.delete_many({"user_id": user_id, "account_role": "user"})
    
    return {"message": "User and their data deleted successfully"}


# --- NEW PROFILE ENDPOINTS ---
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
    
    if user.get("pin") and user.get("pin") != data.old_pin:
        raise HTTPException(status_code=400, detail="Mali ang iyong kasalukuyang PIN.")
        
    await db.users.update_one(
        {"_id": oid},
        {"$set": {"pin": data.new_pin}}
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
    
    # Check kung tama ang lumang password
    if user.get("password") and user.get("password") != data.old_password:
        raise HTTPException(status_code=400, detail="Mali ang iyong kasalukuyang password.")
        
    await db.users.update_one(
        {"_id": oid},
        {"$set": {"password": data.new_password}}
    )
    return {"status": "Success", "message": "Password changed successfully!"}