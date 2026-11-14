"""Cloud Run Job entry point for daily scheduled-bill reminder emails."""

import asyncio
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from pymongo import ReturnDocument

from database import client, db
from email_utils import send_bill_due_reminder
from routers.notifications import _refresh_upcoming_bill_notifications
from services.budget_service import ph_today


async def run() -> None:
    today = ph_today()
    through = today + timedelta(days=3)
    today_key = today.isoformat()
    through_key = through.isoformat()
    now = datetime.now(timezone.utc)
    expired_claim = now - timedelta(minutes=20)
    sent_count = failed_count = skipped_count = 0

    user_ids = await db.fixed_bills.distinct("user_id", {"is_active": True})
    for user_id in user_ids:
        # Keep the notification inbox and scheduled email based on the same
        # bill occurrences and stable per-bill/per-month notification IDs.
        await _refresh_upcoming_bill_notifications(user_id)
        reminders = await db.notifications.find({
            "user_id": user_id,
            "event_type": "bill_due",
            "due_date": {"$gte": today_key, "$lte": through_key},
        }).to_list(length=200)

        for reminder in reminders:
            bill_id = str(reminder.get("bill_id") or "")
            period_key = str(reminder.get("period_key") or "")
            if not ObjectId.is_valid(bill_id) or not period_key:
                skipped_count += 1
                continue
            bill = await db.fixed_bills.find_one({
                "_id": ObjectId(bill_id), "user_id": user_id, "is_active": True,
            })
            occurrence = await db.bill_occurrences.find_one({
                "user_id": user_id,
                "bill_id": bill_id,
                "period_key": period_key,
                "status": "unpaid",
            })
            if not bill or not occurrence:
                skipped_count += 1
                continue

            claim = await db.notifications.find_one_and_update(
                {
                    "_id": reminder["_id"],
                    "$or": [
                        {"email_status": {"$exists": False}},
                        {"email_status": "failed"},
                        {"email_status": "sending", "email_claimed_at": {"$lte": expired_claim}},
                    ],
                },
                {
                    "$set": {"email_status": "sending", "email_claimed_at": now},
                    "$inc": {"email_attempts": 1},
                },
                return_document=ReturnDocument.AFTER,
            )
            if not claim:
                skipped_count += 1
                continue

            user_key = ObjectId(user_id) if ObjectId.is_valid(user_id) else user_id
            account = await db.users.find_one({"_id": user_key}, {"email": 1})
            email = str((account or {}).get("email") or "").strip()
            try:
                delivered = bool(email) and await asyncio.to_thread(
                    send_bill_due_reminder,
                    email,
                    str(bill.get("name") or "Scheduled bill"),
                    str(bill.get("category") or "Uncategorized"),
                    float(bill.get("amount", 0) or 0),
                    str(reminder.get("due_date") or ""),
                )
            except Exception as exc:
                print(f"Bill reminder email failed ({type(exc).__name__}).")
                delivered = False

            status = "sent" if delivered else "failed"
            fields = {"email_status": status, "email_updated_at": datetime.now(timezone.utc)}
            if delivered:
                fields["email_sent_at"] = datetime.now(timezone.utc)
                sent_count += 1
            else:
                failed_count += 1
            await db.notifications.update_one(
                {"_id": reminder["_id"], "email_status": "sending"},
                {"$set": fields, "$unset": {"email_claimed_at": ""}},
            )

    print(
        "Scheduled bill reminder run completed: "
        f"sent={sent_count}, failed={failed_count}, skipped={skipped_count}."
    )


if __name__ == "__main__":
    try:
        asyncio.run(run())
    finally:
        client.close()
