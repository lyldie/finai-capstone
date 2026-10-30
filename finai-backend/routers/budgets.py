from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from pymongo import ReturnDocument

from database import db
from schemas.budget import BudgetCreate, BudgetBulkCreate
from services.budget_service import (
    category_for_budget,
    create_crossed_threshold_notifications,
    list_budget_usage,
    legacy_period_key,
    normalize_period_type,
    period_details,
)
from services.budget_service import ph_today
from auth import get_current_user
from routers import advisor


router = APIRouter(prefix="/api/budgets", tags=["Budgets"])


async def _refresh_budget_alerts_and_advisor(user_id: str, category_id: str) -> None:
    """Attach one saved Finn insight to any newly crossed budget alert."""
    notifications = await create_crossed_threshold_notifications(user_id, category_id)
    for notification in notifications:
        try:
            conversation_id = await advisor.queue_proactive_budget_message(user_id, notification)
            if conversation_id:
                await db.notifications.update_one(
                    {"_id": notification.get("id")},
                    {"$set": {"advisor_conversation_id": conversation_id}},
                )
        except Exception as exc:
            # A successful budget save should not fail because advisor message
            # generation or persistence is temporarily unavailable.
            print(f"Could not save proactive budget guidance for user {user_id}: {exc}")


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
    await db.budget_rules.update_one(
        {"user_id": user_id, "category_id": budget.category_id, "period_type": period_type},
        {"$set": {"amount": float(budget.amount), "rollover_enabled": budget.rollover_enabled,
                  "budget_kind": budget.budget_kind,
                  "is_active": True, "updated_at": now},
         "$setOnInsert": {"created_at": now}},
        upsert=True,
    )

    # Recompute alerts immediately: a newly-set (or edited) limit can itself push a
    # budget past 70/90/100% without any new transaction, e.g. lowering a ₱1000 limit
    # to ₱500 while ₱480 is already spent. Previously only expense writes triggered this.
    await _refresh_budget_alerts_and_advisor(user_id, budget.category_id)

    return {"status": "Success", "id": str(budget_id)}


@router.post("/set-limits-bulk", status_code=status.HTTP_201_CREATED)
async def set_category_budgets_bulk(payload: BudgetBulkCreate, current_user: dict = Depends(get_current_user)):
    """Save several different category limits after validating the whole request."""
    user_id = current_user["id"]
    for item in payload.budgets:
        category = await category_for_budget(item.category_id, user_id)
        if not category or category.get("is_archived", False) or category.get("type", "").lower() != "expense":
            raise HTTPException(status_code=400, detail="Choose only available expense categories.")
        period_type = normalize_period_type(item.period_type)
        _, default_key, _, _ = period_details(period_type, ph_today())
        period_key = item.period_key or default_key
        if period_key != default_key:
            raise HTTPException(status_code=400, detail="Budgets can only be created for the current period.")

    results = []
    for item in payload.budgets:
        # Reuse the single-budget implementation so rollover, recurrence, alerts,
        # and advisor refresh behave exactly the same as an individual save.
        results.append(await set_category_budget(item, current_user))
    return {"status": "Success", "saved": len(results), "budgets": results}


