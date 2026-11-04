"""Preview or seed Jan-Oct 2026 transactions and a Palawan goal for the defense demo.

Read-only unless --apply is passed. Requires MONGO_URL in this folder's .env.
This writes demo records directly and does not trigger notification/email workflows.
"""

import argparse
import hashlib
import os
from datetime import datetime
from pathlib import Path

from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient, UpdateOne

load_dotenv(Path(__file__).with_name(".env"))
STAGING_DB_NAME = "FinAI_Staging"
USER_ID = os.getenv("DEMO_USER_ID", "").strip()
SEED_TAG = "finai-defense-demo-2026-01-10-v1"
GOAL_NAME = "Palawan Trip"
GOAL_TARGET = 48000.0
MONTHLY_CONTRIBUTION = 4000.0

# One urban working adult records personal finances and their share of housing
# and household bills. This is an illustrative individual persona, not a claim
# that one salary defines the middle class for every household or location.
MONTHLY_EXPENSES = [
    (3, "Rent", 12000, "Monthly rent share"),
    (5, "Groceries", 1500, "Weekly groceries"),
    (7, "Utilities", 1800, "Electricity share"),
    (9, "Transportation", 600, "Commute and transport"),
    (10, "Food", 350, "Lunch and snacks"),
    (12, "Utilities", 500, "Water share"),
    (14, "Groceries", 1500, "Weekly groceries"),
    (16, "Transportation", 600, "Commute and transport"),
    (17, "Utilities", 1500, "Home internet share"),
    (18, "Food", 450, "Meal with friends"),
    (20, "Health", 1000, "Medicine and pharmacy"),
    (21, "Utilities", 800, "Mobile plan"),
    (22, "Transportation", 600, "Commute and transport"),
    (23, "Groceries", 1500, "Weekly groceries"),
    (25, "Leisure", 1200, "Movie or recreation"),
    (26, "Shopping", 800, "Personal essentials"),
    (27, "Transportation", 600, "Commute and transport"),
    (28, "Groceries", 1500, "End-of-month groceries"),
]
ALIASES = {
    "allowance": ("student allowance", "family allowance"),
    "salary": ("wages", "payroll"),
    "part-time work": ("part time work", "part-time income", "freelance", "side income"),
    "transportation": ("transport", "transpo", "commute", "transportation & fuel"),
    "leisure": ("entertainment", "dining", "food and dining"),
    "health": ("medical", "healthcare"),
    "groceries": ("food", "food and groceries"),
    "rent": ("housing", "bills"),
    "utilities": ("bills",),
}

# Salary is steady; seasonal expenses and occasional side income vary personal
# cash flow enough to exercise budgets, forecasts, and Plan Ahead.
MONTHLY_CASH_FLOW = {
    1:  {"spending_factor": 0.94, "extra_income": 0,    "extras": []},
    2:  {"spending_factor": 1.04, "extra_income": 0,    "extras": [("Leisure", 900, 21, "Birthday outing")]},
    3:  {"spending_factor": 1.02, "extra_income": 2000, "extras": [("Health", 1200, 18, "Dental checkup and medicine")]},
    4:  {"spending_factor": 1.08, "extra_income": 0,    "extras": [("Transportation", 900, 22, "Additional commute costs")]},
    5:  {"spending_factor": 0.96, "extra_income": 3000, "extras": [("Groceries", 1000, 19, "Groceries for a small gathering")]},
    6:  {"spending_factor": 1.06, "extra_income": 0,    "extras": [("Utilities", 900, 16, "Household repair contribution")]},
    7:  {"spending_factor": 0.93, "extra_income": 1800, "extras": [("Leisure", 1100, 24, "Weekend outing")]},
    8:  {"spending_factor": 1.09, "extra_income": 0,    "extras": [("Health", 850, 12, "Medicine and pharmacy supplies")]},
    9:  {"spending_factor": 1.01, "extra_income": 4000, "extras": [("Transportation", 700, 20, "Additional commute costs")]},
    10: {"spending_factor": 1.10, "extra_income": 1500, "extras": [("Leisure", 1300, 18, "Personal celebration")]},
}

