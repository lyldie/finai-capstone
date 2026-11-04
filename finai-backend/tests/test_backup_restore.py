"""Regression checks for backup preservation of recurring budget settings."""

import os
import sys
import unittest
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017/finai_test")
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from bson import ObjectId
from fastapi import HTTPException
from routers import export as export_router


class Cursor:
    def __init__(self, rows):
        self.rows = deepcopy(rows)

    def __aiter__(self):
        async def iterate():
            for row in self.rows:
                yield deepcopy(row)
        return iterate()


class Collection:
    def __init__(self, rows=None):
        self.rows = deepcopy(rows or [])
        self.deleted = 0

    def find(self, query):
        return Cursor([row for row in self.rows if all(row.get(key) == value for key, value in query.items())])

    async def delete_many(self, query, session=None):
        self.deleted += 1
        self.rows = [row for row in self.rows if not all(row.get(key) == value for key, value in query.items())]

    async def insert_many(self, documents, session=None):
        self.rows.extend(deepcopy(documents))


class Session:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    def start_transaction(self):
        return self


class Client:
    async def start_session(self):
        return Session()


class FakeDB:
    def __init__(self):
        self.expenses = Collection()
        self.accounts = Collection()
        self.budgets = Collection()
        self.budget_rules = Collection()
        self.goals = Collection()
        self.client = Client()


def budget_snapshot(category_id, *, rollover=True, kind="fixed"):
    return {
        "category_id": str(category_id), "amount": 500,
        "period_type": "monthly", "period_key": "2026-11",
        "rollover_enabled": rollover, "budget_kind": kind,
    }


class BackupRestoreBudgetTests(unittest.IsolatedAsyncioTestCase):
    async def test_v11_restore_preserves_active_and_inactive_budget_rules(self):
        category_id = ObjectId()
        fake_db = FakeDB()
        payload = {
            "version": "1.1", "transactions": [], "accounts": [], "budgets": [budget_snapshot(category_id)], "goals": [],
            "budget_rules": [{
                "category_id": str(category_id), "period_type": "monthly", "amount": 500,
                "rollover_enabled": True, "budget_kind": "fixed", "is_active": False,
            }],
        }
        with patch.object(export_router, "db", fake_db):
            await export_router.restore_user_data(payload, {"id": "user-1"})

        self.assertEqual(len(fake_db.budget_rules.rows), 1)
        rule = fake_db.budget_rules.rows[0]
        self.assertFalse(rule["is_active"])
        self.assertTrue(rule["rollover_enabled"])
        self.assertEqual(rule["budget_kind"], "fixed")
        self.assertEqual(rule["user_id"], "user-1")

    async def test_legacy_backup_rebuilds_rule_from_latest_budget_snapshot(self):
        category_id = ObjectId()
        older = budget_snapshot(category_id, rollover=False, kind="variable")
        older["period_key"] = "2026-10"
        latest = budget_snapshot(category_id, rollover=True, kind="fixed")
        fake_db = FakeDB()
        payload = {"version": "1.0", "transactions": [], "accounts": [], "budgets": [older, latest], "goals": []}
        with patch.object(export_router, "db", fake_db):
            await export_router.restore_user_data(payload, {"id": "user-1"})

        self.assertEqual(len(fake_db.budget_rules.rows), 1)
        self.assertTrue(fake_db.budget_rules.rows[0]["rollover_enabled"])
        self.assertEqual(fake_db.budget_rules.rows[0]["budget_kind"], "fixed")
        self.assertTrue(fake_db.budget_rules.rows[0]["is_active"])

    async def test_invalid_budget_rule_is_rejected_before_existing_data_is_touched(self):
        category_id = ObjectId()
        fake_db = FakeDB()
        fake_db.budgets.rows = [{"user_id": "user-1", "amount": 100}]
        payload = {
            "transactions": [], "accounts": [], "budgets": [budget_snapshot(category_id)], "goals": [],
            "budget_rules": [{
                "category_id": str(category_id), "period_type": "nonsense", "amount": 500,
            }],
        }
        with patch.object(export_router, "db", fake_db):
            with self.assertRaises(HTTPException) as raised:
                await export_router.restore_user_data(payload, {"id": "user-1"})

        self.assertEqual(raised.exception.status_code, 422)
        self.assertEqual(fake_db.budgets.deleted, 0)
        self.assertEqual(fake_db.budgets.rows[0]["amount"], 100)


if __name__ == "__main__":
    unittest.main()
