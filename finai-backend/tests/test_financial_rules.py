"""Isolated regression tests for FinAI's core balance and budget rules.

These tests replace the Mongo database with in-memory fakes and point any lazy
Motor client at localhost. They never connect to the developer's configured DB.
Run with: python -m unittest discover -s tests -v
"""

import os
import sys
import types
import unittest
from copy import deepcopy
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from bson import ObjectId
from fastapi import HTTPException
from pydantic import ValidationError

os.environ["MONGO_URL"] = "mongodb://127.0.0.1:27017/finai_test"
os.environ["GEMINI_API_KEY"] = ""
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import main
from main import TransactionSchema, validate_transaction_for_storage
from routers import accounts as accounts_router
from routers import goals as goals_router
from schemas.goal import GoalDeposit
from services import budget_service


def _same(left, right):
    if left == right:
        return True
    if isinstance(left, ObjectId) or isinstance(right, ObjectId):
        return str(left) == str(right)
    return False


def _matches(document, query):
    for key, expected in query.items():
        if key == "$or":
            if not any(_matches(document, branch) for branch in expected):
                return False
            continue
        if key == "$and":
            if not all(_matches(document, branch) for branch in expected):
                return False
            continue

        exists = key in document
        actual = document.get(key)
        if isinstance(expected, dict):
            for operator, operand in expected.items():
                if operator == "$options":
                    continue
                if operator == "$exists" and exists != operand:
                    return False
                if operator == "$ne" and exists and _same(actual, operand):
                    return False
                if operator == "$in" and not any(_same(actual, option) for option in operand):
                    return False
                if operator == "$regex":
                    import re
                    flags = re.IGNORECASE if expected.get("$options") == "i" else 0
                    if actual is None or re.search(operand, str(actual), flags) is None:
                        return False
                if operator == "$gte" and (actual is None or actual < operand):
                    return False
                if operator == "$lte" and (actual is None or actual > operand):
                    return False
        elif not _same(actual, expected):
            return False
    return True


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows

    def __aiter__(self):
        async def iterate():
            for row in self.rows:
                yield deepcopy(row)
        return iterate()

    async def to_list(self, length=None):
        rows = deepcopy(self.rows)
        return rows if length is None else rows[:length]


class FakeCollection:
    def __init__(self, rows=None):
        self.rows = deepcopy(rows or [])
        self.insert_calls = 0

    async def find_one(self, query, projection=None, session=None):
        return next((deepcopy(row) for row in self.rows if _matches(row, query)), None)

    def find(self, query=None, *args, **kwargs):
        query = query or {}
        return FakeCursor([row for row in self.rows if _matches(row, query)])

    async def insert_one(self, document, session=None):
        saved = deepcopy(document)
        saved.setdefault("_id", ObjectId())
        self.rows.append(saved)
        self.insert_calls += 1
        return SimpleNamespace(inserted_id=saved["_id"])

    async def update_one(self, query, update, session=None, upsert=False):
        row = next((row for row in self.rows if _matches(row, query)), None)
        if row is None:
            return SimpleNamespace(matched_count=0, modified_count=0)
        for key, value in update.get("$set", {}).items():
            row[key] = value
        for key, value in update.get("$inc", {}).items():
            row[key] = row.get(key, 0) + value
        for key in update.get("$unset", {}):
            row.pop(key, None)
        return SimpleNamespace(matched_count=1, modified_count=1)


class FakeSession:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    async def with_transaction(self, callback):
        return await callback(self)


class FakeClient:
    async def start_session(self):
        return FakeSession()


class FakeDatabase:
    def __init__(self, *, accounts=None, expenses=None, goals=None, notifications=None, budgets=None):
        self.accounts = accounts or FakeCollection()
        self.expenses = expenses or FakeCollection()
        self.goals = goals or FakeCollection()
        self.notifications = notifications or FakeCollection()
        self.budgets = budgets or FakeCollection()
        self.client = FakeClient()


