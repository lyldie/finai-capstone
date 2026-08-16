from fastapi import APIRouter, HTTPException
from bson import ObjectId

from database import db
from schemas.notification import NotificationResponse


router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@router.get("/{user_id}", response_model=list[NotificationResponse])
async def list_notifications(user_id: str, unread_only: bool = False):
    query = {"user_id": user_id}
    if unread_only:
        query["is_read"] = False
    records = await db.notifications.find(query).sort("created_at", -1).to_list(length=100)
    return [{**record, "id": str(record["_id"])} for record in records]


@router.patch("/{notification_id}/read")
async def mark_notification_read(notification_id: str):
    try:
        oid = ObjectId(notification_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notification ID")
    result = await db.notifications.update_one({"_id": oid}, {"$set": {"is_read": True}})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "Success"}
