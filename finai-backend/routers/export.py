# finai-backend/routers/export.py
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import math
from typing import Any, Dict, List

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Depends
from database import db
from auth import get_current_user
from services.budget_service import ph_today, normalize_period_type, legacy_period_key

router = APIRouter(prefix="/api/export", tags=["Export"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)

@router.get("/backup")
async def export_user_data(current_user: dict = Depends(get_current_user)):
    """Export all financial records (transactions, accounts, budgets, and goals) for a specific user."""
    user_id = current_user["id"]

    # 1. Kunin ang mga transaksyon ng user
    transactions = []
    async for txn in db.expenses.find({"user_id": user_id}):
        txn["_id"] = str(txn["_id"])
        transactions.append(txn)

    # 2. Kunin ang mga accounts ng user
    accounts = []
    async for acc in db.accounts.find({"user_id": user_id}):
        acc["_id"] = str(acc["_id"])
        accounts.append(acc)

    # 3. Kunin ang mga budgets ng user
    budgets = []
    async for bgt in db.budgets.find({"user_id": user_id}):
        bgt["_id"] = str(bgt["_id"])
        budgets.append(bgt)

    # Recurrence settings live separately from individual budget periods.
    budget_rules = []
    async for rule in db.budget_rules.find({"user_id": user_id}):
        rule["_id"] = str(rule["_id"])
        budget_rules.append(rule)

    # 4. Kunin ang mga financial goals ng user
    goals = []
    async for goal in db.goals.find({"user_id": user_id}):
        goal["_id"] = str(goal["_id"])
        goals.append(goal)

    backup_data = {
        "version": "1.1",
        "user_id": user_id,
        "transactions": transactions,
        "accounts": accounts,
        "budgets": budgets,
        "budget_rules": budget_rules,
        "goals": goals
    }

    return backup_data


@router.post("/restore")
async def restore_user_data(payload: dict, current_user: dict = Depends(get_current_user)):
    """Validate the complete backup, then replace the user's data atomically."""
    user_id = current_user["id"]
    collections = ("transactions", "accounts", "budgets", "goals")
    optional_collections = ("budget_rules",)
    if not isinstance(payload, dict) or any(
        not isinstance(payload.get(name, []), list)
        or len(payload.get(name, [])) > 5000
        or any(not isinstance(item, dict) for item in payload.get(name, []))
        for name in collections
    ) or any(
        name in payload and (
            not isinstance(payload[name], list)
            or len(payload[name]) > 5000
            or any(not isinstance(item, dict) for item in payload[name])
        )
        for name in optional_collections
    ):
        raise HTTPException(status_code=422, detail="Backup must contain valid record lists (up to 5,000 each).")

    def require_text(record: dict, field: str, max_length: int = 200) -> str:
        value = record.get(field)
        if not isinstance(value, str) or not value.strip() or len(value) > max_length:
            raise HTTPException(status_code=422, detail=f"Invalid {field} in backup.")
        return value.strip()

    def require_amount(record: dict, field: str, *, allow_zero: bool = False) -> float:
        value = record.get(field)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise HTTPException(status_code=422, detail=f"Invalid {field} in backup.")
        if value < 0 or (not allow_zero and value == 0):
            raise HTTPException(status_code=422, detail=f"Invalid {field} in backup.")
        try:
            decimal_value = Decimal(str(value))
            if decimal_value != decimal_value.quantize(Decimal("0.01")):
                raise HTTPException(status_code=422, detail=f"Invalid {field}: use no more than two decimal places.")
        except InvalidOperation as exc:
            raise HTTPException(status_code=422, detail=f"Invalid {field} in backup.") from exc
        return float(value)

    def optional_text(record: dict, field: str, max_length: int = 500) -> str | None:
        value = record.get(field)
        if value is None:
            return None
        if not isinstance(value, str) or len(value) > max_length:
            raise HTTPException(status_code=422, detail=f"Invalid {field} in backup.")
        return value

    def optional_bool(record: dict, field: str, default: bool = False) -> bool:
        value = record.get(field, default)
        if not isinstance(value, bool):
            raise HTTPException(status_code=422, detail=f"Invalid {field} in backup.")
        return value

    goal_id_map: Dict[str, ObjectId] = {}
    restored_goals: List[dict] = []
    for source in payload.get("goals", []):
        try:
            old_id = str(ObjectId(str(source.get("_id", ""))))
        except Exception as exc:
            raise HTTPException(status_code=422, detail="Every goal in the backup must have a valid ID.") from exc
        if old_id in goal_id_map:
            raise HTTPException(status_code=422, detail="The backup contains duplicate goal IDs.")
        new_id = ObjectId()
        goal_id_map[old_id] = new_id
        target_date = require_text(source, "target_date", 10)
        try:
            datetime.strptime(target_date, "%Y-%m-%d")
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Invalid goal target date in backup.") from exc
        restored_goals.append({
            "_id": new_id,
            "user_id": user_id,
            "goal_type_id": require_text(source, "goal_type_id", 100),
            "target_name": require_text(source, "target_name"),
            "target_amount": require_amount(source, "target_amount"),
            "current_savings": require_amount(source, "current_savings", allow_zero=True),
            "target_date": target_date,
            "is_archived": optional_bool(source, "is_archived"),
            "created_at": source.get("created_at") if isinstance(source.get("created_at"), (str, datetime)) else _utcnow(),
        })

    restored_accounts = []
    for source in payload.get("accounts", []):
        icon = optional_text(source, "icon", 32)
        parent_id = optional_text(source, "parent_template_id", 100)
        restored_accounts.append({
            "user_id": user_id,
            "account_role": "user",  # Never trust the role in an uploaded file.
            "name": require_text(source, "name"),
            "initial_balance": require_amount(source, "initial_balance", allow_zero=True),
            "icon": icon or "wallet",
            "parent_template_id": parent_id,
            "is_archived": optional_bool(source, "is_archived"),
        })

    restored_budgets = []
    budget_keys = set()
    for source in payload.get("budgets", []):
        category_id = require_text(source, "category_id", 100)
        try:
            ObjectId(category_id)
        except Exception as exc:
            raise HTTPException(status_code=422, detail="Invalid budget category in backup.") from exc
        period_type = source.get("period_type", "monthly")
        if period_type not in {"weekly", "monthly", "annual"}:
            raise HTTPException(status_code=422, detail="Invalid budget period in backup.")
        period_key = require_text(source, "period_key", 20)
        key = (category_id, period_type, period_key)
        if key in budget_keys:
            raise HTTPException(status_code=422, detail="The backup contains duplicate budgets.")
        budget_keys.add(key)
        restored_budgets.append({
            "user_id": user_id,
            "category_id": category_id,
            "amount": require_amount(source, "amount"),
            "period_type": period_type,
            "period_key": period_key,
            "month_year": optional_text(source, "month_year", 20),
            "rollover_enabled": optional_bool(source, "rollover_enabled"),
            "budget_kind": source.get("budget_kind", "variable"),
            "spent": 0.0,
            "created_at": source.get("created_at") if isinstance(source.get("created_at"), (str, datetime)) else _utcnow(),
            "updated_at": _utcnow(),
        })
        if not isinstance(restored_budgets[-1]["budget_kind"], str) or restored_budgets[-1]["budget_kind"] not in {"fixed", "variable"}:
            raise HTTPException(status_code=422, detail="Invalid budget kind in backup.")

    restored_budget_rules = []
    if "budget_rules" in payload:
        rule_keys = set()
        for source in payload.get("budget_rules", []):
            category_id = require_text(source, "category_id", 100)
            try:
                ObjectId(category_id)
            except Exception as exc:
                raise HTTPException(status_code=422, detail="Invalid recurring budget category in backup.") from exc
            raw_period_type = str(source.get("period_type", "")).strip().lower()
            period_type = normalize_period_type(raw_period_type)
            if raw_period_type not in {"week", "weekly", "month", "monthly", "year", "yearly", "annual"}:
                raise HTTPException(status_code=422, detail="Invalid recurring budget period in backup.")
            key = (category_id, period_type)
            if key in rule_keys:
                raise HTTPException(status_code=422, detail="The backup contains duplicate recurring budgets.")
            rule_keys.add(key)
            budget_kind = source.get("budget_kind", "variable")
            if not isinstance(budget_kind, str) or budget_kind not in {"fixed", "variable"}:
                raise HTTPException(status_code=422, detail="Invalid recurring budget kind in backup.")
            restored_budget_rules.append({
                "user_id": user_id,
                "category_id": category_id,
                "period_type": period_type,
                "amount": require_amount(source, "amount"),
                "rollover_enabled": optional_bool(source, "rollover_enabled"),
                "budget_kind": budget_kind,
                "is_active": optional_bool(source, "is_active", True),
                "created_at": source.get("created_at") if isinstance(source.get("created_at"), (str, datetime)) else _utcnow(),
                "updated_at": source.get("updated_at") if isinstance(source.get("updated_at"), (str, datetime)) else _utcnow(),
            })
    else:
        # Backward compatibility for version 1.0 exports, which did not include
        # recurrence rules. Rebuild each rule from that category/period's newest
        # snapshot so imported backups keep rolling forward instead of stopping.
        latest_snapshots = {}
        for budget in restored_budgets:
            period_type = normalize_period_type(budget.get("period_type"))
            period_key = budget.get("period_key") or legacy_period_key(budget.get("month_year"))
            if not period_key:
                continue
            key = (budget["category_id"], period_type)
            if key not in latest_snapshots or period_key > latest_snapshots[key][0]:
                latest_snapshots[key] = (period_key, budget)
        for (category_id, period_type), (_, budget) in latest_snapshots.items():
            restored_budget_rules.append({
                "user_id": user_id,
                "category_id": category_id,
                "period_type": period_type,
                "amount": budget["amount"],
                "rollover_enabled": budget["rollover_enabled"],
                "budget_kind": budget["budget_kind"],
                "is_active": True,
                "created_at": _utcnow(),
                "updated_at": _utcnow(),
            })

    restored_transactions = []
    for source in payload.get("transactions", []):
        txn_type = require_text(source, "type", 30).title()
        if txn_type not in {"Income", "Expense", "Transfer", "Contribution"}:
            raise HTTPException(status_code=422, detail="Invalid transaction type in backup.")
        account_name = require_text(source, "account", 100)
        to_account = optional_text(source, "to_account", 100)
        if txn_type == "Transfer" and (not to_account or to_account == account_name):
            raise HTTPException(status_code=422, detail="Invalid transfer in backup.")
        if txn_type != "Transfer":
            to_account = None
        old_goal_id = optional_text(source, "goal_id", 100)
        if txn_type == "Contribution" and not old_goal_id:
            raise HTTPException(status_code=422, detail="A contribution must be linked to a goal.")
        if old_goal_id and old_goal_id not in goal_id_map:
            raise HTTPException(status_code=422, detail="A transaction references a goal missing from the backup.")
        txn_date = optional_text(source, "date", 10)
        if txn_date:
            try:
                parsed_txn_date = datetime.strptime(txn_date, "%Y-%m-%d").date()
            except ValueError as exc:
                raise HTTPException(status_code=422, detail="Invalid transaction date in backup.") from exc
            if parsed_txn_date > ph_today():
                raise HTTPException(status_code=422, detail="The backup contains a future-dated transaction.")
        txn = {
            "user_id": user_id,
            "amount": require_amount(source, "amount"),
            "category": require_text(source, "category", 100),
            "type": txn_type,
            "account": account_name,
            "to_account": to_account,
            "date": txn_date or ph_today().isoformat(),
            "created_at": source.get("created_at") if isinstance(source.get("created_at"), (str, datetime)) else _utcnow(),
            "is_archived": optional_bool(source, "is_archived"),
        }
        for field in ("title", "item_name", "note"):
            value = optional_text(source, field)
            if value is not None:
                txn[field] = value
        if old_goal_id:
            txn["goal_id"] = str(goal_id_map[old_goal_id])
        if "archived_at" in source and isinstance(source["archived_at"], (str, datetime)):
            txn["archived_at"] = source["archived_at"]
        if optional_bool(source, "goal_contribution_reversed"):
            txn["goal_contribution_reversed"] = True
        restored_transactions.append(txn)

    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                await db.expenses.delete_many({"user_id": user_id}, session=session)
                await db.accounts.delete_many({"user_id": user_id}, session=session)
                await db.budgets.delete_many({"user_id": user_id}, session=session)
                await db.budget_rules.delete_many({"user_id": user_id}, session=session)
                await db.goals.delete_many({"user_id": user_id}, session=session)
                if restored_accounts:
                    await db.accounts.insert_many(restored_accounts, session=session)
                if restored_budgets:
                    await db.budgets.insert_many(restored_budgets, session=session)
                if restored_budget_rules:
                    await db.budget_rules.insert_many(restored_budget_rules, session=session)
                if restored_goals:
                    await db.goals.insert_many(restored_goals, session=session)
                if restored_transactions:
                    await db.expenses.insert_many(restored_transactions, session=session)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Restore did not complete. Existing data was preserved; verify MongoDB transaction support and try again.") from exc

    return {"status": "success", "message": "Financial records restored successfully."}
