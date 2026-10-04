"""Shared budget-period, usage, and threshold helpers for FinAI."""
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
import asyncio
import hashlib
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
        "is_archived": {"$ne": True},
        "type": {"$regex": "^expense$", "$options": "i"},
        # Legacy goal deposits were stored as expenses; do not let those
        # historical records consume a category budget.
        "goal_id": None,
        "date": {"$gte": start_date, "$lte": end_date},
    }
    if category:
        category_id = str(category["_id"])
        query["$or"] = [
            {"category_id": {"$in": [category_id, category["_id"]]}},
            {"category_id": {"$in": [None, ""]}, "category": category_name},
        ]
    else:
        query["category"] = category_name
    
    # FIX: Hintayin muna natin makuha lahat ng data bago i-compute ang sum
    cursor = db.expenses.find(query, {"amount": 1})
    expense_items = await cursor.to_list(length=None)
    spent = sum(float(item.get("amount", 0) or 0) for item in expense_items)
    
    amount = float(budget.get("amount", 0) or 0)
    percentage = (spent / amount * 100) if amount > 0 else (100.0 if spent > 0 else 0.0)

    return {
        "id": str(budget.get("_id", budget.get("id", ""))),
        "user_id": user_id,
        "category_id": str(budget.get("category_id", "")),
        "category_name": category_name,
        "amount": amount,
        "rollover_enabled": bool(budget.get("rollover_enabled", False)),
        "rollover_in": 0.0,
        "rollover_out": 0.0,
        "available_limit": amount,
        "spent": round(spent, 2),
        "remaining": round(max(amount - spent, 0), 2),
        "percentage_used": round(percentage, 2),
        "period_type": period_type,
        "period_key": period_key,
        "start_date": start_date,
        "end_date": end_date,
    }


async def ensure_current_recurring_budgets(user_id: str) -> None:
    """Materialize this cycle's budgets from recurring rules, without rolling over spend."""
    # Upgrade existing budgets into recurring rules once. Deleted budgets are not
    # present here, so a user-deleted budget will not be silently recreated.
    existing = await db.budgets.find({"user_id": user_id}).to_list(length=500)
    latest_by_rule: Dict[Tuple[str, str], Tuple[str, Dict[str, Any]]] = {}
    for budget in existing:
        category_id = str(budget.get("category_id", ""))
        period_type = normalize_period_type(budget.get("period_type") or budget.get("period"))
        period_key = budget.get("period_key") or legacy_period_key(budget.get("month_year"))
        if not category_id or not period_key:
            continue
        _, _, start_date, _ = period_details(period_type, _period_reference(period_type, period_key))
        key = (category_id, period_type)
        if key not in latest_by_rule or start_date > latest_by_rule[key][0]:
            latest_by_rule[key] = (start_date, budget)

    for (category_id, period_type), (_, budget) in latest_by_rule.items():
        rule_key = {"user_id": user_id, "category_id": category_id, "period_type": period_type}
        await db.budget_rules.update_one(
            rule_key,
            {"$setOnInsert": {
                **rule_key,
                "amount": float(budget.get("amount", 0) or 0),
                "rollover_enabled": bool(budget.get("rollover_enabled", False)),
                "is_active": True,
                "created_at": datetime.now(PH_TZ),
            }},
            upsert=True,
        )

    rules = await db.budget_rules.find({"user_id": user_id, "is_active": True}).to_list(length=500)
    today = ph_today()
    for rule in rules:
        category_id = str(rule.get("category_id", ""))
        category = await category_for_budget(category_id, user_id)
        if not category or category.get("is_archived", False) or category.get("type", "").lower() != "expense":
            continue
        period_type = normalize_period_type(rule.get("period_type"))
        existing_periods = await db.budgets.find({
            "user_id": user_id, "category_id": category_id, "period_type": period_type,
        }).to_list(length=500)
        if existing_periods:
            last_reference = max(
                (_period_reference(period_type, item.get("period_key") or legacy_period_key(item.get("month_year")))
                 for item in existing_periods),
            )
            _, _, _, last_end = period_details(period_type, last_reference)
            next_start = date.fromisoformat(last_end) + timedelta(days=1)
        else:
            next_start = today

        # Fill any elapsed cycles in which the app was not opened, so rollover
        # chains remain continuous across empty-spend periods too.
        while next_start <= today:
            period_type, period_key, start_date, end_date = period_details(period_type, next_start)
            budget_key = {
                "user_id": user_id,
                "category_id": category_id,
                "period_type": period_type,
                "period_key": period_key,
            }
            now = datetime.now(PH_TZ)
            await db.budgets.update_one(
                budget_key,
                {"$setOnInsert": {
                    **budget_key,
                    "amount": float(rule.get("amount", 0) or 0),
                    "rollover_enabled": bool(rule.get("rollover_enabled", False)),
                    "spent": 0.0,
                    "start_date": start_date,
                    "end_date": end_date,
                    "created_at": now,
                    "updated_at": now,
                }},
                upsert=True,
            )
            next_start = date.fromisoformat(end_date) + timedelta(days=1)


