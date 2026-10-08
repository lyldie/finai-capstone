# finai-backend/routers/users.py
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from bson import ObjectId
from database import db
from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field
from passlib.context import CryptContext
from datetime import datetime
import re

from schemas.user import UserResponse
from auth import SUPER_ADMIN_EMAIL, get_current_admin, get_current_super_admin, get_current_user
from email_utils import send_password_change_notice
from .logs import log_action

router = APIRouter(prefix="/api/users", tags=["Admin Users"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class UpdateIncomeSchema(BaseModel):
    monthly_income: float = Field(..., ge=0, allow_inf_nan=False)


class OwnProfileResponse(BaseModel):
    monthly_income: Optional[float] = None


class ChangePinSchema(BaseModel):
    old_pin: str
    new_pin: str = Field(..., min_length=4, max_length=4, pattern=r"^\d{4}$")


class ChangePasswordSchema(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=10, max_length=72)


class AdminAccountCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=10)


class AdminAccountUpdate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: Optional[str] = None


def validate_admin_password(password: str) -> str:
    if len(password.encode('utf-8')) > 72:
        raise HTTPException(status_code=400, detail="Password must be no more than 72 bytes.")
    if not (re.search(r"[a-z]", password) and re.search(r"[A-Z]", password) and re.search(r"\d", password)):
        raise HTTPException(status_code=400, detail="Use uppercase and lowercase letters and at least one number in the password.")
    return password


def validate_user_password(password: str) -> str:
    if len(password.encode('utf-8')) > 72:
        raise HTTPException(status_code=400, detail="Password must be no more than 72 bytes.")
    if len(password) < 10 or not (
        re.search(r"[a-z]", password)
        and re.search(r"[A-Z]", password)
        and re.search(r"\d", password)
    ):
        raise HTTPException(
            status_code=400,
            detail="Use at least 10 characters, uppercase and lowercase letters, and a number.",
        )
    return password


def format_admin_account(admin: dict) -> dict:
    email = str(admin.get('email', '')).strip().lower()
    return {
        'id': str(admin['_id']),
        'name': admin.get('name', 'Admin'),
        'email': admin.get('email', ''),
        'is_archived': bool(admin.get('is_archived', False)),
        'is_super_admin': bool(SUPER_ADMIN_EMAIL and email == SUPER_ADMIN_EMAIL),
        'created_at': admin.get('created_at'),
    }


@router.get('/admin-accounts/access')
async def get_admin_account_management_access(admin: dict = Depends(get_current_admin)):
    """Let the admin dashboard show the admin-management link only to the configured super admin."""
    return {'can_manage_admins': bool(SUPER_ADMIN_EMAIL and admin.get('email', '').strip().lower() == SUPER_ADMIN_EMAIL)}


@router.get('/admin-accounts')
async def list_admin_accounts(archived: bool = False, admin: dict = Depends(get_current_super_admin)):
    query = {'role': 'admin', 'is_archived': True if archived else {'$ne': True}}
    accounts = []
    async for account in db.users.find(query).sort('name', 1):
        accounts.append(format_admin_account(account))
    return accounts


@router.post('/admin-accounts', status_code=201)
async def create_admin_account(data: AdminAccountCreate, admin: dict = Depends(get_current_super_admin)):
    clean_name = ' '.join(data.name.split())
    clean_email = data.email.lower().strip()
    if len(clean_name) < 2:
        raise HTTPException(status_code=422, detail="Enter the administrator's name.")
    password = validate_admin_password(data.password)
    if await db.users.find_one({'email': clean_email}):
        raise HTTPException(status_code=409, detail='An account with this email already exists.')

    new_admin = {
        'name': clean_name,
        'email': clean_email,
        'password': pwd_context.hash(password),
        'role': 'admin',
        'onboarding_completed': True,
        'created_at': datetime.utcnow(),
    }
    result = await db.users.insert_one(new_admin)
    new_admin['_id'] = result.inserted_id
    await log_action(admin['name'], f"Created administrator account for '{clean_email}'")
    return format_admin_account(new_admin)


@router.put('/admin-accounts/{admin_id}')
async def update_admin_account(admin_id: str, data: AdminAccountUpdate, admin: dict = Depends(get_current_super_admin)):
    try:
        target_id = ObjectId(admin_id)
    except Exception:
        raise HTTPException(status_code=400, detail='Invalid administrator ID.')

    target = await db.users.find_one({'_id': target_id, 'role': 'admin'})
    if not target:
        raise HTTPException(status_code=404, detail='Administrator account not found.')
    if str(target.get('email', '')).strip().lower() == SUPER_ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail='The configured super-admin account cannot be edited here.')

    clean_name = ' '.join(data.name.split())
    clean_email = data.email.lower().strip()
    if len(clean_name) < 2:
        raise HTTPException(status_code=422, detail="Enter the administrator's name.")
    duplicate = await db.users.find_one({'email': clean_email, '_id': {'$ne': target_id}})
    if duplicate:
        raise HTTPException(status_code=409, detail='An account with this email already exists.')

    updates = {'name': clean_name, 'email': clean_email}
    if data.password:
        updates['password'] = pwd_context.hash(validate_admin_password(data.password))
    await db.users.update_one({'_id': target_id, 'role': 'admin'}, {'$set': updates})
    updated = await db.users.find_one({'_id': target_id})
    await log_action(admin['name'], f"Updated administrator account for '{clean_email}'")
    return format_admin_account(updated)


