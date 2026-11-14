# finai-backend/routers/goals.py
from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from typing import Optional
from database import db
from schemas.goal import GoalCreate, GoalResponse, GoalDeposit, GoalWithdrawal
from datetime import datetime
from datetime import date
from auth import get_current_user
from .accounts import calculate_account_balance, ensure_account_balance_lock, lock_account_balance
from services.budget_service import ph_today

router = APIRouter(prefix="/api/goals", tags=["Goals"])


def _goal_status(goal: dict) -> str:
    status_value = goal.get("status")
    if status_value in {"completed", "target_reached"}:
        return status_value
    if float(goal.get("current_savings", 0) or 0) >= float(goal.get("target_amount", 0) or 0) > 0:
        return "target_reached"
    return "active"


def _goal_response(goal: dict) -> GoalResponse:
    return GoalResponse(
        id=str(goal["_id"]),
        user_id=goal.get("user_id", ""),
        goal_type_id=goal.get("goal_type_id", ""),
        target_name=goal.get("target_name", ""),
        target_amount=float(goal.get("target_amount", 0.0)),
        current_savings=float(goal.get("current_savings", 0.0)),
        target_date=goal.get("target_date", ""),
        is_archived=goal.get("is_archived", False),
        client_request_id=goal.get("client_request_id"),
        status=_goal_status(goal),
        target_reached_at=goal.get("target_reached_at"),
        completed_at=goal.get("completed_at"),
    )