SCHEDULED_BILLS = [
    ("Rent share", "Rent", 12000, 3),
    ("Electricity share", "Utilities", 1800, 7),
    ("Water share", "Utilities", 500, 12),
    ("Home internet", "Utilities", 1500, 17),
    ("Mobile plan", "Utilities", 800, 21),
]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="upsert the previewed records")
    args = parser.parse_args()
    mongo_url = os.getenv("MONGO_URL")
    if not mongo_url:
        raise SystemExit("Set MONGO_URL in finai-backend/.env. Do not put credentials in this script.")
    if not USER_ID:
        raise SystemExit("Set DEMO_USER_ID to the staging demo user's MongoDB _id before running this script.")
    if not ObjectId.is_valid(USER_ID):
        raise SystemExit("DEMO_USER_ID must be a valid MongoDB ObjectId string.")

    client = MongoClient(mongo_url, serverSelectionTimeoutMS=10000)
    try:
        client.admin.command("ping")
        db = client[STAGING_DB_NAME]
        target_user = db.users.find_one({"_id": ObjectId(USER_ID)}, {"name": 1, "email": 1, "role": 1})
        if not target_user:
            raise SystemExit(f"No user {USER_ID} exists in {STAGING_DB_NAME}; refusing to seed.")
        if str(target_user.get("role", "user")).lower() != "user":
            raise SystemExit("DEMO_USER_ID must belong to a regular user, not an admin account.")
        cats = list(db.categories.find({
            "is_archived": {"$ne": True},
            "$or": [
                {"category_role": "admin"},
                {"category_role": "user", "user_id": USER_ID},
            ],
        }))
        by_cat = {(str(c.get("type", "")).strip().lower(), str(c.get("name", "")).strip().lower()): c for c in cats}
        print("Active categories available to this user: " + ", ".join(
            f"{c.get('type', '?')}:{c.get('name', '?')}" for c in cats
        ))

        def category(kind, name):
            found = by_cat.get((kind.lower(), name.lower()))
            for alias in ALIASES.get(name.lower(), ()):
                found = found or by_cat.get((kind.lower(), alias))
            return found

        salary = category("income", "Salary")
        if not salary:
            raise SystemExit("Add an active Income category named Salary before previewing this seed.")
        side_income = category("income", "Others") or category("income", "Business")

        personal_accounts = list(db.accounts.find({
            "user_id": USER_ID, "account_role": "user", "is_archived": {"$ne": True},
        }))
        print("Active personal accounts matched for this demo user: " + (
            ", ".join(repr(str(a.get("name", ""))) for a in personal_accounts) or "(none)"
        ))
        account_by_name = {str(a.get("name", "")).strip().lower(): a for a in personal_accounts}
        primary_account = next((account_by_name[name] for name in ("cash", "gcash", "wallet", "e-wallet", "ewallet") if name in account_by_name), None)
        if not primary_account:
            raise SystemExit("Create a personal Cash or GCash account for the demo user, then rerun this seed preview.")
        wallet_account = next((account_by_name[name] for name in ("gcash", "wallet", "e-wallet", "ewallet") if name in account_by_name), primary_account)
        cash_account = account_by_name.get("cash", primary_account)

        def expense_account(category_name):
            return wallet_account if category_name.lower() in {"rent", "groceries", "utilities"} else cash_account

        goal = db.goals.find_one({"user_id": USER_ID, "target_name": GOAL_NAME, "demo_seed_tag": SEED_TAG})
        existing_named_goal = db.goals.find_one({"user_id": USER_ID, "target_name": GOAL_NAME, "demo_seed_tag": {"$ne": SEED_TAG}})
        if existing_named_goal:
            raise SystemExit("A non-seeded Palawan Trip goal already exists. Review it first; refusing to duplicate or overwrite it.")
        goal_type = next((g for g in db.goal_types.find({"is_archived": {"$ne": True}})
                          if str(g.get("name", "")).strip().lower() in {"travel", "vacation", "other"}), None)
        if not goal_type:
            raise SystemExit("An active Travel, Vacation, or Other goal type is required.")
        goal_id = goal["_id"] if goal else ObjectId(hashlib.sha256(f"{USER_ID}:{SEED_TAG}:palawan".encode()).hexdigest()[:24])
        now = datetime.utcnow()
        goal_doc = {
            "user_id": USER_ID, "goal_type_id": str(goal_type["_id"]), "goal_type": goal_type["name"],
            "target_name": GOAL_NAME, "target_amount": GOAL_TARGET,
            "current_savings": MONTHLY_CONTRIBUTION * 10, "target_date": "2026-12-31",
            "is_archived": False, "demo_seed_tag": SEED_TAG,
            "created_at": datetime(2026, 1, 1), "updated_at": now,
        }

        docs, skipped = [], []
        def add(date_text, kind, cat, amount, title, key, goal_contribution=False, transaction_account=None):
            transaction_account = transaction_account or primary_account
            doc = {
                "user_id": USER_ID, "amount": float(amount),
                "category_id": str(cat["_id"]) if cat else None,
                "category": "Goal Contribution" if goal_contribution else cat["name"],
                "title": title, "item_name": title,
                "note": title, "type": kind, "account": transaction_account["name"],
                "account_id": str(transaction_account["_id"]), "to_account": None, "to_account_id": None,
                "date": date_text, "created_at": datetime.strptime(date_text, "%Y-%m-%d"),
                "demo_seed_tag": SEED_TAG, "demo_seed_key": f"{SEED_TAG}:{key}",
            }
            if goal_contribution:
                doc["goal_id"] = str(goal_id)
            docs.append(doc)

        for month in range(1, 11):
            cash_flow = MONTHLY_CASH_FLOW[month]
            for day, amount, title, account in (
                (1, 30000, "Salary allocation", wallet_account),
                (15, 12000, "Salary allocation", cash_account),
            ):
                d = f"2026-{month:02d}-{day:02d}"
                add(d, "Income", salary, amount, title, f"salary-{d}", transaction_account=account)
            if cash_flow["extra_income"] and side_income:
                d = f"2026-{month:02d}-20"
                add(d, "Income", side_income, cash_flow["extra_income"], "Occasional side income",
                    f"extra-income-{d}", transaction_account=wallet_account)
            for day, name, amount, note in MONTHLY_EXPENSES:
                if month == 10 and day > 27:
                    continue
                cat = category("expense", name)
                if not cat:
                    skipped.append(name)
                    continue
                d = f"2026-{month:02d}-{day:02d}"
                adjusted_amount = amount if name.lower() == "rent" else int(round(amount * cash_flow["spending_factor"] / 10) * 10)
                add(d, "Expense", cat, adjusted_amount, note, f"expense-{d}-{name}",
                    transaction_account=expense_account(name))
            for name, amount, day, note in cash_flow["extras"]:
                cat = category("expense", name)
                if not cat:
                    skipped.append(name)
                    continue
                d = f"2026-{month:02d}-{day:02d}"
                add(d, "Expense", cat, amount, note, f"extra-expense-{d}-{name}",
                    transaction_account=expense_account(name))
            contribution_day = 26 if month == 10 else 28
            d = f"2026-{month:02d}-{contribution_day:02d}"
            add(d, "Contribution", None, MONTHLY_CONTRIBUTION,
                f"Contribution for {GOAL_NAME}", f"goal-{d}", goal_contribution=True,
                transaction_account=wallet_account)

        print(f"Target database: {STAGING_DB_NAME}")
        used_accounts = sorted({d["account"] for d in docs})
        print(f"Target user: {target_user.get('name', USER_ID)} ({USER_ID}); accounts: {', '.join(used_accounts)}")
        print(f"Prepared {len(docs)} tagged transactions from Jan 1 through Oct 27, 2026.")
        print("Demo persona: one urban working adult; PHP 42,000 regular monthly salary, shares housing and household bills, plus occasional side income.")
        print("Palawan goal: PHP 48,000 target by Dec 31; PHP 40,000 saved from ten PHP 4,000 contributions; PHP 8,000 remaining.")
        for month in range(1, 11):
            prefix = f"2026-{month:02d}-"
            rows = [r for r in docs if r["date"].startswith(prefix)]
            inc = sum(r["amount"] for r in rows if r["type"] == "Income")
            exp = sum(r["amount"] for r in rows if r["type"] == "Expense")
            print(f"  2026-{month:02d}: income PHP {inc:,.0f}; expenses PHP {exp:,.0f}; net before goal contributions PHP {inc-exp:,.0f}")
        if skipped:
            print("Missing expense categories (corresponding rows omitted): " + ", ".join(sorted(set(skipped))))
        old_seed_count = db.expenses.count_documents({"user_id": USER_ID, "demo_seed_tag": SEED_TAG})
        print(f"Existing rows tagged by this seed version: {old_seed_count}")
        bill_docs = []
        active_bills = list(db.fixed_bills.find({"user_id": USER_ID, "is_active": True}))
        active_bill_names = {str(b.get("name", "")).strip().casefold() for b in active_bills if b.get("demo_seed_tag") != SEED_TAG}
        skipped_bills = []
        for name, category_name, amount, due_day in SCHEDULED_BILLS:
            bill_category = category("expense", category_name) or category("expense", "Bills")
            if not bill_category:
                skipped_bills.append(f"{name} (missing {category_name}/Bills category)")
                continue
            if name.casefold() in active_bill_names:
                skipped_bills.append(f"{name} (an unseeded active bill with this name already exists)")
                continue
            key = f"{SEED_TAG}:bill:{name.casefold().replace(' ', '-') }"
            bill_id = ObjectId(hashlib.sha256(f"{USER_ID}:{key}".encode()).hexdigest()[:24])
            bill_docs.append({
                "_id": bill_id, "user_id": USER_ID, "name": name,
                "category_id": str(bill_category["_id"]), "category": bill_category["name"],
                "amount": float(amount), "due_day": due_day, "is_active": True,
                "demo_seed_tag": SEED_TAG, "demo_seed_key": key,
                "created_at": datetime(2026, 1, 1), "updated_at": datetime.utcnow(),
            })
        print(f"Prepared {len(bill_docs)} scheduled monthly bills: " + ", ".join(b["name"] for b in bill_docs))
        if skipped_bills:
            print("Skipped scheduled bills: " + "; ".join(skipped_bills))
        if not args.apply:
            print("Preview only. Add --apply to upsert. No existing untagged transactions, bills, or goals will be deleted or changed.")
            return

        keys = [d["demo_seed_key"] for d in docs]
        operations = [UpdateOne({"user_id": USER_ID, "demo_seed_key": d["demo_seed_key"]}, {"$set": d}, upsert=True) for d in docs]
        result = db.expenses.bulk_write(operations, ordered=True)
        # Remove only stale records written by this exact seed version.
        deleted = db.expenses.delete_many({"user_id": USER_ID, "demo_seed_tag": SEED_TAG, "demo_seed_key": {"$nin": keys}}).deleted_count
        db.goals.update_one({"_id": goal_id, "user_id": USER_ID},
                            {"$set": goal_doc, "$setOnInsert": {"_id": goal_id}}, upsert=True)
        for bill in bill_docs:
            bill_fields = {key: value for key, value in bill.items() if key != "_id"}
            db.fixed_bills.update_one(
                {"_id": bill["_id"], "user_id": USER_ID},
                {"$set": bill_fields, "$setOnInsert": {"_id": bill["_id"]}},
                upsert=True,
            )
        stale_bills = [b["_id"] for b in active_bills if b.get("demo_seed_tag") == SEED_TAG and b.get("_id") not in {x["_id"] for x in bill_docs}]
        if stale_bills:
            db.fixed_bills.update_many({"_id": {"$in": stale_bills}, "user_id": USER_ID}, {"$set": {"is_active": False, "updated_at": datetime.utcnow()}})
        print(f"Seed complete: {result.upserted_count} transactions inserted, {result.modified_count} updated, {deleted} stale tagged rows removed; Palawan goal and {len(bill_docs)} scheduled bills upserted.")
    finally:
        client.close()


if __name__ == "__main__":
    main()
