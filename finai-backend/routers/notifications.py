from fastapi import APIRouter, HTTPException, Depends
from bson import ObjectId

from database import db
from schemas.notification import NotificationResponse
from auth import get_current_user


router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@router.get("/{user_id}", response_model=list[NotificationResponse])
async def list_notifications(user_id: str, unread_only: bool = False, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
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