def transaction(*, amount=10, kind="Expense", account="Cash", to_account=None, date_value="2026-01-01", goal_id=None):
    return TransactionSchema(
        user_id="untrusted-client-id",
        amount=amount,
        category="Groceries",
        type=kind,
        account=account,
        to_account=to_account,
        date=date_value,
        goal_id=goal_id,
    )


class TransactionRuleTests(unittest.TestCase):
    def test_schema_rejects_zero_negative_and_non_finite_amounts(self):
        for amount in (0, -1, float("nan"), float("inf")):
            with self.subTest(amount=amount), self.assertRaises(ValidationError):
                transaction(amount=amount)

    def test_transfer_requires_a_different_destination(self):
        for destination in (None, "Cash", "   "):
            with self.subTest(destination=destination), self.assertRaises(HTTPException) as raised:
                validate_transaction_for_storage(transaction(kind="Transfer", to_account=destination))
            self.assertEqual(raised.exception.status_code, 422)

    def test_valid_transfer_is_normalized_and_cannot_be_a_category_expense(self):
        item = transaction(kind="transfer", account=" Cash ", to_account="Bank")
        validate_transaction_for_storage(item)
        self.assertEqual(item.type, "Transfer")
        self.assertEqual(item.account, "Cash")
        self.assertEqual(item.category, "Transfer")

    def test_contribution_requires_a_goal(self):
        with self.assertRaises(HTTPException) as raised:
            validate_transaction_for_storage(transaction(kind="Contribution"))
        self.assertEqual(raised.exception.status_code, 422)

    def test_server_rejects_future_dated_transactions(self):
        with self.assertRaises(HTTPException) as raised:
            validate_transaction_for_storage(transaction(date_value="2999-01-01"))
        self.assertEqual(raised.exception.status_code, 422)


class AccountBalanceTests(unittest.IsolatedAsyncioTestCase):
    async def test_income_expense_transfer_and_contribution_balance_rules(self):
        cash_id, bank_id = ObjectId(), ObjectId()
        fake_db = FakeDatabase(expenses=FakeCollection([
            {"user_id": "u1", "type": "Income", "amount": 1000, "account": "Cash", "account_id": str(cash_id)},
            {"user_id": "u1", "type": "Expense", "amount": 200, "account": "Cash", "account_id": str(cash_id)},
            {"user_id": "u1", "type": "Transfer", "amount": 100, "account": "Cash", "account_id": str(cash_id), "to_account": "Bank", "to_account_id": str(bank_id)},
            {"user_id": "u1", "type": "Transfer", "amount": 80, "account": "Bank", "account_id": str(bank_id), "to_account": "Cash", "to_account_id": str(cash_id)},
            {"user_id": "u1", "type": "Contribution", "amount": 50, "account": "Cash", "account_id": str(cash_id)},
        ]))
        with patch.object(accounts_router, "db", fake_db):
            cash = await accounts_router.calculate_account_balance("Cash", "u1", 500, account_id=str(cash_id))
            bank = await accounts_router.calculate_account_balance("Bank", "u1", 100, account_id=str(bank_id))
        self.assertEqual(cash, 1230)
        self.assertEqual(bank, 120)


class TransactionEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.cash_id, self.bank_id = ObjectId(), ObjectId()
        self.fake_db = FakeDatabase(accounts=FakeCollection([
            {"_id": self.cash_id, "name": "Cash", "user_id": "u1", "account_role": "user", "initial_balance": 200, "is_archived": False},
            {"_id": self.bank_id, "name": "Bank", "user_id": "u1", "account_role": "user", "initial_balance": 10, "is_archived": False},
        ]))
        self.patches = [
            patch.object(main, "db", self.fake_db),
            patch.object(accounts_router, "db", self.fake_db),
            patch.object(main, "validate_transaction_references", new=AsyncMock(side_effect=self._resolve_refs)),
            patch.object(main, "safely_refresh_budget_notifications", new=AsyncMock(return_value=[])),
            patch.object(accounts_router, "ensure_account_balance_lock", new=AsyncMock(side_effect=lambda user, oid: f"{user}:{oid}")),
            patch.object(accounts_router, "lock_account_balance", new=AsyncMock()),
        ]
        for active_patch in self.patches:
            active_patch.start()
            self.addCleanup(active_patch.stop)

    async def _resolve_refs(self, item, user_id):
        item.account_id = str(self.cash_id if item.account == "Cash" else self.bank_id)
        item.to_account_id = str(self.cash_id if item.to_account == "Cash" else self.bank_id) if item.to_account else None
        item.category_id = None if item.type == "Transfer" else str(ObjectId())

    async def test_overspending_expense_is_rejected_without_inserting_a_record(self):
        with self.assertRaises(HTTPException) as raised:
            await main.add_expense(transaction(amount=200.01, date_value="2026-01-01"), {"id": "u1"})
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(self.fake_db.expenses.insert_calls, 0)

    async def test_transfer_records_one_event_and_updates_both_derived_balances(self):
        result = await main.add_expense(
            transaction(amount=75, kind="Transfer", account="Cash", to_account="Bank"),
            {"id": "u1"},
        )
        self.assertEqual(result["status"], "Success")
        self.assertEqual(self.fake_db.expenses.insert_calls, 1)
        stored = self.fake_db.expenses.rows[0]
        self.assertEqual(stored["type"], "Transfer")
        self.assertEqual(stored["category"], "Transfer")
        self.assertEqual(
            await accounts_router.calculate_account_balance("Cash", "u1", 200, account_id=str(self.cash_id)),
            125,
        )
        self.assertEqual(
            await accounts_router.calculate_account_balance("Bank", "u1", 10, account_id=str(self.bank_id)),
            85,
        )

    async def test_editing_expense_checks_the_resulting_account_balance(self):
        expense_id = ObjectId()
        await self.fake_db.expenses.insert_one({
            "_id": expense_id, "user_id": "u1", "type": "Expense", "amount": 50,
            "category": "Groceries", "account": "Cash", "account_id": str(self.cash_id),
            "to_account": None, "to_account_id": None, "is_archived": False,
        })
        with self.assertRaises(HTTPException) as raised:
            await main.update_expense(str(expense_id), transaction(amount=201), {"id": "u1"})
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(self.fake_db.expenses.rows[0]["amount"], 50)

    async def test_valid_expense_edit_replaces_the_old_amount_in_balance(self):
        expense_id = ObjectId()
        await self.fake_db.expenses.insert_one({
            "_id": expense_id, "user_id": "u1", "type": "Expense", "amount": 50,
            "category": "Groceries", "account": "Cash", "account_id": str(self.cash_id),
            "to_account": None, "to_account_id": None, "is_archived": False,
        })
        result = await main.update_expense(str(expense_id), transaction(amount=60), {"id": "u1"})
        self.assertEqual(result["status"], "Success")
        self.assertEqual(self.fake_db.expenses.rows[0]["amount"], 60)
        self.assertEqual(
            await accounts_router.calculate_account_balance("Cash", "u1", 200, account_id=str(self.cash_id)),
            140,
        )

    async def test_archive_and_restore_reverse_and_reapply_an_expense_once(self):
        expense_id = ObjectId()
        await self.fake_db.expenses.insert_one({
            "_id": expense_id, "user_id": "u1", "type": "Expense", "amount": 50,
            "category": "Groceries", "account": "Cash", "account_id": str(self.cash_id),
            "to_account": None, "to_account_id": None, "is_archived": False,
        })
        await main.archive_expense(str(expense_id), {"id": "u1"})
        self.assertTrue(self.fake_db.expenses.rows[0]["is_archived"])
        self.assertEqual(
            await accounts_router.calculate_account_balance("Cash", "u1", 200, account_id=str(self.cash_id)),
            200,
        )

        await main.restore_expense(str(expense_id), {"id": "u1"})
        self.assertFalse(self.fake_db.expenses.rows[0]["is_archived"])
        self.assertEqual(
            await accounts_router.calculate_account_balance("Cash", "u1", 200, account_id=str(self.cash_id)),
            150,
        )


