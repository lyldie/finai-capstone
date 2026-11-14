import hashlib
from calendar import monthrange
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Depends
from bson import ObjectId
from pymongo import ReturnDocument

from database import db
from schemas.notification import NotificationResponse
from auth import get_current_user
from services.budget_service import ph_today


router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


def _bill_due_date(year: int, month: int, due_day: int) -> str:
    return f"{year:04d}-{month:02d}-{min(due_day, monthrange(year, month)[1]):02d}"


async def _refresh_upcoming_bill_notifications(user_id: str) -> None:
    """Create in-app reminders for unpaid bills due within three days."""
    today = ph_today()
    through = today + timedelta(days=3)
    months = [(today.year, today.month)]
    if through.year != today.year or through.month != today.month:
        months.append((through.year, through.month))

    bills = await db.fixed_bills.find({"user_id": user_id, "is_active": True}).to_list(length=200)
    active_reminder_ids = set()
    now = datetime.now(timezone.utc)
    for bill in bills:
        bill_id = str(bill["_id"])
        for year, month in months:
            period_key = f"{year:04d}-{month:02d}"
            due_date = _bill_due_date(year, month, int(bill.get("due_day", 1)))
            due = datetime.strptime(due_date, "%Y-%m-%d").date()
            if not today <= due <= through:
                continue

            occurrence = await db.bill_occurrences.find_one_and_update(
                {"user_id": user_id, "bill_id": bill_id, "period_key": period_key},
                {"$setOnInsert": {
                    "user_id": user_id,
                    "bill_id": bill_id,
                    "period_key": period_key,
                    "due_date": due_date,
                    "status": "unpaid",
                    "created_at": now,
                }},
                upsert=True,
                return_document=ReturnDocument.AFTER,
            )
            if occurrence.get("status", "unpaid") != "unpaid":
                continue

            notification_id = hashlib.sha256(
                f"bill-due:{user_id}:{bill_id}:{period_key}".encode("utf-8")
            ).hexdigest()
            active_reminder_ids.add(notification_id)
            day_delta = (due - today).days
            due_label = "today" if day_delta == 0 else "tomorrow" if day_delta == 1 else f"in {day_delta} days"
            name = str(bill.get("name") or "Scheduled bill")
            category = str(bill.get("category") or "Uncategorized")
            amount = round(float(bill.get("amount", 0) or 0), 2)
            notification = {
                "user_id": user_id,
                "bill_id": bill_id,
                "period_key": period_key,
                "due_date": due_date,
                "event_type": "bill_due",
                "title": "Upcoming bill",
                "threshold": 0,
                "level": "bill_due",
                "channel": "in_app",
                "message": (
                    f"{name} is due {due_label} ({due_date}). The saved reminder amount is "
                    f"PHP {amount:,.2f} under {category}; confirm the actual amount when you pay."
                ),
            }
            await db.notifications.update_one(
                {"_id": notification_id},
                {"$set": notification, "$setOnInsert": {"created_at": now, "is_read": False}},
                upsert=True,
            )

    # Hide reminders that are paid, archived, past due, or no longer within the
    # reminder window. The bill occurrence remains the source of truth.
    stale_ids = await db.notifications.distinct("_id", {
        "user_id": user_id,
        "event_type": "bill_due",
        "suppressed": {"$ne": True},
        "_id": {"$nin": list(active_reminder_ids)},
    })
    if stale_ids:
        await db.notifications.update_many(
            {"_id": {"$in": stale_ids}, "user_id": user_id},
            {"$set": {"suppressed": True, "is_read": True}},
        )


@router.get("/{user_id}", response_model=list[NotificationResponse])
async def list_notifications(user_id: str, unread_only: bool = False, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    await _refresh_upcoming_bill_notifications(user_id)
    query = {"user_id": user_id, "suppressed": {"$ne": True}}
    if unread_only:
        query["is_read"] = False
    records = await db.notifications.find(query).sort("created_at", -1).to_list(length=100)
    return [{**record, "id": str(record["_id"])} for record in records]


@router.patch("/{notification_id}/read")
async def mark_notification_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    if ObjectId.is_valid(notification_id):
        notification_key = ObjectId(notification_id)
    elif len(notification_id) == 64 and all(char in "0123456789abcdef" for char in notification_id.lower()):
        notification_key = notification_id.lower()
    else:
        raise HTTPException(status_code=400, detail="Invalid notification ID")
    result = await db.notifications.update_one({"_id": notification_key, "user_id": current_user["id"]}, {"$set": {"is_read": True}})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "Success"}


@router.post("/mark-all-read")
async def mark_all_notifications_read(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    result = await db.notifications.update_many(
        {"user_id": user_id, "is_read": False, "suppressed": {"$ne": True}},
        {"$set": {"is_read": True}},
    )
    return {"status": "Success", "modified_count": result.modified_count}


@router.post("/clear-all")
async def clear_all_notifications(current_user: dict = Depends(get_current_user)):
    """Soft-suppress all notifications for the user to keep audit trails intact while clearing the UI inbox."""
    user_id = current_user["id"]
    result = await db.notifications.update_many(
        {"user_id": user_id, "suppressed": {"$ne": True}},
        {"$set": {"suppressed": True, "is_read": True}},
    )
    return {"status": "Success", "modified_count": result.modified_count}
