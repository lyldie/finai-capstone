"""Explainable, deduplicated in-app and email alerts for unusual weekly spending."""
import asyncio
from datetime import date, datetime, timedelta, timezone
import hashlib
from statistics import median

from bson import ObjectId
from database import db
from email_utils import send_spending_activity_alert
from services.budget_service import ph_today


MIN_INCREASE_PHP = 150.0
MIN_INCREASE_RATIO = 0.30
_background_email_tasks: set[asyncio.Task] = set()


def _queue_spending_activity_email(notification_id: str, user_id: str, notification: dict) -> None:
    task = asyncio.create_task(_send_spending_activity_email(notification_id, user_id, notification))
    _background_email_tasks.add(task)
    task.add_done_callback(_background_email_tasks.discard)


async def _send_spending_activity_email(notification_id: str, user_id: str, notification: dict) -> None:
    try:
        user_oid = ObjectId(user_id) if ObjectId.is_valid(str(user_id)) else None
        user = await db.users.find_one({"_id": user_oid}, {"email": 1}) if user_oid else None
        if not user or not user.get("email"):
            email_status = "no_recipient"
        else:
            sent = await asyncio.to_thread(
                send_spending_activity_alert,
                user["email"],
                notification["category_name"],
                notification["current_amount"],
                notification["baseline_amount"],
                notification["change_amount"],
                notification["change_percent"],
            )
            email_status = "sent" if sent else "failed"
        await db.notifications.update_one(
            {"_id": notification_id, "email_status": "sending"},
            {"$set": {"email_status": email_status}},
        )
    except Exception as exc:
        await db.notifications.update_one(
            {"_id": notification_id, "email_status": "sending"},
            {"$set": {"email_status": "failed"}},
        )
        print(f"Could not send spending activity email ({type(exc).__name__}).")


async def create_weekly_spending_spike(user_id: str, category_id: str, transaction_date: str | None = None):
    """Save at most one current-week alert per category after an expense is recorded.

    Compare this week's spend through today with the same Monday-through-weekday
    windows of up to four prior weeks. Require at least three comparable weeks,
    then both a 30% and PHP 150 increase to avoid noisy small-amount alerts.
    """
    today = ph_today()
    try:
        recorded_date = date.fromisoformat(str(transaction_date or "")[:10])
    except ValueError:
        return None
    # Backdated imports and receipt scans should not generate a current-week alert.
    if recorded_date != today or not category_id:
        return None

    category_key = ObjectId(category_id) if ObjectId.is_valid(category_id) else category_id
    category = await db.categories.find_one({"_id": category_key})
    if category is None:
        return None
    category_name = str(category.get("name") or "This category")
    current_start = today - timedelta(days=today.weekday())
    first_start = current_start - timedelta(days=28)
    cursor = db.expenses.find({
        "user_id": user_id,
        "category_id": category_id,
        "type": {"$regex": "^expense$", "$options": "i"},
        "date": {"$gte": first_start.isoformat(), "$lte": today.isoformat()},
        "is_archived": {"$ne": True},
        "goal_id": {"$in": [None, ""]},
    })
    rows = await cursor.to_list(length=10000)
    dated_rows = []
    for row in rows:
        try:
            row_date = date.fromisoformat(str(row.get("date") or "")[:10])
            amount = float(row.get("amount") or 0)
        except (ValueError, TypeError):
            continue
        if amount >= 0:
            dated_rows.append((row_date, amount))
    if not dated_rows:
        return None

    first_seen = min(row_date for row_date, _ in dated_rows)
    first_seen_week = first_seen - timedelta(days=first_seen.weekday())
    elapsed_days = today.weekday()
    current_total = sum(amount for row_date, amount in dated_rows if current_start <= row_date <= today)
    prior_totals = []
    for weeks_ago in (1, 2, 3, 4):
        period_start = current_start - timedelta(days=7 * weeks_ago)
        if period_start < first_seen_week:
            continue
        period_end = period_start + timedelta(days=elapsed_days)
        prior_totals.append(sum(amount for row_date, amount in dated_rows if period_start <= row_date <= period_end))
    if len(prior_totals) < 3:
        return None

    baseline = float(median(prior_totals))
    increase = current_total - baseline
    if baseline <= 0 or increase < MIN_INCREASE_PHP or increase / baseline < MIN_INCREASE_RATIO:
        return None

    increase_percent = increase / baseline * 100
    week_key = f"{current_start.isocalendar().year}-W{current_start.isocalendar().week:02d}"
    notification_id = hashlib.sha256(f"spending-spike:{user_id}:{category_id}:{week_key}".encode()).hexdigest()
    message = (
        f"{category_name} spending is higher than usual this week: "
        f"PHP {current_total:,.0f} so far versus your usual spending of PHP {baseline:,.0f} in recent comparable weeks "
        f"(+{increase_percent:.0f}%, +PHP {increase:,.0f})."
    )
    document = {
        "_id": notification_id,
        "user_id": user_id,
        "budget_id": None,
        "category_id": category_id,
        "category_name": category_name,
        "period_key": week_key,
        "event_type": "spending_spike",
        "title": "Spending higher than usual",
        "threshold": 0,
        "percentage_used": None,
        "current_amount": round(current_total, 2),
        "baseline_amount": round(baseline, 2),
        "change_amount": round(increase, 2),
        "change_percent": round(increase_percent, 2),
        "channel": "in_app",
        "level": "spending_spike",
        "message": message,
        "is_read": False,
        "created_at": datetime.now(timezone.utc),
        "email_status": "sending",
        "email_attempts": 1,
    }
    result = await db.notifications.update_one(
        {"_id": notification_id}, {"$setOnInsert": document}, upsert=True
    )
    if result.upserted_id is None:
        return None
    _queue_spending_activity_email(notification_id, user_id, document)
    return {**document, "id": notification_id}
