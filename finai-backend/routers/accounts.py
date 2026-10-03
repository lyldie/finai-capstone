# finai-backend/routers/accounts.py
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPAuthorizationCredentials
from bson import ObjectId
from database import db
from schemas.account import AccountCreate, AccountResponse
from typing import List, Optional
import re

from auth import get_current_admin, verify_admin_credentials, bearer_scheme
from .logs import log_action

router = APIRouter(prefix="/api/accounts", tags=["Accounts"])

async def calculate_account_balance(account_name: str, user_id: Optional[str], initial_balance: float) -> float:
    """(unchanged)"""
    if not user_id:
        return float(initial_balance)
    balance = float(initial_balance)
    query = {"user_id": user_id, "$or": [{"account": account_name}, {"to_account": account_name}]}
    async for txn in db.expenses.find(query):
        t_type = txn.get("type", "").capitalize()
        amount = float(txn.get("amount", 0))
        acc_from = txn.get("account")
        acc_to = txn.get("to_account")
        if t_type == "Income" and acc_from == account_name:
            balance += amount
        elif t_type == "Expense" and acc_from == account_name:
            balance -= amount
        elif t_type == "Transfer":
            if acc_from == account_name:
                balance -= amount
            if acc_to == account_name:
                balance += amount
    return balance


async def _check_duplicate_name(name: str, user_id: Optional[str], exclude_id: Optional[ObjectId] = None):
    """CHANGED: now excludes archived items -- an archived preset's name is
    free to reuse. Without this, archiving "Cash" would permanently block
    ever creating another "Cash" preset, which defeats a big part of the
    point of archiving over deleting."""
    scope_query = {
        "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"},
        "is_archived": {"$ne": True},
    }
    if user_id:
        scope_query["user_id"] = user_id
    else:
        scope_query["account_role"] = "admin"
    if exclude_id is not None:
        scope_query["_id"] = {"$ne": exclude_id}
    duplicate = await db.accounts.find_one(scope_query)
    if duplicate:
        raise HTTPException(status_code=409, detail="An account with this name already exists.")


@router.get("/", response_model=List[AccountResponse])
async def get_accounts(user_id: Optional[str] = None, archived: bool = False):
    """CHANGED: added `archived` query param. Default (False) excludes
    archived items, matching every existing caller's expectations unchanged.
    Pass archived=true to see only the archived ones (used by accounts.tsx's
    new Archived tab)."""
    if user_id:
        query = {"$or": [{"user_id": None}, {"user_id": "null"}, {"account_role": "admin"}, {"user_id": user_id}]}
    else:
        query = {"$or": [{"user_id": None}, {"account_role": "admin"}]}

    query = {"$and": [query, {"is_archived": True if archived else {"$ne": True}}]}

    accounts = []
    async for acc in db.accounts.find(query):
        acc_id = str(acc["_id"])
        acc_name = acc.get("name", "")
        init_bal = float(acc.get("initial_balance", 0.0))
        live_balance = await calculate_account_balance(acc_name, user_id, init_bal)
        acc_data = {**acc, "id": acc_id, "current_balance": live_balance}
        if acc_data.get("user_id") is None:
            acc_data["user_id"] = None
        accounts.append(AccountResponse(**acc_data))
    return accounts


@router.get("/templates", response_model=List[AccountResponse])
async def get_account_templates(archived: bool = False):
    """CHANGED: added `archived` filter, same reasoning as get_accounts."""
    query = {"account_role": "admin", "is_archived": True if archived else {"$ne": True}}
    accounts = []
    async for acc in db.accounts.find(query):
        acc_id = str(acc["_id"])
        init_bal = float(acc.get("initial_balance", 0.0))
        accounts.append(AccountResponse(**{**acc, "id": acc_id, "current_balance": init_bal}))
    return accounts


@router.get("/user/{user_id}", response_model=List[AccountResponse])
async def get_user_accounts(user_id: str):
    """(unchanged) -- a user's own transaction-entry screens should never
    see an archived account anyway, but archiving is an admin-preset concept
    here, not something that applies to personal accounts, so no filter
    needed."""
    accounts = []
    async for acc in db.accounts.find({"user_id": user_id, "account_role": "user"}):
        acc_id = str(acc["_id"])
        acc_name = acc.get("name", "")
        init_bal = float(acc.get("initial_balance", 0.0))
        live_balance = await calculate_account_balance(acc_name, user_id, init_bal)
        acc_data = {**acc, "id": acc_id, "current_balance": live_balance}
        accounts.append(AccountResponse(**acc_data))
    return accounts


