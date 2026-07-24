# finai-backend/routers/goals.py
from fastapi import APIRouter, HTTPException, status
from bson import ObjectId
from database import db
from schemas.goal import GoalCreate, GoalResponse, GoalDeposit # INAYOS: Idinagdag si GoalDeposit
from datetime import datetime # INAYOS: Idinagdag para sa auto-date ng transaction

router = APIRouter(prefix="/api/goals", tags=["Goals"])

# 1. GET ALL GOALS BY USER
@router.get("/", response_model=list[GoalResponse])
async def get_user_goals(user_id: str):
    goals = []
    async for g in db.goals.find({"user_id": user_id}):
        goals.append(
            GoalResponse(
                id=str(g["_id"]),
                user_id=g.get("user_id", ""),
                goal_type_id=g.get("goal_type_id", ""),  
                target_name=g.get("target_name", ""),
                target_amount=float(g.get("target_amount", 0.0)),
                current_savings=float(g.get("current_savings", 0.0)),
                target_date=g.get("target_date", ""),
            )
        )
    return goals


# 2. CREATE NEW GOAL
@router.post("/", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
async def create_goal(goal: GoalCreate):
    try:
        goal_dict = goal.model_dump()
    except AttributeError:
        goal_dict = goal.dict()

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
    )


# 3. UPDATE/EDIT GOAL (Full Update)
@router.put("/{goal_id}", response_model=GoalResponse)
async def update_goal(goal_id: str, goal: GoalCreate):
    try:
        oid = ObjectId(goal_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid goal ID format")

    try:
        goal_dict = goal.model_dump()
    except AttributeError:
        goal_dict = goal.dict()

    updated = await db.goals.find_one_and_update(
        {"_id": oid},
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
    )


# 4. DELETE GOAL
@router.delete("/{goal_id}")
async def delete_goal(goal_id: str):
    try:
        oid = ObjectId(goal_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid goal ID format")

    result = await db.goals.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Goal not found")
        
    return {"message": "Goal deleted successfully"}


# 5. PATCH DEPOSIT TO GOAL (WITH DATA INTEGRITY LINKING)
@router.patch("/{goal_id}/deposit")
async def deposit_to_goal(goal_id: str, deposit: GoalDeposit):
    try:
        oid = ObjectId(goal_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid goal ID format")

    # Step A: Hanapin muna natin ang Goal para makuha ang user_id at target_name
    goal = await db.goals.find_one({"_id": oid})
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    # Step B: Dagdagan ang current_savings sa Goals collection
    await db.goals.update_one(
        {"_id": oid},
        {"$inc": {"current_savings": deposit.amount}}
    )

    # Step C: Awtomatikong gumawa ng Expense transaction para mag-reflect sa Dashboard balance
    # INTEGRATED: Idinagdag na si "goal_id" sa database mapping object para may tulay tuwing magbubura
    expense_log = {
        "user_id": goal.get("user_id"),
        "amount": deposit.amount,
        "category": "Savings", 
        "title": f"Contribution for {goal.get('target_name')}",
        "item_name": f"Contribution for {goal.get('target_name')}",
        "note": f"Inihulog sa goal: {goal.get('target_name')}",
        "type": "Expense", 
        "account": deposit.account, 
        "date": datetime.now().strftime("%Y-%m-%d"),
        "goal_id": str(goal_id)  # ETO YUNG TULAY NA HINAHANAP NATIN PAPS!
    }

    # I-save ang transaction sa expenses collection
    await db.expenses.insert_one(expense_log)

    return {"status": "Success", "message": f"Successfully deposited ₱{deposit.amount} to {goal.get('target_name')}"}