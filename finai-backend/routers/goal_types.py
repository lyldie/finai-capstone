# finai-backend/routers/goal_types.py
from fastapi import APIRouter, HTTPException, Depends
from bson import ObjectId
from database import db
from schemas.goal_type import GoalTypeCreate, GoalTypeResponse
import re
from typing import Optional

from auth import get_current_admin
from .logs import log_action

router = APIRouter(prefix="/api/goal-types", tags=["Goal Types"])


async def _normalize_and_check_name(name: str, exclude_id: Optional[ObjectId] = None) -> str:
    normalized = name.strip()
    if not normalized:
        raise HTTPException(status_code=422, detail="Goal type name is required.")
    query = {
        "name": {"$regex": f"^{re.escape(normalized)}$", "$options": "i"},
        "is_archived": {"$ne": True},
    }
    if exclude_id is not None:
        query["_id"] = {"$ne": exclude_id}
    if await db.goal_types.find_one(query):
        raise HTTPException(status_code=409, detail="An active goal type with this name already exists.")
    return normalized

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
    gt_data["name"] = await _normalize_and_check_name(gt_data["name"])
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
    if existing.get("is_archived", False):
        raise HTTPException(status_code=409, detail="Restore this goal type before editing it.")

    goal_data = goal.model_dump()
    goal_data["name"] = await _normalize_and_check_name(goal_data["name"], exclude_id=oid)
    old_name = existing.get("name")

    updated = await db.goal_types.find_one_and_update(
        {"_id": oid, "is_archived": {"$ne": True}}, {"$set": goal_data}, return_document=True
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
    if existing.get("is_archived", False):
        raise HTTPException(status_code=409, detail="This goal type is already archived.")

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
    if not existing.get("is_archived", False):
        raise HTTPException(status_code=409, detail="This goal type is already active.")
    await _normalize_and_check_name(existing.get("name", ""), exclude_id=oid)

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

    if not existing.get("is_archived", False):
        raise HTTPException(status_code=400, detail="Archive the goal type before permanently deleting it.")

    goal_type_name = existing.get("name")
    goal_type_ref = str(oid)
    linked_goal = await db.goals.find_one({
        "$or": [
            {"goal_type_id": {"$in": [goal_type_ref, oid]}},
            {"preset_id": {"$in": [goal_type_ref, oid]}},
            {"goal_type": {"$in": [goal_type_ref, oid]}},
            {"$and": [
                {"goal_type_id": {"$in": [None, ""]}},
                {"preset_id": {"$in": [None, ""]}},
                {"$or": [
                    {"goal_type": {"$regex": f"^{re.escape(str(goal_type_name))}$", "$options": "i"}},
                    {"goal_type_name": {"$regex": f"^{re.escape(str(goal_type_name))}$", "$options": "i"}},
                    {"preset_name": {"$regex": f"^{re.escape(str(goal_type_name))}$", "$options": "i"}},
                    {"type_name": {"$regex": f"^{re.escape(str(goal_type_name))}$", "$options": "i"}},
                ]},
            ]},
        ]
    })
    if linked_goal:
        raise HTTPException(
            status_code=400, 
            detail="This goal type cannot be permanently deleted because active user goals still use it."
        )

    result = await db.goal_types.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Goal type not found")

    await log_action(admin["name"], f"Permanently deleted goal type '{goal_type_name}'")
    return {"message": "Goal type permanently deleted successfully"}
