"""Shared budget-period, usage, and threshold helpers for FinAI."""
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
import asyncio
import re
from zoneinfo import ZoneInfo

from bson import ObjectId

from database import db
from email_utils import send_threshold_alert


PERIOD_TYPES = {"weekly", "monthly", "annual"}
THRESHOLDS = (70, 90, 100)

# FIX: FinAI is a Philippines-only app, but datetime.utcnow() reflects whatever
# timezone the SERVER's operating system happens to use -- almost always UTC on
# a cloud host. PH time is UTC+8, so for the first ~8 hours of every new day in
# the Philippines, UTC's calendar date still shows "yesterday". Anything that
# decides "what day is today" (weekly/monthly/annual period boundaries, which
# budgets count as still active) needs to use PH time explicitly, regardless of
# what timezone the machine running this code is configured with.
PH_TZ = ZoneInfo("Asia/Manila")


def ph_today() -> date:
    """The current calendar date in the Philippines, independent of server timezone."""
    return datetime.now(PH_TZ).date()


def normalize_period_type(value: Optional[str]) -> str:
    aliases = {"week": "weekly", "weekly": "weekly", "month": "monthly", "monthly": "monthly",
               "year": "annual", "yearly": "annual", "annual": "annual"}
    return aliases.get(str(value or "").strip().lower(), "monthly")


def parse_transaction_date(value: Optional[str]) -> date:
    """Return an ISO date, falling back only for legacy records without a valid date."""
    try:
        return datetime.strptime(str(value or "")[:10], "%Y-%m-%d").date()
    except ValueError:
        return ph_today()


def period_details(period_type: Optional[str], reference_date: Optional[date] = None) -> Tuple[str, str, str, str]:
    period_type = normalize_period_type(period_type)
    reference_date = reference_date or ph_today()

    if period_type == "weekly":
        start = reference_date - timedelta(days=reference_date.weekday())
        end = start + timedelta(days=6)
        return period_type, f"{start.isocalendar().year}-W{start.isocalendar().week:02d}", start.isoformat(), end.isoformat()
    if period_type == "annual":
        return period_type, str(reference_date.year), f"{reference_date.year}-01-01", f"{reference_date.year}-12-31"

    start = reference_date.replace(day=1)
    next_month = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    end = next_month - timedelta(days=1)
    return "monthly", start.strftime("%Y-%m"), start.isoformat(), end.isoformat()


def legacy_period_key(month_year: Optional[str]) -> Optional[str]:
    """Convert old MM-YYYY values into the new YYYY-MM key."""
    value = str(month_year or "")
    try:
        month, year = value.split("-", 1)
        return f"{int(year):04d}-{int(month):02d}"
    except (ValueError, TypeError):
        return None


async def category_for_budget(category_id: str, user_id: str) -> Optional[dict]:
    try:
        oid = ObjectId(category_id)
    except Exception:
        return None
    category = await db.categories.find_one({
        "_id": oid,
        "$or": [{"category_role": "admin"}, {"category_role": "user", "user_id": user_id}],
    })
    return category


async def budget_usage(budget: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate usage from saved transactions; budget.spent is never trusted as source data."""
    user_id = str(budget.get("user_id", ""))
    period_type = normalize_period_type(budget.get("period_type") or budget.get("period"))
    period_key = budget.get("period_key") or legacy_period_key(budget.get("month_year"))
    if period_key:
        if period_type == "monthly":
            reference = parse_transaction_date(f"{period_key}-01")
        elif period_type == "annual":
            reference = parse_transaction_date(f"{period_key}-01-01")
        elif period_type == "weekly":
            match = re.fullmatch(r"(\d{4})-W(\d{2})", str(period_key))
            reference = date.fromisocalendar(int(match.group(1)), int(match.group(2)), 1) if match else ph_today()
        else:
            reference = ph_today()
    else:
        reference = ph_today()
    period_type, period_key, start_date, end_date = period_details(period_type, reference)

    category = await category_for_budget(str(budget.get("category_id", "")), user_id)
    category_name = category.get("name") if category else "Unknown"
    query = {
        "user_id": user_id,
        "type": {"$regex": "^expense$", "$options": "i"},
        # Legacy goal deposits were stored as expenses; do not let those
        # historical records consume a category budget.
        "goal_id": None,
        "category": category_name,
        "date": {"$gte": start_date, "$lte": end_date},
    }
    
    # FIX: Hintayin muna natin makuha lahat ng data bago i-compute ang sum
    cursor = db.expenses.find(query, {"amount": 1})
    expense_items = await cursor.to_list(length=None)
    spent = sum(float(item.get("amount", 0) or 0) for item in expense_items)
    
    amount = float(budget.get("amount", 0) or 0)
    percentage = (spent / amount * 100) if amount > 0 else 0.0

    return {
        "id": str(budget.get("_id", budget.get("id", ""))),
        "user_id": user_id,
        "category_id": str(budget.get("category_id", "")),
        "category_name": category_name,
        "amount": amount,
        "spent": round(spent, 2),
        "remaining": round(max(amount - spent, 0), 2),
        "percentage_used": round(percentage, 2),
        "period_type": period_type,
        "period_key": period_key,
        "start_date": start_date,
        "end_date": end_date,
    }


async def list_budget_usage(user_id: str) -> List[Dict[str, Any]]:
    budgets = await db.budgets.find({"user_id": user_id}).to_list(length=500)
    return [await budget_usage(budget) for budget in budgets]


async def create_crossed_threshold_notifications(user_id: str) -> List[Dict[str, Any]]:
    """Record and email each 70%, 90%, and 100% threshold once per budget period."""
    created = []
    today_key = ph_today().isoformat()
    for summary in await list_budget_usage(user_id):
        if summary["end_date"] < today_key:
            continue

        crossed = [threshold for threshold in THRESHOLDS if summary["percentage_used"] >= threshold]
        for threshold in crossed:
            existing = await db.notifications.find_one({
                "user_id": user_id, "budget_id": summary["id"], "period_key": summary["period_key"],
                "threshold": threshold, "channel": "in_app",
            })
            if existing:
                continue

            level = "warning" if threshold == 70 else "critical" if threshold == 90 else "over_budget"
            message = (f"{summary['category_name']} has used {summary['percentage_used']:.0f}% of its "
                       f"{summary['period_type']} budget (PHP {summary['spent']:.2f} of PHP {summary['amount']:.2f}).")
            notification = {
                "user_id": user_id, "budget_id": summary["id"], "category_id": summary["category_id"],
                "period_key": summary["period_key"], "threshold": threshold, "channel": "in_app",
                "level": level, "message": message, "is_read": False, "created_at": datetime.now(PH_TZ),
            }
            result = await db.notifications.insert_one(notification)
            notification["id"] = str(result.inserted_id)
            notification.pop("_id", None)
            created.append(notification)

            try:
                user = await db.users.find_one({"_id": ObjectId(user_id)}, {"email": 1})
                if user and user.get("email"):
                    sent = await asyncio.to_thread(
                        send_threshold_alert, user["email"], summary["category_name"], threshold,
                        summary["spent"], summary["amount"], summary["period_type"],
                    )
                    email_status = "sent" if sent else "failed"
                else:
                    email_status = "no_recipient"
                await db.notifications.update_one(
                    {"_id": result.inserted_id}, {"$set": {"email_status": email_status}},
                )
            except Exception as exc:
                await db.notifications.update_one(
                    {"_id": result.inserted_id}, {"$set": {"email_status": "failed"}},
                )
                print(f"Could not send budget alert email: {exc}")
    return created