@router.get("/get-all/{user_id}")
async def get_all_budgets(user_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    return await list_budget_usage(user_id)


@router.get("/summary/{user_id}")
async def get_budget_summary(user_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    """Return active-cycle totals; historical periods are excluded from the totals."""
    budgets = await list_budget_usage(user_id)
    today_key = ph_today().isoformat()
    active_budgets = [item for item in budgets if item["start_date"] <= today_key <= item["end_date"]]
    total_amount = sum(item["available_limit"] for item in active_budgets)
    total_spent = sum(item["spent"] for item in active_budgets)
    totals_by_period = {}
    for period_type in ("weekly", "monthly", "annual"):
        period_budgets = [item for item in active_budgets if item["period_type"] == period_type]
        period_amount = sum(item["available_limit"] for item in period_budgets)
        period_spent = sum(item["spent"] for item in period_budgets)
        totals_by_period[period_type] = {
            "total_amount": round(period_amount, 2),
            "total_spent": round(period_spent, 2),
            "remaining": round(max(period_amount - period_spent, 0), 2),
            "percentage_used": round((period_spent / period_amount * 100) if period_amount else 0, 2),
        }
    return {
        "budgets": active_budgets,
        "totals_by_period": totals_by_period,
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
    try:
        decimal_amount = Decimal(str(amount))
        if decimal_amount != decimal_amount.quantize(Decimal("0.01")):
            raise HTTPException(status_code=400, detail="Budget amount must have no more than two decimal places.")
    except InvalidOperation as exc:
        raise HTTPException(status_code=400, detail="Budget amount must have no more than two decimal places.") from exc

    existing = await db.budgets.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Budget not found")
    if str(existing.get("user_id", "")) != requester_id:
        raise HTTPException(status_code=404, detail="Budget not found")

    rollover_enabled = budget_data.get("rollover_enabled", bool(existing.get("rollover_enabled", False)))
    if not isinstance(rollover_enabled, bool):
        raise HTTPException(status_code=400, detail="rollover_enabled must be true or false.")
    budget_kind = budget_data.get("budget_kind", existing.get("budget_kind", "variable"))
    if budget_kind not in {"fixed", "variable"}:
        raise HTTPException(status_code=400, detail="budget_kind must be fixed or variable.")

    result = await db.budgets.update_one(
        {"_id": oid},
        {"$set": {"amount": float(amount), "rollover_enabled": rollover_enabled,
                  "budget_kind": budget_kind,
                  "updated_at": datetime.utcnow()}},
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Budget not found")

    current_period_type, current_period_key, _, _ = period_details(
        existing.get("period_type") or existing.get("period"), ph_today(),
    )
    stored_period_key = existing.get("period_key") or legacy_period_key(existing.get("month_year"))
    if stored_period_key == current_period_key:
        await db.budget_rules.update_one(
            {"user_id": requester_id, "category_id": str(existing.get("category_id", "")),
             "period_type": current_period_type},
            {"$set": {"amount": float(amount), "rollover_enabled": rollover_enabled,
                      "budget_kind": budget_kind,
                      "is_active": True, "updated_at": datetime.utcnow()},
             "$setOnInsert": {"created_at": datetime.utcnow()}},
            upsert=True,
        )

    # Same reasoning as set_category_budget above: editing the limit can itself cross
    # (or un-cross) a threshold, so re-run the check right away instead of waiting for
    # the next unrelated transaction to happen to recompute it.
    await _refresh_budget_alerts_and_advisor(
        str(requester_id), str(existing.get("category_id", ""))
    )

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
    period_type, current_period_key, _, _ = period_details(
        existing.get("period_type") or existing.get("period"), ph_today(),
    )
    stored_period_key = existing.get("period_key") or legacy_period_key(existing.get("month_year"))
    if stored_period_key == current_period_key:
        # Deleting the active-cycle budget also stops future recurrence. Old
        # history remains intact, and this rule will not recreate the budget.
        await db.budget_rules.update_one(
            {"user_id": user_id, "category_id": str(existing.get("category_id", "")),
             "period_type": period_type},
            {"$set": {"is_active": False, "updated_at": datetime.utcnow()},
             "$setOnInsert": {"amount": float(existing.get("amount", 0) or 0),
                              "rollover_enabled": bool(existing.get("rollover_enabled", False)),
                              "created_at": datetime.utcnow()}},
            upsert=True,
        )
    result = await db.budgets.delete_one({"_id": oid, "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
    await db.notifications.delete_many({"budget_id": budget_id, "user_id": user_id})
    return {"status": "Success", "message": "Budget deleted successfully"}