@router.post("/", response_model=AccountResponse)
async def create_account(account: AccountCreate):
    """(unchanged) User-only: requires user_id."""
    account_data = account.model_dump()
    account_data["name"] = account_data["name"].strip()
    if not account_data["name"]:
        raise HTTPException(status_code=422, detail="Account name is required")
    if not account_data.get("user_id"):
        raise HTTPException(status_code=400, detail="user_id is required to create a personal account. Admin presets must use POST /api/accounts/admin.")

    account_data["account_role"] = "user"
    await _check_duplicate_name(account_data["name"], account_data["user_id"])

    new_acc = await db.accounts.insert_one(account_data)
    created_acc = await db.accounts.find_one({"_id": new_acc.inserted_id})
    init_bal = float(created_acc.get("initial_balance", 0.0))
    acc_data = {**created_acc, "id": str(created_acc["_id"]), "current_balance": init_bal}
    return AccountResponse(**acc_data)


@router.post("/admin", response_model=AccountResponse)
async def create_admin_account_preset(account: AccountCreate, admin: dict = Depends(get_current_admin)):
    """(unchanged) Admin-only preset creation."""
    account_data = account.model_dump()
    account_data["name"] = account_data["name"].strip()
    if not account_data["name"]:
        raise HTTPException(status_code=422, detail="Account name is required")

    account_data["user_id"] = None
    account_data["account_role"] = "admin"
    account_data["parent_template_id"] = None
    account_data["is_archived"] = False

    await _check_duplicate_name(account_data["name"], None)

    new_acc = await db.accounts.insert_one(account_data)
    created_acc = await db.accounts.find_one({"_id": new_acc.inserted_id})
    init_bal = float(created_acc.get("initial_balance", 0.0))
    acc_data = {**created_acc, "id": str(created_acc["_id"]), "current_balance": init_bal}

    await log_action(admin["name"], f"Created account preset '{account_data['name']}'")
    return AccountResponse(**acc_data)