def _period_reference(period_type: str, period_key: str) -> date:
    """Resolve a stored period key to its first calendar day for migration ordering."""
    try:
        if period_type == "weekly":
            match = re.fullmatch(r"(\d{4})-W(\d{2})", str(period_key))
            if match:
                return date.fromisocalendar(int(match.group(1)), int(match.group(2)), 1)
        elif period_type == "annual":
            return date(int(period_key), 1, 1)
        elif period_type == "monthly":
            return date.fromisoformat(f"{period_key}-01")
    except (ValueError, TypeError):
        pass
    return ph_today()


async def list_budget_usage(user_id: str) -> List[Dict[str, Any]]:
    await ensure_current_recurring_budgets(user_id)
    budgets = await db.budgets.find({"user_id": user_id}).to_list(length=500)
    usage_rows = [await budget_usage(budget) for budget in budgets]
    grouped: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
    for item in usage_rows:
        grouped.setdefault((item["category_id"], item["period_type"]), []).append(item)

    # Carry the signed unused balance forward only across periods where the user
    # enabled rollover. A negative balance represents prior overspending.
    for periods in grouped.values():
        periods.sort(key=lambda item: item["start_date"])
        rollover_balance = 0.0
        previous_end = None
        for item in periods:
            if not item["rollover_enabled"]:
                rollover_balance = 0.0
                item["rollover_in"] = 0.0
                item["available_limit"] = item["amount"]
                item["rollover_out"] = 0.0
            else:
                # Do not bridge a missing budget period; start fresh rather than
                # inventing carry from periods whose rule or spending is unknown.
                if previous_end is not None and item["start_date"] > previous_end:
                    expected_next_start = _next_period_start(item["period_type"], previous_end)
                    if item["start_date"] != expected_next_start:
                        rollover_balance = 0.0
                item["rollover_in"] = round(rollover_balance, 2)
                raw_available = item["amount"] + rollover_balance
                item["available_limit"] = round(max(raw_available, 0.0), 2)
                item["rollover_out"] = round(raw_available - item["spent"], 2)
                rollover_balance = item["rollover_out"]

            effective_limit = item["available_limit"]
            item["remaining"] = round(max(effective_limit - item["spent"], 0.0), 2)
            item["percentage_used"] = round(
                item["spent"] / effective_limit * 100 if effective_limit > 0
                else (100.0 if item["spent"] > 0 else 0.0), 2,
            )
            previous_end = item["end_date"]

    return usage_rows


def _next_period_start(period_type: str, current_end: str) -> str:
    end_date = date.fromisoformat(current_end)
    next_date = end_date + timedelta(days=1)
    if period_type == "weekly":
        return next_date.isoformat()
    if period_type == "annual":
        return date(next_date.year, 1, 1).isoformat()
    return next_date.replace(day=1).isoformat()


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
                # Retry transient SMTP failures a bounded number of times. The
                # conditional update claims the retry so concurrent requests do
                # not send duplicate emails.
                if existing.get("email_status") == "failed" and int(existing.get("email_attempts", 0)) < 3:
                    claim = await db.notifications.update_one(
                        {"_id": existing["_id"], "email_status": "failed", "email_attempts": {"$lt": 3}},
                        {"$set": {"email_status": "sending"}, "$inc": {"email_attempts": 1}},
                    )
                    if claim.matched_count:
                        await _send_threshold_email(existing["_id"], user_id, summary, threshold)
                continue

            level = "warning" if threshold == 70 else "critical" if threshold == 90 else "over_budget"
            message = (f"{summary['category_name']} has used {summary['percentage_used']:.0f}% of its "
                       f"{summary['period_type']} available budget (PHP {summary['spent']:.2f} of "
                       f"PHP {summary['available_limit']:.2f}).")
            notification = {
                "user_id": user_id, "budget_id": summary["id"], "category_id": summary["category_id"],
                "period_key": summary["period_key"], "threshold": threshold, "channel": "in_app",
                "level": level, "message": message, "is_read": False, "created_at": datetime.now(PH_TZ),
                "email_status": "sending", "email_attempts": 1,
            }
            # A deterministic id makes the check-and-insert safe when two requests
            # cross the same threshold at nearly the same time.
            stable_key = f"{user_id}:{summary['id']}:{summary['period_key']}:{threshold}:in_app"
            notification_id = hashlib.sha256(stable_key.encode("utf-8")).hexdigest()
            notification["_id"] = notification_id
            try:
                await db.notifications.insert_one(notification)
            except Exception as exc:
                if exc.__class__.__name__ in {"DuplicateKeyError", "BulkWriteError"}:
                    continue
                raise
            notification["id"] = notification_id
            notification.pop("_id", None)
            created.append(notification)

            await _send_threshold_email(notification_id, user_id, summary, threshold)
    return created


async def _send_threshold_email(notification_id, user_id: str, summary: Dict[str, Any], threshold: int) -> None:
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)}, {"email": 1})
        if user and user.get("email"):
            sent = await asyncio.to_thread(
                send_threshold_alert, user["email"], summary["category_name"], threshold,
                summary["spent"], summary["available_limit"], summary["period_type"],
            )
            email_status = "sent" if sent else "failed"
        else:
            email_status = "no_recipient"
        await db.notifications.update_one(
            {"_id": notification_id, "email_status": "sending"}, {"$set": {"email_status": email_status}},
        )
    except Exception as exc:
        await db.notifications.update_one(
            {"_id": notification_id, "email_status": "sending"}, {"$set": {"email_status": "failed"}},
        )
        print(f"Could not send budget alert email: {exc}")
