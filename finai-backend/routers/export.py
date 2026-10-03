# finai-backend/routers/export.py
from fastapi import APIRouter, HTTPException, Depends
from database import db
from auth import bearer_scheme
from fastapi.security import HTTPAuthorizationCredentials
from typing import Optional

router = APIRouter(prefix="/api/export", tags=["Export"])

@router.get("/backup")
async def export_user_data(user_id: str, credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)):
    """Export all financial records (transactions, accounts, budgets, and goals) for a specific user."""
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required for export.")

    # 1. Kunin ang mga transaksyon ng user
    transactions = []
    async for txn in db.expenses.find({"user_id": user_id}):
        txn["_id"] = str(txn["_id"])
        transactions.append(txn)

    # 2. Kunin ang mga accounts ng user
    accounts = []
    async for acc in db.accounts.find({"user_id": user_id}):
        acc["_id"] = str(acc["_id"])
        accounts.append(acc)

    # 3. Kunin ang mga budgets ng user
    budgets = []
    async for bgt in db.budgets.find({"user_id": user_id}):
        bgt["_id"] = str(bgt["_id"])
        budgets.append(bgt)

    # 4. Kunin ang mga financial goals ng user
    goals = []
    async for goal in db.goals.find({"user_id": user_id}):
        goal["_id"] = str(goal["_id"])
        goals.append(goal)

    backup_data = {
        "version": "1.0",
        "user_id": user_id,
        "transactions": transactions,
        "accounts": accounts,
        "budgets": budgets,
        "goals": goals
    }

    return backup_data


@router.post("/restore")
async def restore_user_data(payload: dict, credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)):
    """Restore or import financial records using Overwrite Strategy to prevent duplicates."""
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required in backup payload.")

    try:
        # OVERWRITE STRATEGY: Burahin muna ang lumang data ng user na ito para malinis ang pag-restore
        await db.expenses.delete_many({"user_id": user_id})
        await db.accounts.delete_many({"user_id": user_id})
        await db.budgets.delete_many({"user_id": user_id})
        await db.goals.delete_many({"user_id": user_id})

        # 1. I-restore ang transactions
        transactions = payload.get("transactions", [])
        if transactions:
            for txn in transactions:
                txn.pop("_id", None) # Tanggalin ang old ID para gawan ng bago ng MongoDB
                txn["user_id"] = user_id
                await db.expenses.insert_one(txn)

        # 2. I-restore ang accounts
        accounts = payload.get("accounts", [])
        if accounts:
            for acc in accounts:
                acc.pop("_id", None)
                acc["user_id"] = user_id
                await db.accounts.insert_one(acc)

        # 3. I-restore ang budgets
        budgets = payload.get("budgets", [])
        if budgets:
            for bgt in budgets:
                bgt.pop("_id", None)
                bgt["user_id"] = user_id
                await db.budgets.insert_one(bgt)

        # 4. I-restore ang goals
        goals = payload.get("goals", [])
        if goals:
            for goal in goals:
                goal.pop("_id", None)
                goal["user_id"] = user_id
                await db.goals.insert_one(goal)

        return {"status": "success", "message": "Matagumpay na naibalik ang mga financial records (Overwrite complete)!"}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Restore failed: {str(e)}")