class GoalContributionTests(unittest.IsolatedAsyncioTestCase):
    async def test_contribution_debits_account_and_credits_goal_atomically(self):
        account_id, goal_id = ObjectId(), ObjectId()
        goal = {"_id": goal_id, "user_id": "u1", "target_name": "Emergency Fund", "current_savings": 20, "is_archived": False}
        fake_db = FakeDatabase(
            accounts=FakeCollection([{"_id": account_id, "name": "Cash", "user_id": "u1", "account_role": "user", "initial_balance": 200, "is_archived": False}]),
            goals=FakeCollection([goal]),
        )
        patches = [
            patch.object(goals_router, "db", fake_db),
            patch.object(accounts_router, "db", fake_db),
            patch.object(goals_router, "ensure_account_balance_lock", new=AsyncMock(return_value="u1:cash")),
            patch.object(goals_router, "lock_account_balance", new=AsyncMock()),
        ]
        for active_patch in patches:
            active_patch.start()
            self.addCleanup(active_patch.stop)

        result = await goals_router.deposit_to_goal(
            str(goal_id), GoalDeposit(user_id="ignored", amount=75, account="Cash"), {"id": "u1"},
        )
        self.assertEqual(result["status"], "Success")
        self.assertEqual(fake_db.goals.rows[0]["current_savings"], 95)
        self.assertEqual(fake_db.expenses.insert_calls, 1)
        self.assertEqual(fake_db.expenses.rows[0]["type"], "Contribution")
        self.assertEqual(
            await accounts_router.calculate_account_balance("Cash", "u1", 200, account_id=str(account_id)),
            125,
        )

    async def test_contribution_cannot_exceed_account_balance(self):
        account_id, goal_id = ObjectId(), ObjectId()
        fake_db = FakeDatabase(
            accounts=FakeCollection([{"_id": account_id, "name": "Cash", "user_id": "u1", "account_role": "user", "initial_balance": 40, "is_archived": False}]),
            goals=FakeCollection([{"_id": goal_id, "user_id": "u1", "target_name": "Emergency Fund", "current_savings": 20, "is_archived": False}]),
        )
        patches = [
            patch.object(goals_router, "db", fake_db),
            patch.object(accounts_router, "db", fake_db),
            patch.object(goals_router, "ensure_account_balance_lock", new=AsyncMock(return_value="u1:cash")),
            patch.object(goals_router, "lock_account_balance", new=AsyncMock()),
        ]
        for active_patch in patches:
            active_patch.start()
            self.addCleanup(active_patch.stop)
        with self.assertRaises(HTTPException) as raised:
            await goals_router.deposit_to_goal(
                str(goal_id), GoalDeposit(user_id="u1", amount=40.01, account="Cash"), {"id": "u1"},
            )
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(fake_db.expenses.insert_calls, 0)
        self.assertEqual(fake_db.goals.rows[0]["current_savings"], 20)


