# finai-backend/routers/accounts.py
from fastapi import APIRouter, HTTPException
from bson import ObjectId
from database import db
from schemas.account import AccountCreate, AccountResponse
from typing import List, Optional
import re

router = APIRouter(prefix="/api/accounts", tags=["Accounts"])

async def calculate_account_balance(account_name: str, user_id: Optional[str], initial_balance: float) -> float:
    """Kinakalkula ang live balance base sa initial balance at sa mga transaksyon ng account na ito.

    SECURITY FIX: kailangan ng user_id para ma-scope nang tama ang mga transaksyon sa isang
    user lang. Dati, kung walang user_id na ipinasa, gumagawa pa rin ito ng query na walang
    user filter -- ibig sabihin, kung dalawang magkaibang user ay may account na parehong
    pangalan (hal. "Cash", karaniwang default name), pinagsasama ang transactions ng LAHAT
    ng users papunta sa isang "balance" -- isang cross-user data leak. Ngayon, kung walang
    user_id, ibabalik na lang ang initial_balance nang hindi nag-qquery sa db.expenses.
    """
    if not user_id:
        return float(initial_balance)

    balance = float(initial_balance)

    query = {
        "user_id": user_id,
        "$or": [
            {"account": account_name},
            {"to_account": account_name}
        ]
    }

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
    """Block two accounts with the same name in the same scope (per-user, or per-admin-template).
    Balance matching is done by name string, so a silent duplicate would let two distinct
    wallets merge into one combined-looking balance."""
    scope_query = {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}
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
async def get_accounts(user_id: Optional[str] = None): 
    if user_id:
        query = {
            "$or": [
                {"user_id": None},          
                {"user_id": "null"},        
                {"account_role": "admin"},  
                {"user_id": user_id}        
            ]
        }
    else:
        query = {
            "$or": [
                {"user_id": None},
                {"account_role": "admin"}
            ]
        }

    accounts = []
    async for acc in db.accounts.find(query):
        acc_id = str(acc["_id"])
        acc_name = acc.get("name", "")
        init_bal = float(acc.get("initial_balance", 0.0))
        
        live_balance = await calculate_account_balance(acc_name, user_id, init_bal)

        acc_data = {
            **acc, 
            "id": acc_id,
            "current_balance": live_balance
        }
        
        if acc_data.get("user_id") is None:
            acc_data["user_id"] = None
            
        accounts.append(AccountResponse(**acc_data))
    return accounts


@router.get("/templates", response_model=List[AccountResponse])
async def get_account_templates():
    """Return only admin-managed account types for the preset manager and user setup."""
    accounts = []
    async for acc in db.accounts.find({"account_role": "admin"}):
        acc_id = str(acc["_id"])
        init_bal = float(acc.get("initial_balance", 0.0))
        accounts.append(AccountResponse(**{**acc, "id": acc_id, "current_balance": init_bal}))
    return accounts


@router.get("/user/{user_id}", response_model=List[AccountResponse])
async def get_user_accounts(user_id: str):
    """Transaction screens must only receive accounts owned by this user with live computed balances."""
    accounts = []
    async for acc in db.accounts.find({"user_id": user_id, "account_role": "user"}):
        acc_id = str(acc["_id"])
        acc_name = acc.get("name", "")
        init_bal = float(acc.get("initial_balance", 0.0))
        
        live_balance = await calculate_account_balance(acc_name, user_id, init_bal)

        acc_data = {
            **acc, 
            "id": acc_id,
            "current_balance": live_balance
        }
        accounts.append(AccountResponse(**acc_data))
    return accounts

@router.post("/", response_model=AccountResponse)
async def create_account(account: AccountCreate):
    account_data = account.model_dump()
    account_data["name"] = account_data["name"].strip()
    if not account_data["name"]:
        raise HTTPException(status_code=422, detail="Account name is required")

    account_data["account_role"] = "user" if account_data.get("user_id") else "admin"
    if account_data["account_role"] == "admin":
        account_data["parent_template_id"] = None

    # FIX: block duplicate names in the same scope before inserting.
    await _check_duplicate_name(account_data["name"], account_data.get("user_id"))

    new_acc = await db.accounts.insert_one(account_data)
    created_acc = await db.accounts.find_one({"_id": new_acc.inserted_id})
    
    init_bal = float(created_acc.get("initial_balance", 0.0))
    acc_data = {
        **created_acc, 
        "id": str(created_acc["_id"]),
        "current_balance": init_bal
    }
    return AccountResponse(**acc_data)

@router.put("/{account_id}", response_model=AccountResponse)
async def update_account(account_id: str, account: AccountCreate):
    try:
        oid = ObjectId(account_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid Account ID format")

    existing = await db.accounts.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Account not found")

    account_data = account.model_dump()
    account_data["name"] = account_data["name"].strip()
    if not account_data["name"]:
        raise HTTPException(status_code=422, detail="Account name is required")
        
    account_data["user_id"] = existing.get("user_id")
    account_data["account_role"] = existing.get("account_role", "admin")
    account_data["parent_template_id"] = existing.get("parent_template_id")

    # FIX: block renaming into a collision with another existing account in the same scope.
    await _check_duplicate_name(account_data["name"], account_data.get("user_id"), exclude_id=oid)

    old_name = existing.get("name")
    new_name = account_data["name"]

    updated = await db.accounts.find_one_and_update(
        {"_id": oid},
        {"$set": account_data},
        return_document=True
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Account not found")

    # FIX: cascade the rename to this user's existing transactions. Balance matching is
    # done by name string (see calculate_account_balance / getAccountBalance in the
    # frontend), so without this, every past transaction referencing the old name would
    # silently stop contributing to this account's balance the moment it's renamed.
    # Only cascades for user-owned accounts -- admin templates have no transactions of
    # their own to update (see get_account_templates, which never computes a live balance).
    owner_user_id = updated.get("user_id")
    if owner_user_id and new_name != old_name:
        await db.expenses.update_many(
            {"user_id": owner_user_id, "account": old_name},
            {"$set": {"account": new_name}}
        )
        await db.expenses.update_many(
            {"user_id": owner_user_id, "to_account": old_name},
            {"$set": {"to_account": new_name}}
        )

    acc_name = updated.get("name", "")
    user_id = updated.get("user_id")
    init_bal = float(updated.get("initial_balance", 0.0))
    live_balance = await calculate_account_balance(acc_name, user_id, init_bal)

    acc_data = {
        **updated, 
        "id": str(updated["_id"]),
        "current_balance": live_balance
    }
    return AccountResponse(**acc_data)

@router.delete("/{account_id}")
async def delete_account(account_id: str):
    try:
        oid = ObjectId(account_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid Account ID format")

    account = await db.accounts.find_one({"_id": oid})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
        
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