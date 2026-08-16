from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from bson import ObjectId

from database import db
from schemas.budget import BudgetCreate
from services.budget_service import category_for_budget, list_budget_usage, normalize_period_type, period_details


router = APIRouter(prefix="/api/budgets", tags=["Budgets"])


@router.post("/set-limit", status_code=status.HTTP_201_CREATED)
async def set_category_budget(budget: BudgetCreate):
    """Create or update one user/category/period budget without storing derived spending."""
    category = await category_for_budget(budget.category_id, budget.user_id)
    if not category or category.get("type", "").lower() != "expense":
        raise HTTPException(status_code=400, detail="Choose an expense category available to this user.")

    period_type = normalize_period_type(budget.period_type)
    _, default_key, _, _ = period_details(period_type, datetime.utcnow().date())
    period_key = budget.period_key or default_key
    query = {"user_id": budget.user_id, "category_id": budget.category_id,
             "period_type": period_type, "period_key": period_key}
    document = {**budget.model_dump(), "period_type": period_type, "period_key": period_key,
                "spent": 0.0, "updated_at": datetime.utcnow()}
    existing = await db.budgets.find_one(query)
    if existing:
        await db.budgets.update_one({"_id": existing["_id"]}, {"$set": document})
        budget_id = existing["_id"]
    else:
        document["created_at"] = datetime.utcnow()
        result = await db.budgets.insert_one(document)
        budget_id = result.inserted_id
    return {"status": "Success", "id": str(budget_id)}


@router.get("/get-all/{user_id}")
async def get_all_budgets(user_id: str):
    return await list_budget_usage(user_id)


@router.get("/summary/{user_id}")
async def get_budget_summary(user_id: str):
    """Reusable source of truth for Insights, alerts, charts, and the AI Advisor."""
    budgets = await list_budget_usage(user_id)
    total_amount = sum(item["amount"] for item in budgets)
    total_spent = sum(item["spent"] for item in budgets)
    return {
        "budgets": budgets,
        "total_amount": round(total_amount, 2),
        "total_spent": round(total_spent, 2),
        "remaining": round(max(total_amount - total_spent, 0), 2),
        "percentage_used": round((total_spent / total_amount * 100) if total_amount else 0, 2),
    }


@router.put("/update/{budget_id}")
async def update_budget(budget_id: str, budget_data: dict):
    try:
        oid = ObjectId(budget_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid budget ID")
    amount = budget_data.get("amount")
    if not isinstance(amount, (int, float)) or amount <= 0:
        raise HTTPException(status_code=400, detail="Budget amount must be greater than zero.")
    result = await db.budgets.update_one({"_id": oid}, {"$set": {"amount": float(amount), "updated_at": datetime.utcnow()}})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Budget not found")
    return {"status": "Success"}


@router.delete("/delete/{budget_id}")
async def delete_budget(budget_id: str):
    try:
        oid = ObjectId(budget_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid budget ID")
    result = await db.budgets.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
    await db.notifications.delete_many({"budget_id": budget_id})
    return {"status": "Success", "message": "Budget deleted successfully"}
