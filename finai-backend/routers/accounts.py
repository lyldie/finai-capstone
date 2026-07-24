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

@router.post("/", response_model=AccountResponse)
async def create_account(account: AccountCreate):
    new_acc = await db.accounts.insert_one(account.model_dump())
    created_acc = await db.accounts.find_one({"_id": new_acc.inserted_id})
    
    acc_data = {**created_acc, "id": str(created_acc["_id"])}
    return AccountResponse(**acc_data)

@router.put("/{account_id}", response_model=AccountResponse)
async def update_account(account_id: str, account: AccountCreate):
    try:
        oid = ObjectId(account_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid Account ID format")

    updated = await db.accounts.find_one_and_update(
        {"_id": oid},
        {"$set": account.model_dump()},
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

    result = await db.accounts.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"message": "Account deleted successfully"}