# finai-backend/routers/goals.py
from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from typing import Optional
from database import db
from schemas.goal import GoalCreate, GoalResponse, GoalDeposit
from datetime import datetime
from datetime import date
from auth import get_current_user
from .accounts import calculate_account_balance, ensure_account_balance_lock, lock_account_balance
from services.budget_service import create_crossed_threshold_notifications

router = APIRouter(prefix="/api/goals", tags=["Goals"])

# 1. GET ALL GOALS BY USER (FIXED: Added archived filter support)
@router.get("/", response_model=list[GoalResponse])
async def get_user_goals(user_id: str, archived: Optional[bool] = False, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    query = {"user_id": user_id}
    # Kunin lang kung archived o hindi depende sa query param
    query["is_archived"] = True if archived else {"$ne": True}

    goals = []
    async for g in db.goals.find(query):
        goals.append(
            GoalResponse(
                id=str(g["_id"]),
                user_id=g.get("user_id", ""),
                goal_type_id=g.get("goal_type_id", ""),
                target_name=g.get("target_name", ""),
                target_amount=float(g.get("target_amount", 0.0)),
                current_savings=float(g.get("current_savings", 0.0)),
                target_date=g.get("target_date", ""),
                is_archived=g.get("is_archived", False),
            )
        )
    return goals


# 2. GET ARCHIVED GOALS SPECIFIC ENDPOINT (Para hindi mag-404 sa archive.tsx)
@router.get("/archived/{user_id}", response_model=list[GoalResponse])
async def get_archived_goals(user_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    goals = []
    async for g in db.goals.find({"user_id": user_id, "is_archived": True}):
        goals.append(
            GoalResponse(
                id=str(g["_id"]),
                user_id=g.get("user_id", ""),
                goal_type_id=g.get("goal_type_id", ""),  
                target_name=g.get("target_name", ""),
                target_amount=float(g.get("target_amount", 0.0)),
                current_savings=float(g.get("current_savings", 0.0)),
                target_date=g.get("target_date", ""),
                is_archived=g.get("is_archived", False),
            )
        )
    return goals


# 3. CREATE NEW GOAL
@router.post("/", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
async def create_goal(goal: GoalCreate, current_user: dict = Depends(get_current_user)):
    try:
        goal_dict = goal.model_dump()
    except AttributeError:
        goal_dict = goal.dict()

    goal_dict["user_id"] = current_user["id"]
    goal_dict["current_savings"] = 0.0
    try:
        goal_type_oid = ObjectId(goal_dict["goal_type_id"])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid goal type ID.")
    if not await db.goal_types.find_one({"_id": goal_type_oid, "is_archived": {"$ne": True}}):
        raise HTTPException(status_code=400, detail="Choose an active goal type.")
    try:
        date.fromisoformat(goal_dict["target_date"])
    except ValueError:
        raise HTTPException(status_code=422, detail="Target date must be a valid calendar date.")
    goal_dict["is_archived"] = False
    result = await db.goals.insert_one(goal_dict)
    
    created_goal = await db.goals.find_one({"_id": result.inserted_id})
    if not created_goal:
        raise HTTPException(status_code=500, detail="Failed to retrieve created goal")

    return GoalResponse(
        id=str(created_goal["_id"]),
        user_id=created_goal.get("user_id", ""),
        goal_type_id=created_goal.get("goal_type_id", ""),
        target_name=created_goal.get("target_name", ""),
        target_amount=float(created_goal.get("target_amount", 0)),
        current_savings=float(created_goal.get("current_savings", 0)),
        target_date=created_goal.get("target_date", ""),
        is_archived=created_goal.get("is_archived", False),
    )


# 4. UPDATE/EDIT GOAL (Full Update)
@router.put("/{goal_id}", response_model=GoalResponse)
async def update_goal(goal_id: str, goal: GoalCreate, current_user: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(goal_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid goal ID format")

    try:
        goal_dict = goal.model_dump()
    except AttributeError:
        goal_dict = goal.dict()

    goal_dict.pop("user_id", None)
    goal_dict.pop("current_savings", None)
    try:
        goal_type_oid = ObjectId(goal_dict["goal_type_id"])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid goal type ID.")
    if not await db.goal_types.find_one({"_id": goal_type_oid, "is_archived": {"$ne": True}}):
        raise HTTPException(status_code=400, detail="Choose an active goal type.")
    try:
        date.fromisoformat(goal_dict["target_date"])
    except ValueError:
        raise HTTPException(status_code=422, detail="Target date must be a valid calendar date.")
    updated = await db.goals.find_one_and_update(
        {"_id": oid, "user_id": current_user["id"]},
        {"$set": goal_dict},
        return_document=True
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Goal not found")

    return GoalResponse(
        id=str(updated["_id"]),
        user_id=updated.get("user_id", ""),
        goal_type_id=updated.get("goal_type_id", ""),
        target_name=updated.get("target_name", ""),
        target_amount=float(updated.get("target_amount", 0)),
        current_savings=float(updated.get("current_savings", 0)),
        target_date=updated.get("target_date", ""),
        is_archived=updated.get("is_archived", False),
    )


# 5. ARCHIVE GOAL (Soft Delete)
@router.patch("/{goal_id}/archive")
async def archive_goal(goal_id: str, current_user: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(goal_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid goal ID format")

    updated = await db.goals.find_one_and_update(
        {"_id": oid, "user_id": current_user["id"], "is_archived": {"$ne": True}},
        {"$set": {"is_archived": True}},
        return_document=True
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Goal not found")

    return {"status": "Success", "message": "Goal archived successfully"}


# 6. RESTORE GOAL
@router.put("/{goal_id}/restore")
async def restore_goal(goal_id: str, current_user: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(goal_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid goal ID format")

    updated = await db.goals.find_one_and_update(
        {"_id": oid, "user_id": current_user["id"], "is_archived": True},
        {"$set": {"is_archived": False}},
        return_document=True
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Goal not found")

    return {"status": "Success", "message": "Goal restored successfully"}


# 7. PERMANENT DELETE GOAL
@router.delete("/{goal_id}/permanent")
async def permanent_delete_goal(goal_id: str, current_user: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(goal_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid goal ID format")

    goal = await db.goals.find_one({"_id": oid, "user_id": current_user["id"], "is_archived": True})
    if not goal:
        raise HTTPException(status_code=404, detail="Archived goal not found")
    linked = await db.expenses.find_one({
        "user_id": current_user["id"], "goal_id": {"$in": [str(oid), oid]},
    })
    if linked:
        raise HTTPException(status_code=409, detail="This goal has contribution history and cannot be permanently deleted.")
    result = await db.goals.delete_one({"_id": oid, "user_id": current_user["id"], "is_archived": True})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Goal not found")

    return {"message": "Goal permanently deleted successfully"}


# 8. STANDARD DELETE (Legacy fallback)
@router.delete("/{goal_id}")
async def delete_goal(goal_id: str, current_user: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(goal_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid goal ID format")

    linked = await db.expenses.find_one({
        "user_id": current_user["id"], "goal_id": {"$in": [str(oid), oid]},
    })
    if linked:
        raise HTTPException(status_code=409, detail="This goal has contribution history. Archive it to preserve its records.")
    result = await db.goals.delete_one({"_id": oid, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Goal not found")
        
    return {"message": "Goal deleted successfully"}


# 9. PATCH DEPOSIT TO GOAL
@router.patch("/{goal_id}/deposit")
async def deposit_to_goal(goal_id: str, deposit: GoalDeposit, current_user: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(goal_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid goal ID format")

    goal = await db.goals.find_one({"_id": oid, "user_id": current_user["id"], "is_archived": {"$ne": True}})
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    account_name = deposit.account.strip()
    if not account_name:
        raise HTTPException(status_code=422, detail="An account is required.")
    account = await db.accounts.find_one({"name": account_name, "user_id": current_user["id"], "account_role": "user", "is_archived": {"$ne": True}})
    if not account:
        account = await db.accounts.find_one({"name": account_name, "account_role": "admin", "is_archived": {"$ne": True}})
    if not account:
        raise HTTPException(status_code=400, detail="Choose an active account available to this user.")
    expense_log = {
        "user_id": current_user["id"],
        "amount": deposit.amount,
        "category": "Goal Contribution",
        "title": f"Contribution for {goal.get('target_name')}",
        "item_name": f"Contribution for {goal.get('target_name')}",
        "note": f"Inihulog sa goal: {goal.get('target_name')}",
        "type": "Contribution",
        "account": account.get("name", account_name),
        "account_id": str(account["_id"]), "to_account": None, "to_account_id": None, "category_id": None,
        "date": ph_today().isoformat(),
        "goal_id": str(goal_id)
    }

    lock_id = await ensure_account_balance_lock(current_user["id"], account["_id"])
    async def commit_deposit(session):
        await lock_account_balance(session, lock_id)
        current_goal = await db.goals.find_one(
            {"_id": oid, "user_id": current_user["id"], "is_archived": {"$ne": True}}, session=session
        )
        if not current_goal:
            raise HTTPException(status_code=404, detail="Goal not found")
        available_balance = await calculate_account_balance(
            account.get("name", ""), current_user["id"], float(account.get("initial_balance", 0) or 0),
            session=session, account_id=str(account["_id"]),
        )
        if deposit.amount > available_balance:
            raise HTTPException(status_code=409, detail="The selected account does not have enough balance for this contribution.")
        await db.expenses.insert_one(expense_log, session=session)
        await db.goals.update_one(
            {"_id": oid, "user_id": current_user["id"], "is_archived": {"$ne": True}},
            {"$inc": {"current_savings": deposit.amount}}, session=session,
        )
    try:
        async with await db.client.start_session() as session:
            await session.with_transaction(commit_deposit)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Could not safely complete the contribution. Verify MongoDB transaction support and try again.") from exc
    await create_crossed_threshold_notifications(current_user["id"])

    return {"status": "Success", "message": f"Successfully deposited ₱{deposit.amount} to {goal.get('target_name')}"}