class BudgetRuleTests(unittest.IsolatedAsyncioTestCase):
    def _summary(self, percentage):
        return {
            "id": "budget-1", "user_id": "u1", "category_id": "category-1", "category_name": "Transport",
            "period_key": "2026-10", "period_type": "monthly", "start_date": "2026-10-01",
            "end_date": "2026-10-31", "amount": 500, "available_limit": 500,
            "spent": percentage * 5, "percentage_used": percentage,
        }

    async def _run_threshold_check(self, summary, collection):
        fake_db = FakeDatabase(notifications=collection)
        with (
            patch.object(budget_service, "db", fake_db),
            patch.object(budget_service, "ph_today", return_value=date(2026, 10, 11)),
            patch.object(budget_service, "list_budget_usage", new=AsyncMock(return_value=[summary])),
            patch.object(budget_service, "_queue_threshold_email", new=Mock()) as send_email,
        ):
            created = await budget_service.create_crossed_threshold_notifications("u1")
        return created, send_email

    async def test_jump_directly_to_90_only_notifies_90_percent(self):
        collection = FakeCollection()
        created, send_email = await self._run_threshold_check(self._summary(90), collection)
        self.assertEqual([item["threshold"] for item in created], [90])
        self.assertEqual(send_email.call_count, 1)
        self.assertEqual(send_email.call_args.args[3], 90)
        suppressed = next(item for item in collection.rows if item["threshold"] == 70)
        self.assertTrue(suppressed["suppressed"])

    async def test_sequential_70_then_90_sends_one_alert_at_each_stage(self):
        collection = FakeCollection()
        first, first_email = await self._run_threshold_check(self._summary(70), collection)
        second, second_email = await self._run_threshold_check(self._summary(90), collection)
        self.assertEqual([item["threshold"] for item in first], [70])
        self.assertEqual([item["threshold"] for item in second], [90])
        self.assertEqual(first_email.call_count, 1)
        self.assertEqual(second_email.call_count, 1)
        self.assertCountEqual([item["threshold"] for item in collection.rows if not item.get("suppressed")], [70, 90])

    async def test_jump_directly_to_100_only_notifies_100_percent(self):
        collection = FakeCollection()
        created, send_email = await self._run_threshold_check(self._summary(100), collection)
        self.assertEqual([item["threshold"] for item in created], [100])
        self.assertEqual(send_email.call_count, 1)
        self.assertEqual(send_email.call_args.args[3], 100)
        self.assertCountEqual(
            [item["threshold"] for item in collection.rows if item.get("suppressed")],
            [70, 90],
        )

    async def test_rollover_carries_unused_and_overspent_amount_then_resets_when_disabled(self):
        periods = [
            {"_id": "p1", "user_id": "u1", "category_id": "c1", "period_type": "monthly", "period_key": "2026-01", "rollover_enabled": True},
            {"_id": "p2", "user_id": "u1", "category_id": "c1", "period_type": "monthly", "period_key": "2026-02", "rollover_enabled": True},
            {"_id": "p3", "user_id": "u1", "category_id": "c1", "period_type": "monthly", "period_key": "2026-03", "rollover_enabled": False},
        ]
        usage = {
            "p1": {"id": "p1", "user_id": "u1", "category_id": "c1", "period_type": "monthly", "period_key": "2026-01", "start_date": "2026-01-01", "end_date": "2026-01-31", "amount": 500, "rollover_enabled": True, "spent": 600},
            "p2": {"id": "p2", "user_id": "u1", "category_id": "c1", "period_type": "monthly", "period_key": "2026-02", "start_date": "2026-02-01", "end_date": "2026-02-28", "amount": 500, "rollover_enabled": True, "spent": 100},
            "p3": {"id": "p3", "user_id": "u1", "category_id": "c1", "period_type": "monthly", "period_key": "2026-03", "start_date": "2026-03-01", "end_date": "2026-03-31", "amount": 500, "rollover_enabled": False, "spent": 50},
        }
        fake_db = FakeDatabase(budgets=FakeCollection(periods))
        with (
            patch.object(budget_service, "db", fake_db),
            patch.object(budget_service, "ensure_current_recurring_budgets", new=AsyncMock()),
            patch.object(budget_service, "budget_usage", new=AsyncMock(side_effect=lambda budget: deepcopy(usage[budget["_id"]]))),
        ):
            rows = await budget_service.list_budget_usage("u1")
        self.assertEqual([row["available_limit"] for row in rows], [500, 400, 500])
        self.assertEqual([row["rollover_in"] for row in rows], [0, -100, 0])
        self.assertEqual([row["rollover_out"] for row in rows], [-100, 300, 0])


if __name__ == "__main__":
    unittest.main()