@router.put("/{account_id}", response_model=AccountResponse)
async def update_account(
    account_id: str,
    account: AccountCreate,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
):
    """(unchanged)"""
    try:
        oid = ObjectId(account_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid Account ID format")

    existing = await db.accounts.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Account not found")

    admin_actor = None
    if existing.get("account_role") == "admin":
        admin_actor = await verify_admin_credentials(credentials)
    else:
        claimed_user_id = account.user_id
        if not claimed_user_id or str(existing.get("user_id")) != str(claimed_user_id):
            raise HTTPException(status_code=403, detail="You don't have permission to edit this account.")

    account_data = account.model_dump()
    account_data["name"] = account_data["name"].strip()
    if not account_data["name"]:
        raise HTTPException(status_code=422, detail="Account name is required")

    account_data["user_id"] = existing.get("user_id")
    account_data["account_role"] = existing.get("account_role", "admin")
    account_data["parent_template_id"] = existing.get("parent_template_id")

    await _check_duplicate_name(account_data["name"], account_data.get("user_id"), exclude_id=oid)

    old_name = existing.get("name")
    new_name = account_data["name"]

    updated = await db.accounts.find_one_and_update({"_id": oid}, {"$set": account_data}, return_document=True)
    if not updated:
        raise HTTPException(status_code=404, detail="Account not found")

    owner_user_id = updated.get("user_id")
    if owner_user_id and new_name != old_name:
        await db.expenses.update_many({"user_id": owner_user_id, "account": old_name}, {"$set": {"account": new_name}})
        await db.expenses.update_many({"user_id": owner_user_id, "to_account": old_name}, {"$set": {"to_account": new_name}})

    acc_name = updated.get("name", "")
    user_id = updated.get("user_id")
    init_bal = float(updated.get("initial_balance", 0.0))
    live_balance = await calculate_account_balance(acc_name, user_id, init_bal)

    if admin_actor and old_name != new_name:
        await log_action(admin_actor["name"], f"Renamed account '{old_name}' to '{new_name}'")

    acc_data = {**updated, "id": str(updated["_id"]), "current_balance": live_balance}
    return AccountResponse(**acc_data)


@router.patch("/{account_id}/archive", response_model=AccountResponse)
async def archive_account(account_id: str, admin: dict = Depends(get_current_admin)):
    """NEW: replaces hard-deleting an admin preset."""
    try:
        oid = ObjectId(account_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid Account ID format")

    account = await db.accounts.find_one({"_id": oid})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if account.get("account_role") != "admin":
        raise HTTPException(status_code=400, detail="Only account presets can be archived here. Personal accounts are managed by their owner.")

    updated = await db.accounts.find_one_and_update({"_id": oid}, {"$set": {"is_archived": True}}, return_document=True)
    await log_action(admin["name"], f"Archived account '{account.get('name')}'")

    init_bal = float(updated.get("initial_balance", 0.0))
    return AccountResponse(**{**updated, "id": str(updated["_id"]), "current_balance": init_bal})


@router.patch("/{account_id}/restore", response_model=AccountResponse)
async def restore_account(account_id: str, admin: dict = Depends(get_current_admin)):
    """NEW: the undo for archive_account above."""
    try:
        oid = ObjectId(account_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid Account ID format")

    account = await db.accounts.find_one({"_id": oid})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    await _check_duplicate_name(account.get("name", ""), account.get("user_id"), exclude_id=oid)

    updated = await db.accounts.find_one_and_update({"_id": oid}, {"$set": {"is_archived": False}}, return_document=True)
    await log_action(admin["name"], f"Restored account '{account.get('name')}'")

    init_bal = float(updated.get("initial_balance", 0.0))
    return AccountResponse(**{**updated, "id": str(updated["_id"]), "current_balance": init_bal})


# 👈 BAGONG IDINAGDAG: Permanent Delete endpoint para sa Admin Account Preset na may transaction check
@router.delete("/admin/{account_id}/permanent")
async def permanent_delete_account(account_id: str, admin: dict = Depends(get_current_admin)):
    """NEW: Permanently delete an archived admin account preset if no transactions use it."""
    try:
        oid = ObjectId(account_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid Account ID format")

    account = await db.accounts.find_one({"_id": oid})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    if account.get("account_role") != "admin":
        raise HTTPException(status_code=400, detail="Only admin account presets can be permanently deleted through this route.")

    account_name = account.get("name")

    # I-check kung may active transactions pang nakatali sa account na ito
    linked_transaction = await db.expenses.find_one({"$or": [{"account": account_name}, {"to_account": account_name}]})
    if linked_transaction:
        raise HTTPException(
            status_code=400, 
            detail="Hindi ma-permanently delete. May mga active transactions pang gumagamit sa account na ito."
        )

    result = await db.accounts.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Account not found")

    await log_action(admin["name"], f"Permanently deleted account preset '{account_name}'")
    return {"message": "Account permanently deleted successfully"}


@router.delete("/{account_id}")
async def delete_account(
    account_id: str,
    user_id: Optional[str] = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
):
    """CHANGED: admin presets can no longer be hard-deleted through this endpoint."""
    try:
        oid = ObjectId(account_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid Account ID format")

    account = await db.accounts.find_one({"_id": oid})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    if account.get("account_role") == "admin":
        raise HTTPException(status_code=400, detail="Account presets can't be deleted -- use archive instead (PATCH /api/accounts/{id}/archive).")

    if not user_id or str(account.get("user_id")) != str(user_id):
        raise HTTPException(status_code=403, detail="You don't have permission to delete this account.")

    transaction_query = {"$or": [{"account": account["name"]}, {"to_account": account["name"]}]}
    if account.get("user_id"):
        transaction_query["user_id"] = account["user_id"]

    linked_transaction = await db.expenses.find_one(transaction_query)
    if linked_transaction:
        raise HTTPException(status_code=409, detail="An account with transaction history cannot be deleted.")

    result = await db.accounts.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Account not found")

    return {"message": "Account deleted successfully"}