# 1. GET ALL GOALS BY USER (FIXED: Added archived filter support)
@router.get("/", response_model=list[GoalResponse])
async def get_user_goals(user_id: str, archived: Optional[bool] = False, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    query = {"user_id": user_id}
    # Include archived goals only when requested by the query parameter.
    query["is_archived"] = True if archived else {"$ne": True}

    goals = []
    async for g in db.goals.find(query):
        goals.append(_goal_response(g))
    return goals


# 2. GET ARCHIVED GOALS SPECIFIC ENDPOINT
@router.get("/archived/{user_id}", response_model=list[GoalResponse])
async def get_archived_goals(user_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    goals = []
    async for g in db.goals.find({"user_id": user_id, "is_archived": True}):
        goals.append(_goal_response(g))
    return goals


# 3. CREATE NEW GOAL
@router.post("/", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
async def create_goal(goal: GoalCreate, current_user: dict = Depends(get_current_user)):
    if goal.client_request_id:
        existing = await db.goals.find_one({
            "user_id": current_user["id"],
            "client_request_id": goal.client_request_id,
        })
        if existing:
            return _goal_response(existing)
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

    from . import advisor
    try:
        await advisor.queue_proactive_goal_pace_check(current_user["id"], created_goal)
    except Exception as exc:
        print(f"Could not evaluate proactive goal guidance for user {current_user['id']}: {exc}")

    return _goal_response(created_goal)


# 4. UPDATE/EDIT GOAL (Full Update)
@router.put("/{goal_id}", response_model=GoalResponse)
async def update_goal(goal_id: str, goal: GoalCreate, current_user: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(goal_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid goal ID format")

    existing_goal = await db.goals.find_one({"_id": oid, "user_id": current_user["id"]})
    if not existing_goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    if existing_goal.get("is_archived", False):
        raise HTTPException(status_code=409, detail="Restore this goal before editing it.")
    if _goal_status(existing_goal) in {"target_reached", "completed"} and goal.target_amount != float(existing_goal.get("target_amount", 0) or 0):
        raise HTTPException(status_code=409, detail="The target amount is locked after the goal has been reached.")

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
        {"_id": oid, "user_id": current_user["id"], "is_archived": {"$ne": True}},
        {"$set": goal_dict},
        return_document=True
    )
    if not updated:
        already_archived = await db.goals.find_one({"_id": oid, "user_id": current_user["id"], "is_archived": True}, {"_id": 1})
        if already_archived:
            return {"status": "Success", "message": "Goal already archived"}
        raise HTTPException(status_code=404, detail="Goal not found")

    from . import advisor
    try:
        await advisor.queue_proactive_goal_pace_check(current_user["id"], updated)
    except Exception as exc:
        print(f"Could not evaluate proactive goal guidance for user {current_user['id']}: {exc}")

    return _goal_response(updated)


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
        already_archived = await db.goals.find_one(
            {"_id": oid, "user_id": current_user["id"], "is_archived": True},
            {"_id": 1},
        )
        if already_archived:
            return {"status": "Success", "message": "Goal already archived"}
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
    if float(goal.get("current_savings", 0) or 0) > 0:
        raise HTTPException(status_code=409, detail="This goal still has funds. Withdraw the remaining amount before permanently deleting it.")
    linked = await db.expenses.find_one({
        "user_id": current_user["id"], "goal_id": {"$in": [str(oid), oid]},
    })
    if linked:
        raise HTTPException(status_code=409, detail="This goal has linked contribution or withdrawal transactions, so it cannot be permanently deleted. Keep it in Archive to preserve its transaction history.")
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

    goal = await db.goals.find_one({"_id": oid, "user_id": current_user["id"]})
    if goal and float(goal.get("current_savings", 0) or 0) > 0:
        raise HTTPException(status_code=409, detail="Withdraw the remaining goal funds before deleting this goal.")
    linked = await db.expenses.find_one({
        "user_id": current_user["id"], "goal_id": {"$in": [str(oid), oid]},
    })
    if linked:
        raise HTTPException(status_code=409, detail="This goal has contribution history. Archive it to preserve its records.")
    result = await db.goals.delete_one({"_id": oid, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        return {"status": "Success", "message": "Goal already deleted"}
        
    return {"message": "Goal deleted successfully"}


@router.patch("/{goal_id}/complete")
async def complete_goal(goal_id: str, current_user: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(goal_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid goal ID format") from exc
    goal = await db.goals.find_one({"_id": oid, "user_id": current_user["id"]})
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    if goal.get("is_archived", False):
        raise HTTPException(status_code=409, detail="Restore this goal before marking it complete.")
    if _goal_status(goal) == "active":
        raise HTTPException(status_code=409, detail="Reach the savings target before marking this goal complete.")
    if _goal_status(goal) == "completed":
        return {"status": "Success", "message": "Goal is already complete."}
    now = datetime.utcnow()
    await db.goals.update_one(
        {"_id": oid, "user_id": current_user["id"], "status": {"$ne": "completed"}},
        {"$set": {"status": "completed", "completed_at": now}},
    )
    return {"status": "Success", "message": "Goal marked complete.", "completed_at": now.isoformat()}


# 9. PATCH DEPOSIT TO GOAL
@router.patch("/{goal_id}/deposit")
async def deposit_to_goal(goal_id: str, deposit: GoalDeposit, current_user: dict = Depends(get_current_user)):
    if deposit.client_request_id:
        existing = await db.expenses.find_one({
            "user_id": current_user["id"],
            "client_request_id": deposit.client_request_id,
        })
        if existing:
            return {"status": "Success", "id": str(existing["_id"]), "duplicate": True}
    try:
        oid = ObjectId(goal_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid goal ID format")

    goal = await db.goals.find_one({"_id": oid, "user_id": current_user["id"], "is_archived": {"$ne": True}})
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    if _goal_status(goal) != "active":
        raise HTTPException(status_code=409, detail="This goal has reached its target and no longer accepts contributions.")

    account_name = deposit.account.strip()
    if not account_name:
        raise HTTPException(status_code=422, detail="An account is required.")
    account = await db.accounts.find_one({"name": account_name, "user_id": current_user["id"], "account_role": "user", "is_archived": {"$ne": True}})
    if not account:
        account = await db.accounts.find_one({"name": account_name, "account_role": "admin", "is_archived": {"$ne": True}})
    if not account:
        raise HTTPException(status_code=400, detail="Choose an active account available to this user.")
    contribution_date = deposit.date or ph_today().isoformat()
    try:
        parsed_contribution_date = date.fromisoformat(contribution_date)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Contribution date must be a valid calendar date.") from exc
    if parsed_contribution_date > ph_today():
        raise HTTPException(status_code=422, detail="Contribution date cannot be in the future.")
    expense_log = {
        "user_id": current_user["id"],
        "amount": deposit.amount,
        "category": "Goal Contribution",
        "title": f"Contribution for {goal.get('target_name')}",
        "item_name": f"Contribution for {goal.get('target_name')}",
        "note": f"Contribution to goal: {goal.get('target_name')}",
        "type": "Contribution",
        "account": account.get("name", account_name),
        "account_id": str(account["_id"]), "to_account": None, "to_account_id": None, "category_id": None,
        "date": contribution_date,
        "goal_id": str(goal_id),
        "client_request_id": deposit.client_request_id,
    }

    lock_id = await ensure_account_balance_lock(current_user["id"], account["_id"])
    async def commit_deposit(session):
        await lock_account_balance(session, lock_id)
        current_goal = await db.goals.find_one(
            {"_id": oid, "user_id": current_user["id"], "is_archived": {"$ne": True}}, session=session
        )
        if not current_goal:
            raise HTTPException(status_code=404, detail="Goal not found")
        if _goal_status(current_goal) != "active":
            raise HTTPException(status_code=409, detail="This goal has reached its target and no longer accepts contributions.")
        current_account = await db.accounts.find_one(
            {"_id": account["_id"], "is_archived": {"$ne": True}}, session=session
        )
        if not current_account:
            raise HTTPException(status_code=409, detail="The selected account was archived. Choose an active account and try again.")
        available_balance = await calculate_account_balance(
            current_account.get("name", ""), current_user["id"], float(current_account.get("initial_balance", 0) or 0),
            session=session, account_id=str(current_account["_id"]),
        )
        if deposit.amount > available_balance:
            raise HTTPException(status_code=409, detail="The selected account does not have enough balance for this contribution.")
        inserted = await db.expenses.insert_one(expense_log, session=session)
        expense_log["_id"] = inserted.inserted_id
        new_savings = float(current_goal.get("current_savings", 0) or 0) + deposit.amount
        goal_update = {"current_savings": new_savings}
        if new_savings >= float(current_goal.get("target_amount", 0) or 0):
            goal_update.update({"status": "target_reached", "target_reached_at": datetime.utcnow()})
        await db.goals.update_one(
            {"_id": oid, "user_id": current_user["id"], "is_archived": {"$ne": True}},
            {"$set": goal_update}, session=session,
        )
    try:
        async with await db.client.start_session() as session:
            await session.with_transaction(commit_deposit)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Could not safely complete the contribution. Verify MongoDB transaction support and try again.") from exc
    updated_goal = await db.goals.find_one({"_id": oid, "user_id": current_user["id"]})
    if updated_goal:
        from . import advisor
        try:
            await advisor.queue_proactive_goal_milestone(
                current_user["id"], goal, float(goal.get("current_savings", 0) or 0),
                float(updated_goal.get("current_savings", 0) or 0),
            )
        except Exception as exc:
            print(f"Could not queue goal milestone message for user {current_user['id']}: {exc}")
    return {"status": "Success", "id": str(expense_log["_id"]), "message": f"Successfully deposited ₱{deposit.amount} to {goal.get('target_name')}"}


@router.patch("/{goal_id}/withdraw")
async def withdraw_from_goal(goal_id: str, withdrawal: GoalWithdrawal, current_user: dict = Depends(get_current_user)):
    if withdrawal.client_request_id:
        existing = await db.expenses.find_one({
            "user_id": current_user["id"],
            "client_request_id": withdrawal.client_request_id,
        })
        if existing:
            return {"status": "Success", "id": str(existing["_id"]), "duplicate": True}
    try:
        oid = ObjectId(goal_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid goal ID format") from exc

    goal = await db.goals.find_one({"_id": oid, "user_id": current_user["id"], "is_archived": {"$ne": True}})
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    account_name = withdrawal.account.strip()
    if not account_name:
        raise HTTPException(status_code=422, detail="Choose an account to receive the withdrawal.")
    account = await db.accounts.find_one({"name": account_name, "user_id": current_user["id"], "account_role": "user", "is_archived": {"$ne": True}})
    if not account:
        account = await db.accounts.find_one({"name": account_name, "account_role": "admin", "is_archived": {"$ne": True}})
    if not account:
        raise HTTPException(status_code=400, detail="Choose an active account available to this user.")

    withdrawal_date = withdrawal.date or ph_today().isoformat()
    try:
        parsed_withdrawal_date = date.fromisoformat(withdrawal_date)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Withdrawal date must be a valid calendar date.") from exc
    if parsed_withdrawal_date > ph_today():
        raise HTTPException(status_code=422, detail="Withdrawal date cannot be in the future.")

    movement = {
        "user_id": current_user["id"],
        "amount": withdrawal.amount,
        "category": "Goal Withdrawal",
        "title": f"Withdrawal from {goal.get('target_name')}",
        "item_name": f"Withdrawal from {goal.get('target_name')}",
        "note": f"Withdrawal from goal: {goal.get('target_name')}",
        "type": "Goal Withdrawal",
        "account": account.get("name", account_name),
        "account_id": str(account["_id"]), "to_account": None, "to_account_id": None, "category_id": None,
        "date": withdrawal_date,
        "goal_id": str(goal_id),
        "client_request_id": withdrawal.client_request_id,
    }
    lock_id = await ensure_account_balance_lock(current_user["id"], account["_id"])

    async def commit_withdrawal(session):
        await lock_account_balance(session, lock_id)
        current_goal = await db.goals.find_one(
            {"_id": oid, "user_id": current_user["id"], "is_archived": {"$ne": True}}, session=session
        )
        if not current_goal:
            raise HTTPException(status_code=404, detail="Goal not found")
        if withdrawal.amount > float(current_goal.get("current_savings", 0) or 0):
            raise HTTPException(status_code=409, detail="The goal does not have enough savings for this withdrawal.")
        current_account = await db.accounts.find_one(
            {"_id": account["_id"], "is_archived": {"$ne": True}}, session=session
        )
        if not current_account:
            raise HTTPException(status_code=409, detail="The selected account was archived. Choose an active account and try again.")
        inserted = await db.expenses.insert_one(movement, session=session)
        movement["_id"] = inserted.inserted_id
        await db.goals.update_one(
            {"_id": oid, "user_id": current_user["id"], "is_archived": {"$ne": True}},
            {"$inc": {"current_savings": -withdrawal.amount}}, session=session,
        )

    try:
        async with await db.client.start_session() as session:
            await session.with_transaction(commit_withdrawal)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Could not safely complete the withdrawal. Verify MongoDB transaction support and try again.") from exc
    return {"status": "Success", "id": str(movement["_id"]), "message": f"Successfully withdrew ₱{withdrawal.amount} from {goal.get('target_name')}"}
