# finai-backend/routers/goal_types.py
from fastapi import APIRouter, HTTPException, Depends
from bson import ObjectId
from database import db
from schemas.goal_type import GoalTypeCreate, GoalTypeResponse

from auth import get_current_admin
from .logs import log_action

router = APIRouter(prefix="/api/goal-types", tags=["Goal Types"])

@router.get("/", response_model=list[GoalTypeResponse])
async def get_goal_types(archived: bool = False):
    """CHANGED: added `archived` query param. Default excludes archived --
    important here specifically, since create-goal.tsx's picker reads this
    endpoint with no auth and must never show an archived type to a user
    creating a new goal."""
    query = {"is_archived": True if archived else {"$ne": True}}
    goal_types = []
    async for gt in db.goal_types.find(query):
        gt_data = {**gt, "id": str(gt["_id"])}
        goal_types.append(GoalTypeResponse(**gt_data))
    return goal_types

@router.post("/", response_model=GoalTypeResponse)
async def create_goal_type(goal: GoalTypeCreate, admin: dict = Depends(get_current_admin)):
    """(unchanged) Admin-only -- no regular-user goal-type creation flow exists."""
    gt_data = goal.model_dump()
    gt_data["is_archived"] = False
    new_gt = await db.goal_types.insert_one(gt_data)
    created = await db.goal_types.find_one({"_id": new_gt.inserted_id})
    created_data = {**created, "id": str(created["_id"])}

    await log_action(admin["name"], f"Created goal type '{gt_data.get('name')}'")
    return GoalTypeResponse(**created_data)

@router.put("/{gt_id}", response_model=GoalTypeResponse)
async def update_goal_type(gt_id: str, goal: GoalTypeCreate, admin: dict = Depends(get_current_admin)):
    """(unchanged, gated)"""
    try:
        oid = ObjectId(gt_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    existing = await db.goal_types.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Goal type not found")
    old_name = existing.get("name")

    updated = await db.goal_types.find_one_and_update(
        {"_id": oid}, {"$set": goal.model_dump()}, return_document=True
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Goal type not found")

    new_name = goal.name
    if new_name != old_name:
        await log_action(admin["name"], f"Renamed goal type '{old_name}' to '{new_name}'")

    updated_data = {**updated, "id": str(updated["_id"])}
    return GoalTypeResponse(**updated_data)


@router.patch("/{gt_id}/archive", response_model=GoalTypeResponse)
async def archive_goal_type(gt_id: str, admin: dict = Depends(get_current_admin)):
    """NEW: replaces delete_goal_type entirely."""
    try:
        oid = ObjectId(gt_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    existing = await db.goal_types.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Goal type not found")

    updated = await db.goal_types.find_one_and_update({"_id": oid}, {"$set": {"is_archived": True}}, return_document=True)
    await log_action(admin["name"], f"Archived goal type '{existing.get('name')}'")
    return GoalTypeResponse(**{**updated, "id": str(updated["_id"])})


@router.patch("/{gt_id}/restore", response_model=GoalTypeResponse)
async def restore_goal_type(gt_id: str, admin: dict = Depends(get_current_admin)):
    """NEW: the undo for archive_goal_type above."""
    try:
        oid = ObjectId(gt_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    existing = await db.goal_types.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Goal type not found")

    updated = await db.goal_types.find_one_and_update({"_id": oid}, {"$set": {"is_archived": False}}, return_document=True)
    await log_action(admin["name"], f"Restored goal type '{existing.get('name')}'")
    return GoalTypeResponse(**{**updated, "id": str(updated["_id"])})


# 👈 BAGONG IDINAGDAG: Permanent Delete endpoint para sa Goal Types na may active goal check
@router.delete("/{gt_id}/permanent")
async def permanent_delete_goal_type(gt_id: str, admin: dict = Depends(get_current_admin)):
    """NEW: Permanently delete an archived goal type if no active user goals use it."""
    try:
        oid = ObjectId(gt_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    existing = await db.goal_types.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Goal type not found")

    goal_type_name = existing.get("name")

    # I-check kung may active user goals pang nakatali sa goal type na ito (pwede ring gamitin ang gt_id o name depende sa schema ninyo)
    linked_goal = await db.goals.find_one({"$or": [{"goal_type_id": gt_id}, {"goal_type": goal_type_name}]})
    if linked_goal:
        raise HTTPException(
            status_code=400, 
            detail="Hindi ma-permanently delete. May mga active user goals pang gumagamit sa goal type na ito."
        )

    result = await db.goal_types.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Goal type not found")

    await log_action(admin["name"], f"Permanently deleted goal type '{goal_type_name}'")
    return {"message": "Goal type permanently deleted successfully"}