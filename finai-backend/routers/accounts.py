# finai-backend/routers/accounts.py
from fastapi import APIRouter, HTTPException
from bson import ObjectId
from database import db
from schemas.account import AccountCreate, AccountResponse
from typing import List, Optional

router = APIRouter(prefix="/api/accounts", tags=["Accounts"])

@router.get("/", response_model=List[AccountResponse])
async def get_accounts(user_id: Optional[str] = None): 
    # OR query para makuha ang Admin Presets (role or null id) AT ang personalized data ng user
    if user_id:
        query = {
            "$or": [
                {"user_id": None},          # Checks for Python representation
                {"user_id": "null"},        # Fallback string validation
                {"account_role": "admin"},  # PINAKASIGURADO: Lalabas lahat ng gawa ng admin preset niyo
                {"user_id": user_id}        # Personalized user defined data
            ]
        }
    else:
        # Fallback security filtering
        query = {
            "$or": [
                {"user_id": None},
                {"account_role": "admin"}
            ]
        }

    accounts = []
    async for acc in db.accounts.find(query):
        # I-convert ang _id (ObjectId) sa id (string)
        acc_data = {**acc, "id": str(acc["_id"])}
        
        # Siguraduhin na ang nullable types ay hindi magka-conflict sa Pydantic mapping
        if acc_data.get("user_id") is None:
            acc_data["user_id"] = None
            
        accounts.append(AccountResponse(**acc_data))
    return accounts


@router.get("/templates", response_model=List[AccountResponse])
async def get_account_templates():
    """Return only admin-managed account types for the preset manager and user setup."""
    accounts = []
    async for acc in db.accounts.find({"account_role": "admin"}):
        accounts.append(AccountResponse(**{**acc, "id": str(acc["_id"])}))
    return accounts


@router.get("/user/{user_id}", response_model=List[AccountResponse])
async def get_user_accounts(user_id: str):
    """Transaction screens must only receive accounts owned by this user."""
    accounts = []
    async for acc in db.accounts.find({"user_id": user_id, "account_role": "user"}):
        accounts.append(AccountResponse(**{**acc, "id": str(acc["_id"])}))
    return accounts

@router.post("/", response_model=AccountResponse)
async def create_account(account: AccountCreate):
    account_data = account.model_dump()
    account_data["name"] = account_data["name"].strip()
    if not account_data["name"]:
        raise HTTPException(status_code=422, detail="Account name is required")
    # Accounts with an owner are personal instances; records without an owner
    # are admin-managed templates used when creating those instances.
    account_data["account_role"] = "user" if account_data.get("user_id") else "admin"
    if account_data["account_role"] == "admin":
        account_data["parent_template_id"] = None
    new_acc = await db.accounts.insert_one(account_data)
    created_acc = await db.accounts.find_one({"_id": new_acc.inserted_id})
    
    acc_data = {**created_acc, "id": str(created_acc["_id"])}
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
    # Editing a label or opening balance must never turn a user account into a
    # shared template (or the reverse) because a client omitted these fields.
    account_data["user_id"] = existing.get("user_id")
    account_data["account_role"] = existing.get("account_role", "admin")
    account_data["parent_template_id"] = existing.get("parent_template_id")

    updated = await db.accounts.find_one_and_update(
        {"_id": oid},
        {"$set": account_data},
        return_document=True
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Account not found")
    
    acc_data = {**updated, "id": str(updated["_id"])}
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
