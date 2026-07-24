# finai-backend/routers/budgets.py
from fastapi import APIRouter, HTTPException, status
from database import db
from schemas.budget import BudgetCreate, BudgetResponse
from bson import ObjectId

router = APIRouter(prefix="/api/budgets", tags=["Budgets"])

@router.post("/set-limit", response_model=BudgetResponse)
async def set_category_budget(budget: BudgetCreate):
    # Logic: I-upsert (Update kung meron, Insert kung wala)
    existing = await db.budgets.find_one({
        "user_id": budget.user_id,
        "category_id": budget.category_id,
        "month_year": budget.month_year
    })

    if existing:
        # Update existing budget
        updated = await db.budgets.find_one_and_update(
            {"_id": existing["_id"]},
            {"$set": budget.model_dump()},
            return_document=True
        )
        return BudgetResponse(id=str(updated["_id"]), **updated)
    else:
        # Create new budget
        new_budget = await db.budgets.insert_one(budget.model_dump())
        created = await db.budgets.find_one({"_id": new_budget.inserted_id})
        return BudgetResponse(id=str(created["_id"]), **created)


@router.get("/get-all/{user_id}")
async def get_all_budgets(user_id: str):
    cursor = db.budgets.find({"user_id": user_id})
    budgets_list = []
    
    async for budget in cursor:
        # Siguraduhing malinis ang string parsing para sa MongoDB document mapping
        b_id = str(budget["_id"])
        
        # Kung ang month_year format ay nagka-mismatch, sinisiguro natin na may fallback handling ang dictionary mapping niyo
        m_year = budget.get("month_year", "07-2026")
        
        budget_dict = {
            "id": b_id,
            "user_id": budget.get("user_id"),
            "category_id": budget.get("category_id"),
            "amount": float(budget.get("amount", 0.0)),
            "month_year": m_year,  
            "spent": float(budget.get("spent", 0.0))
        }
        budgets_list.append(budget_dict)
    
    return budgets_list

@router.put("/update/{budget_id}")
async def update_budget(budget_id: str, budget_data: dict):
    result = await db.budgets.find_one_and_update(
        {"_id": ObjectId(budget_id)},
        {"$set": {"amount": budget_data.get("amount")}},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Budget not found")
    return {"status": "Success", "data": {**result, "_id": str(result["_id"])}}

@router.delete("/delete/{budget_id}")
async def delete_budget(budget_id: str):
    result = await db.budgets.delete_one({"_id": ObjectId(budget_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
    return {"status": "Success", "message": "Budget deleted successfully"}