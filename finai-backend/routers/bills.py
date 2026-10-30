"""User-managed recurring fixed monthly bill reminders and paid status."""
from calendar import monthrange
from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument

from auth import get_current_user
from database import db
from schemas.bill import FixedBillCreate, FixedBillUpdate
from services.budget_service import ph_today


router = APIRouter(prefix="/api/bills", tags=["Fixed bills"])


def _due_date(year: int, month: int, due_day: int) -> str:
    return f"{year:04d}-{month:02d}-{min(due_day, monthrange(year, month)[1]):02d}"


async def _ensure_occurrence(user_id: str, bill: dict, year: int, month: int) -> dict:
    period_key = f"{year:04d}-{month:02d}"
    occurrence = await db.bill_occurrences.find_one_and_update(
        {"user_id": user_id, "bill_id": str(bill["_id"]), "period_key": period_key},
        {"$setOnInsert": {
            "user_id": user_id,
            "bill_id": str(bill["_id"]),
            "period_key": period_key,
            "due_date": _due_date(year, month, int(bill["due_day"])),
            "status": "unpaid",
            "created_at": datetime.utcnow(),
        }},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return occurrence


def _public_bill(bill: dict, occurrence: dict) -> dict:
    category = bill.get("category") or "Uncategorized"
    return {
        "id": str(bill["_id"]),
        "name": bill["name"],
        "category_id": str(bill.get("category_id", "")),
        "category": category,
        "amount": round(float(bill.get("amount", 0) or 0), 2),
        "due_day": int(bill["due_day"]),
        "due_date": occurrence["due_date"],
        "period_key": occurrence["period_key"],
        "status": occurrence.get("status", "unpaid"),
        "paid_at": occurrence.get("paid_at"),
        "is_active": bool(bill.get("is_active", True)),
    }


@router.get("")
async def list_fixed_bills(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    today = ph_today()
    bills = await db.fixed_bills.find({"user_id": user_id, "is_active": True}).sort("due_day", 1).to_list(length=200)
    result = []
    for bill in bills:
        occurrence = await _ensure_occurrence(user_id, bill, today.year, today.month)
        result.append(_public_bill(bill, occurrence))
    return {"bills": result, "as_of_date": today.isoformat()}


@router.post("")
async def create_fixed_bill(payload: FixedBillCreate, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    try:
        category_oid = ObjectId(payload.category_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Choose a valid expense category.") from exc
    category = await db.categories.find_one({
        "_id": category_oid,
        "type": {"$regex": "^expense$", "$options": "i"},
        "is_archived": {"$ne": True},
        "$or": [{"category_role": "admin"}, {"category_role": "user", "user_id": user_id}],
    })
    if not category:
        raise HTTPException(status_code=400, detail="Choose an active expense category available to you.")
    now = datetime.utcnow()
    bill = {
        "user_id": user_id,
        "name": payload.name,
        "category_id": str(category_oid),
        "category": category.get("name", "Uncategorized"),
        "amount": float(payload.amount),
        "due_day": payload.due_day,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.fixed_bills.insert_one(bill)
    bill["_id"] = result.inserted_id
    today = ph_today()
    occurrence = await _ensure_occurrence(user_id, bill, today.year, today.month)
    return {"status": "Success", "bill": _public_bill(bill, occurrence)}


@router.patch("/{bill_id}")
async def update_fixed_bill(bill_id: str, payload: FixedBillUpdate, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    try:
        oid = ObjectId(bill_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid bill ID.") from exc
    bill = await db.fixed_bills.find_one({"_id": oid, "user_id": user_id})
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found.")
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        changes["name"] = changes["name"].strip()
        if not changes["name"]:
            raise HTTPException(status_code=400, detail="Bill name cannot be blank.")
    if "category_id" in changes:
        try:
            category_oid = ObjectId(changes["category_id"])
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Choose a valid expense category.") from exc
        category = await db.categories.find_one({
            "_id": category_oid, "type": {"$regex": "^expense$", "$options": "i"},
            "is_archived": {"$ne": True},
            "$or": [{"category_role": "admin"}, {"category_role": "user", "user_id": user_id}],
        })
        if not category:
            raise HTTPException(status_code=400, detail="Choose an active expense category available to you.")
        changes["category_id"] = str(category_oid)
        changes["category"] = category.get("name", "Uncategorized")
    changes["updated_at"] = datetime.utcnow()
    await db.fixed_bills.update_one({"_id": oid, "user_id": user_id}, {"$set": changes})
    if "due_day" in changes:
        today = ph_today()
        await db.bill_occurrences.update_one(
            {"user_id": user_id, "bill_id": str(oid), "period_key": f"{today.year:04d}-{today.month:02d}", "status": "unpaid"},
            {"$set": {"due_date": _due_date(today.year, today.month, int(changes["due_day"]))}},
        )
    return {"status": "Success"}


@router.post("/{bill_id}/paid")
async def mark_fixed_bill_paid(bill_id: str, current_user: dict = Depends(get_current_user)):
    """Mark this month's reminder as paid; this deliberately does not create a transaction."""
    user_id = current_user["id"]
    try:
        oid = ObjectId(bill_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid bill ID.") from exc
    bill = await db.fixed_bills.find_one({"_id": oid, "user_id": user_id, "is_active": True})
    if not bill:
        raise HTTPException(status_code=404, detail="Active bill not found.")
    today = ph_today()
    occurrence = await _ensure_occurrence(user_id, bill, today.year, today.month)
    await db.bill_occurrences.update_one(
        {"_id": occurrence["_id"], "status": "unpaid"},
        {"$set": {"status": "paid", "paid_at": datetime.utcnow()}},
    )
    updated = await db.bill_occurrences.find_one({"_id": occurrence["_id"]})
    return {"status": "Success", "bill": _public_bill(bill, updated)}


@router.delete("/{bill_id}")
async def archive_fixed_bill(bill_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    try:
        oid = ObjectId(bill_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid bill ID.") from exc
    result = await db.fixed_bills.update_one(
        {"_id": oid, "user_id": user_id, "is_active": True},
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}},
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Active bill not found.")
    return {"status": "Success"}