@router.patch('/admin-accounts/{admin_id}/archive')
async def archive_admin_account(admin_id: str, admin: dict = Depends(get_current_super_admin)):
    try:
        target_id = ObjectId(admin_id)
    except Exception:
        raise HTTPException(status_code=400, detail='Invalid administrator ID.')
    target = await db.users.find_one({'_id': target_id, 'role': 'admin'})
    if not target:
        raise HTTPException(status_code=404, detail='Administrator account not found.')
    if str(target.get('email', '')).strip().lower() == SUPER_ADMIN_EMAIL or admin_id == admin['id']:
        raise HTTPException(status_code=403, detail='You cannot archive the configured super-admin account.')

    await db.users.update_one({'_id': target_id}, {'$set': {'is_archived': True}})
    await log_action(admin['name'], f"Archived administrator account for '{target.get('email', admin_id)}'")
    return {'message': 'Administrator account archived.'}


@router.patch('/admin-accounts/{admin_id}/restore')
async def restore_admin_account(admin_id: str, admin: dict = Depends(get_current_super_admin)):
    try:
        target_id = ObjectId(admin_id)
    except Exception:
        raise HTTPException(status_code=400, detail='Invalid administrator ID.')
    target = await db.users.find_one({'_id': target_id, 'role': 'admin'})
    if not target:
        raise HTTPException(status_code=404, detail='Administrator account not found.')
    await db.users.update_one({'_id': target_id}, {'$set': {'is_archived': False}})
    await log_action(admin['name'], f"Restored administrator account for '{target.get('email', admin_id)}'")
    return {'message': 'Administrator account restored.'}


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


# --- SELF-SERVICE PROFILE ENDPOINTS ---
@router.get("/me/profile", response_model=OwnProfileResponse)
async def get_own_profile(current_user: dict = Depends(get_current_user)):
    """Return only the signed-in user's baseline needed by the Profile screen."""
    try:
        user_oid = ObjectId(current_user["id"])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    user = await db.users.find_one(
        {"_id": user_oid},
        {"_id": 0, "monthly_income": 1},
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {"monthly_income": user.get("monthly_income")}


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
        raise HTTPException(status_code=400, detail="Your current PIN is incorrect.")

    await db.users.update_one(
        {"_id": oid},
        {"$set": {"pin": pwd_context.hash(data.new_pin)}}
    )
    return {"status": "Success", "message": "PIN changed successfully!"}


@router.patch("/{user_id}/change-password")
async def change_password(
    user_id: str,
    data: ChangePasswordSchema,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
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
            raise HTTPException(status_code=400, detail="Your current password is incorrect.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Your current password is incorrect.")

    new_password = validate_user_password(data.new_password)
    await db.users.update_one(
        {"_id": oid},
        {"$set": {"password": pwd_context.hash(new_password)}}
    )
    email = user.get("email")
    if email:
        background_tasks.add_task(send_password_change_notice, email)
    return {
        "status": "Success",
        "message": "Password changed successfully.",
        "security_notification_queued": bool(email),
    }
