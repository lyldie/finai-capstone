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
GOAL_TARGET = 36000.0
MONTHLY_CONTRIBUTION = 3000.0

# Plausible recurring income and household expenses. October includes records through Oct 27.
MONTHLY_EXPENSES = [
    (3, "Rent", 6000, "Monthly rent contribution"),
    (5, "Groceries", 1850, "Weekly groceries"),
    (7, "Utilities", 2180, "Electricity and water"),
    (9, "Transportation", 620, "Commute and transport"),
    (11, "Food", 250, "Lunch and meryenda"),
    (17, "Groceries", 2130, "Weekly groceries"),
    (20, "Health", 760, "Pharmacy"),
    (23, "Utilities", 920, "Internet and mobile load"),
    (25, "Leisure", 650, "Movie or recreation"),
    (26, "Food", 450, "Family meal"),
    (27, "Groceries", 1670, "End-of-month groceries"),
]
ALIASES = {
    "allowance": ("student allowance", "family allowance"),
    "part-time work": ("part time work", "part-time income", "freelance", "side income"),
    "transportation": ("transport", "transpo", "commute", "transportation & fuel"),
    "leisure": ("entertainment", "dining", "food and dining"),
    "health": ("medical", "healthcare"),
    "groceries": ("food", "food and groceries"),
    "rent": ("housing",),
    "utilities": ("bills",),
}

# Regular student allowance is steady, while variable spending and occasional
# part-time income make each month's cash flow distinct.
MONTHLY_CASH_FLOW = {
    1:  {"spending_factor": 0.92, "extra_income": 0,    "extras": []},
    2:  {"spending_factor": 1.08, "extra_income": 0,    "extras": [("Leisure", 1500, 21, "Birthday celebration")]},
    3:  {"spending_factor": 1.02, "extra_income": 3500, "extras": [("Health", 2200, 18, "Annual health checkup")]},
    4:  {"spending_factor": 1.14, "extra_income": 0,    "extras": [("Transportation", 1800, 22, "Out-of-town family visit")]},
    5:  {"spending_factor": 0.96, "extra_income": 5000, "extras": [("Groceries", 1700, 19, "Family gathering groceries")]},
    6:  {"spending_factor": 1.05, "extra_income": 0,    "extras": [("Utilities", 2600, 16, "Home appliance repair")]},
    7:  {"spending_factor": 0.91, "extra_income": 2800, "extras": [("Leisure", 1900, 24, "Weekend family outing")]},
    8:  {"spending_factor": 1.17, "extra_income": 0,    "extras": [("Health", 1350, 12, "Medicine and pharmacy supplies")]},
    9:  {"spending_factor": 1.03, "extra_income": 8000, "extras": [("Transportation", 1200, 20, "Additional commute costs")]},
    10: {"spending_factor": 1.11, "extra_income": 3000, "extras": [("Leisure", 2200, 18, "Family celebration")]},
}


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

        allowance = category("income", "Allowance")
        if not allowance:
            raise SystemExit("Add an active Income category named Allowance (or Student Allowance) before previewing this seed.")
        part_time = category("income", "Part-time Work")
        if not part_time:
            raise SystemExit("Add an active Income category named Part-time Work (or Part-time Income/Freelance) before previewing this seed.")

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
            for day in (1, 15):
                d = f"2026-{month:02d}-{day:02d}"
                if str(cash_account["_id"]) == str(wallet_account["_id"]):
                    add(d, "Income", allowance, 12000, "Allowance deposit", f"allowance-{d}", transaction_account=wallet_account)
                else:
                    # Split each allowance between GCash and cash so both seeded
                    # account ledgers have funds for the expenses assigned to them.
                    add(d, "Income", allowance, 9000, "Allowance deposit", f"allowance-gcash-{d}", transaction_account=wallet_account)
                    add(d, "Income", allowance, 3000, "Cash allowance", f"allowance-cash-{d}", transaction_account=cash_account)
            if cash_flow["extra_income"]:
                d = f"2026-{month:02d}-20"
                add(d, "Income", part_time, cash_flow["extra_income"], "Part-time work income",
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
        print("Palawan goal: PHP 36,000 target by Dec 31; PHP 30,000 saved from ten PHP 3,000 contributions; PHP 6,000 remaining.")
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
        if not args.apply:
            print("Preview only. Add --apply to upsert. No existing untagged transactions will be deleted or changed.")
            return

        keys = [d["demo_seed_key"] for d in docs]
        operations = [UpdateOne({"user_id": USER_ID, "demo_seed_key": d["demo_seed_key"]}, {"$set": d}, upsert=True) for d in docs]
        result = db.expenses.bulk_write(operations, ordered=True)
        # Remove only stale records written by this exact seed version.
        deleted = db.expenses.delete_many({"user_id": USER_ID, "demo_seed_tag": SEED_TAG, "demo_seed_key": {"$nin": keys}}).deleted_count
        db.goals.update_one({"_id": goal_id, "user_id": USER_ID},
                            {"$set": goal_doc, "$setOnInsert": {"_id": goal_id}}, upsert=True)
        print(f"Seed complete: {result.upserted_count} inserted, {result.modified_count} updated, {deleted} stale tagged rows removed; Palawan goal upserted.")
    finally:
        client.close()


if __name__ == "__main__":
    main()
