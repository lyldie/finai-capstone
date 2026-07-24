# finai-backend/routers/goal_types.py
from fastapi import APIRouter, HTTPException, status
from bson import ObjectId
from database import db
from schemas.goal_type import GoalTypeCreate, GoalTypeResponse

router = APIRouter(prefix="/api/goal-types", tags=["Goal Types"])

# 1. GET all Goal Types
@router.get("/", response_model=list[GoalTypeResponse])
async def get_goal_types():
    goal_types = []
    async for gt in db.goal_types.find():
        # Dynamic mapping
        gt_data = {**gt, "id": str(gt["_id"])}
        goal_types.append(GoalTypeResponse(**gt_data))
    return goal_types

@router.post("/", response_model=GoalTypeResponse)
async def create_goal_type(goal: GoalTypeCreate):
    gt_data = goal.model_dump()
    new_gt = await db.goal_types.insert_one(gt_data)
    created = await db.goal_types.find_one({"_id": new_gt.inserted_id})
    
    # Dynamic mapping
    created_data = {**created, "id": str(created["_id"])}
    return GoalTypeResponse(**created_data)

@router.put("/{gt_id}", response_model=GoalTypeResponse)
async def update_goal_type(gt_id: str, goal: GoalTypeCreate):
    try:
        oid = ObjectId(gt_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    updated = await db.goal_types.find_one_and_update(
        {"_id": oid},
        {"$set": goal.model_dump()},
        return_document=True
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Goal type not found")
        
    updated_data = {**updated, "id": str(updated["_id"])}
    return GoalTypeResponse(**updated_data)
# 4. DELETE Goal Type
@router.delete("/{gt_id}")
async def delete_goal_type(gt_id: str):
    try:
        oid = ObjectId(gt_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    result = await db.goal_types.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Goal type not found")
    return {"message": "Goal type deleted successfully"}