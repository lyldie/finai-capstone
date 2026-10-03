from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from pymongo import ReturnDocument

from database import db
from schemas.budget import BudgetCreate
from services.budget_service import (
    category_for_budget,
    create_crossed_threshold_notifications,
    list_budget_usage,
    normalize_period_type,
    period_details,
)
from services.budget_service import ph_today
from auth import get_current_user


router = APIRouter(prefix="/api/budgets", tags=["Budgets"])


@router.post("/set-limit", status_code=status.HTTP_201_CREATED)
async def set_category_budget(budget: BudgetCreate, current_user: dict = Depends(get_current_user)):
    """Create or update one user/category/period budget without storing derived spending."""
    user_id = current_user["id"]
    category = await category_for_budget(budget.category_id, user_id)
    if not category or category.get("is_archived", False) or category.get("type", "").lower() != "expense":
        raise HTTPException(status_code=400, detail="Choose an expense category available to this user.")

    period_type = normalize_period_type(budget.period_type)
    _, default_key, _, _ = period_details(period_type, ph_today())
    period_key = budget.period_key or default_key
    if period_key != default_key:
        raise HTTPException(status_code=400, detail="Budgets can only be created for the current period.")
    query = {"user_id": user_id, "category_id": budget.category_id,
             "period_type": period_type, "period_key": period_key}
    now = datetime.utcnow()
    update_doc = {**budget.model_dump(), "user_id": user_id, "period_type": period_type, "period_key": period_key,
                  "spent": 0.0, "updated_at": now}

    # FIX: Use an ATOMIC upsert instead of separate find-then-insert/update steps.
    # The old check-then-act version had a race: two near-simultaneous requests
    # (e.g. a double-tap on "Save" from a laggy connection) could both pass the
    # "no existing budget found" check before either write completed, creating two
    # duplicate budget documents for the same user/category/period. MongoDB guarantees
    # find_one_and_update with upsert=True happens as a single atomic operation.
    result = await db.budgets.find_one_and_update(
        query,
        {"$set": update_doc, "$setOnInsert": {"created_at": now}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    budget_id = result["_id"]

    # Recompute alerts immediately: a newly-set (or edited) limit can itself push a
    # budget past 70/90/100% without any new transaction, e.g. lowering a ₱1000 limit
    # to ₱500 while ₱480 is already spent. Previously only expense writes triggered this.
    await create_crossed_threshold_notifications(user_id)

    return {"status": "Success", "id": str(budget_id)}


@router.get("/get-all/{user_id}")
async def get_all_budgets(user_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    return await list_budget_usage(user_id)


@router.get("/summary/{user_id}")
async def get_budget_summary(user_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
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
async def update_budget(budget_id: str, budget_data: Dict[str, Any], current_user: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(budget_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid budget ID")

    # FIX: require and verify user_id so only the budget's owner can edit it. Previously
    # this endpoint took no ownership information at all -- anyone who obtained a
    # budget_id could edit any user's budget.
    requester_id = current_user["id"]

    amount = budget_data.get("amount")
    if isinstance(amount, bool) or not isinstance(amount, (int, float)) or not 0 < amount < float("inf"):
        raise HTTPException(status_code=400, detail="Budget amount must be greater than zero.")

    existing = await db.budgets.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Budget not found")
    if str(existing.get("user_id", "")) != requester_id:
        raise HTTPException(status_code=404, detail="Budget not found")

    result = await db.budgets.update_one({"_id": oid}, {"$set": {"amount": float(amount), "updated_at": datetime.utcnow()}})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Budget not found")

    # Same reasoning as set_category_budget above: editing the limit can itself cross
    # (or un-cross) a threshold, so re-run the check right away instead of waiting for
    # the next unrelated transaction to happen to recompute it.
    await create_crossed_threshold_notifications(str(requester_id))

    return {"status": "Success"}


@router.delete("/delete/{budget_id}")
async def delete_budget(budget_id: str, user_id: str, current_user: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(budget_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid budget ID")

    # FIX: same ownership check as update_budget above -- previously any budget_id
    # could be deleted by anyone, with no verification of who owns it.
    user_id = current_user["id"]
    existing = await db.budgets.find_one({"_id": oid, "user_id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Budget not found")
    result = await db.budgets.delete_one({"_id": oid, "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
    await db.notifications.delete_many({"budget_id": budget_id, "user_id": user_id})
    return {"status": "Success", "message": "Budget deleted successfully"}
