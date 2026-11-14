"""Preview or seed Jan 1-Nov 5, 2026 transactions and demo goals for the defense demo.

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
GOAL_TARGET = 50000.0
MONTHLY_CONTRIBUTION = 4000.0
SECOND_GOAL_NAME = "Emergency Fund"
SECOND_GOAL_TARGET = 30000.0
SECOND_MONTHLY_CONTRIBUTION = 1500.0

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
    "shopping": ("accessories", "apparel"),
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
    11: {"spending_factor": 1.00, "extra_income": 0, "extras": [
        ("Leisure", 450, 2, "Coffee and recreation"),
        ("Shopping", 700, 4, "Personal essentials"),
    ]},
}

SCHEDULED_BILLS = [
    ("Meralco", "Utilities", 1800, 7),
    ("Maynilad", "Utilities", 500, 12),
]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="upsert the previewed records")
    parser.add_argument("--replace-all-user-transactions", action="store_true", help="replace every transaction for this demo user, including unseeded records")
    parser.add_argument("--expected-email", required=True, help="refuse to run unless DEMO_USER_ID matches this email")
    parser.add_argument("--skip-bills", action="store_true", help="leave scheduled bills and occurrences untouched")
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
        if str(target_user.get("email", "")).strip().casefold() != args.expected_email.strip().casefold():
            raise SystemExit("DEMO_USER_ID does not match --expected-email; refusing to seed or clear data.")
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

        seeded_goal_specs = [
            ("travel", GOAL_NAME, GOAL_TARGET, MONTHLY_CONTRIBUTION, "palawan", "2026-12-31"),
            ("emergency", SECOND_GOAL_NAME, SECOND_GOAL_TARGET, SECOND_MONTHLY_CONTRIBUTION, "gadgets", "2027-05-31"),
        ]
        goal_types = list(db.goal_types.find({"is_archived": {"$ne": True}}))
        print("Active goal types available to this user: " + ", ".join(str(g.get("name", "?")) for g in goal_types))
        goals_by_tag = {}
        for goal_kind, goal_name, target, contribution, stable_key, target_date in seeded_goal_specs:
            existing_goal = db.goals.find_one({
                "user_id": USER_ID, "demo_seed_tag": SEED_TAG,
                "$or": [
                    {"demo_seed_key": f"{SEED_TAG}:goal:{stable_key}"},
                    {"target_name": goal_name},
                ],
            })
            existing_named_goal = db.goals.find_one({"user_id": USER_ID, "target_name": goal_name, "demo_seed_tag": {"$ne": SEED_TAG}})
            if existing_named_goal:
                raise SystemExit(f"A non-seeded {goal_name} goal already exists. Review it first; refusing to duplicate or overwrite it.")
            goal_type_aliases = {
                "travel": {"travel"},
                "emergency": {"emergency fund", "savings", "rainy day"},
            }
            goal_type = next((g for g in goal_types if str(g.get("name", "")).strip().lower() in goal_type_aliases[goal_kind]), None)
            if not goal_type:
                fallback_types = {
                    "travel": {"vacation", "other"},
                    "emergency": {"savings", "other"},
                }
                goal_type = next((g for g in goal_types if str(g.get("name", "")).strip().lower() in fallback_types[goal_kind]), None)
            if not goal_type:
                raise SystemExit(f"No suitable active goal type exists for {goal_kind.title()}; add or choose an appropriate preset before seeding.")
            goal_id = existing_goal["_id"] if existing_goal else ObjectId(hashlib.sha256(f"{USER_ID}:{SEED_TAG}:goal:{stable_key}".encode()).hexdigest()[:24])
            goals_by_tag[stable_key] = {
                "id": goal_id, "type": goal_type, "name": goal_name, "target": target,
                "contribution": contribution, "key": stable_key, "target_date": target_date,
            }
        now = datetime.utcnow()

        docs, skipped = [], []
        def add(date_text, kind, cat, amount, title, key, goal_id=None, transaction_account=None):
            transaction_account = transaction_account or primary_account
            doc = {
                "user_id": USER_ID, "amount": float(amount),
                "category_id": str(cat["_id"]) if cat else None,
                "category": "Goal Contribution" if goal_id else cat["name"],
                "title": title, "item_name": title,
                "note": title, "type": kind, "account": transaction_account["name"],
                "account_id": str(transaction_account["_id"]), "to_account": None, "to_account_id": None,
                "date": date_text, "created_at": datetime.strptime(date_text, "%Y-%m-%d"),
                "demo_seed_tag": SEED_TAG, "demo_seed_key": f"{SEED_TAG}:{key}",
            }
            if goal_id:
                doc["goal_id"] = str(goal_id)
            docs.append(doc)

        for month in range(1, 12):
            cash_flow = MONTHLY_CASH_FLOW[month]
            for day, amount, title, account in (
                (1, 30000, "Salary allocation", wallet_account),
                (15, 12000, "Salary allocation", cash_account),
            ):
                if month == 11 and day > 5:
                    continue
                d = f"2026-{month:02d}-{day:02d}"
                add(d, "Income", salary, amount, title, f"salary-{d}", transaction_account=account)
            if cash_flow["extra_income"] and side_income:
                d = f"2026-{month:02d}-20"
                add(d, "Income", side_income, cash_flow["extra_income"], "Occasional side income",
                    f"extra-income-{d}", transaction_account=wallet_account)
            for day, name, amount, note in MONTHLY_EXPENSES:
                # The demo user will record November rent through the bill flow.
                if month == 11 and name.lower() == "rent":
                    continue
                if month == 11 and day > 5:
                    continue
                cat = category("expense", name)
                if not cat:
                    skipped.append(name)
                    continue
                d = f"2026-{month:02d}-{day:02d}"
                if name.lower() == "rent":
                    # The demo user's actual November rent was PHP 12,500.
                    adjusted_amount = 12500 if month == 11 else amount
                else:
                    adjusted_amount = int(round(amount * cash_flow["spending_factor"] / 10) * 10)
                add(d, "Expense", cat, adjusted_amount, note, f"expense-{d}-{name}",
                    transaction_account=expense_account(name))
            if month == 11:
                # A recent, ordinary grocery purchase gives Spending Activity a
                # current-week starting point before the live demo expense.
                groceries = category("expense", "Groceries")
                if groceries:
                    add("2026-11-03", "Expense", groceries, 1500, "Weekly groceries",
                        "expense-2026-11-03-Groceries-demo-baseline",
                        transaction_account=expense_account("Groceries"))
                else:
                    skipped.append("Groceries (Nov 3 Spending Activity baseline)")
            for name, amount, day, note in cash_flow["extras"]:
                if month == 11 and day > 5:
                    continue
                cat = category("expense", name)
                if not cat:
                    skipped.append(name)
                    continue
                d = f"2026-{month:02d}-{day:02d}"
                add(d, "Expense", cat, amount, note, f"extra-expense-{d}-{name}",
                    transaction_account=expense_account(name))
            contribution_day = 3 if month == 11 else (26 if month == 10 else 28)
            d = f"2026-{month:02d}-{contribution_day:02d}"
            travel_goal = goals_by_tag["palawan"]
            add(d, "Contribution", None, travel_goal["contribution"],
                f"Contribution for {travel_goal['name']}", f"goal-{d}", goal_id=travel_goal["id"],
                transaction_account=wallet_account)
            second_goal = goals_by_tag["gadgets"]
            add(d, "Contribution", None, second_goal["contribution"],
                f"Contribution for {second_goal['name']}", f"goal-gadgets-{d}", goal_id=second_goal["id"],
                transaction_account=wallet_account)

        print(f"Target database: {STAGING_DB_NAME}")
        used_accounts = sorted({d["account"] for d in docs})
        print(f"Target user: {target_user.get('name', 'Demo user')} ({target_user.get('email', 'email hidden')}); accounts: {', '.join(used_accounts)}")
        print(f"Prepared {len(docs)} tagged transactions from Jan 1 through Nov 5, 2026 (rent seeded through October only).")
        print("Demo persona: one urban working adult with PHP 42,000 regular monthly income, shared household costs, and occasional side income.")
        print("Palawan Trip goal: PHP 50,000 target by Dec 31; PHP 44,000 seeded progress from eleven PHP 4,000 contributions.")
        print("Emergency Fund goal: PHP 30,000 target by May 31, 2027; PHP 16,500 seeded progress from eleven PHP 1,500 contributions.")
        print("Goal types used: " + ", ".join(f"{goal['name']} -> {goal['type']['name']}" for goal in goals_by_tag.values()))
        print("Spending Activity demo: Nov 3 includes PHP 1,500 groceries. Record a larger Groceries expense dated today (PH time) to test the alert; it needs at least 3 comparable prior weeks and both the 30% and PHP 150 increase thresholds.")
        for month in range(1, 12):
            prefix = f"2026-{month:02d}-"
            rows = [r for r in docs if r["date"].startswith(prefix)]
            inc = sum(r["amount"] for r in rows if r["type"] == "Income")
            exp = sum(r["amount"] for r in rows if r["type"] == "Expense")
            print(f"  2026-{month:02d}: income PHP {inc:,.0f}; expenses PHP {exp:,.0f}; net before goal contributions PHP {inc-exp:,.0f}")
        if skipped:
            print("Missing expense categories (corresponding rows omitted): " + ", ".join(sorted(set(skipped))))
        total_existing_count = db.expenses.count_documents({"user_id": USER_ID})
        old_seed_count = db.expenses.count_documents({"user_id": USER_ID, "demo_seed_tag": SEED_TAG})
        print(f"Existing transactions for this user: {total_existing_count}; tagged by this seed: {old_seed_count}; untagged: {total_existing_count - old_seed_count}.")
        active_bill_rows = list(db.fixed_bills.find(
            {"user_id": USER_ID, "is_active": True}, {"name": 1, "due_day": 1, "amount": 1}
        ))
        active_bill_descriptions = [
            f"{b.get('name', 'Bill')} (due day {b.get('due_day', '?')}, PHP {float(b.get('amount', 0) or 0):,.2f})"
            for b in active_bill_rows
        ]
        print("Existing active bills (not changed by this run): " + (", ".join(active_bill_descriptions) if active_bill_descriptions else "none"))
        print(f"Existing rows tagged by this seed version: {old_seed_count}")
        planned_transaction_keys = {d["demo_seed_key"] for d in docs}
        existing_seed_rows = list(db.expenses.find(
            {"user_id": USER_ID, "demo_seed_tag": SEED_TAG}, {"demo_seed_key": 1}
        ))
        stale_seed_rows = sum(1 for row in existing_seed_rows if row.get("demo_seed_key") not in planned_transaction_keys)
        if args.replace_all_user_transactions:
            print(f"On --apply --replace-all-user-transactions: all {total_existing_count} existing transactions, including untagged rows, will be deleted, then {len(docs)} prepared transactions will be inserted.")
        else:
            print(f"On --apply: {len(docs)} tagged transactions will be upserted; {stale_seed_rows} obsolete rows with this seed tag will be deleted. Untagged transactions are untouched.")
        bill_docs = []
        active_bills = [] if args.skip_bills else list(db.fixed_bills.find({"user_id": USER_ID, "is_active": True}))
        active_unseeded_bills = {
            str(b.get("name", "")).strip().casefold(): b
            for b in active_bills if b.get("demo_seed_tag") != SEED_TAG
        }
        skipped_bills = []
        for name, category_name, amount, due_day in ([] if args.skip_bills else SCHEDULED_BILLS):
            bill_category = category("expense", category_name) or category("expense", "Bills")
            if not bill_category:
                skipped_bills.append(f"{name} (missing {category_name}/Bills category)")
                continue
            if name.casefold() in active_unseeded_bills:
                existing = active_unseeded_bills[name.casefold()]
                skipped_bills.append(
                    f"{name} (existing unseeded bill kept unchanged: PHP {float(existing.get('amount', 0) or 0):,.2f}, "
                    f"category {existing.get('category', 'unknown')}, due day {existing.get('due_day', 'unknown')})"
                )
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
        print("Scheduled bills will be left untouched." if args.skip_bills else f"Prepared {len(bill_docs)} scheduled monthly bills: " + ", ".join(b["name"] for b in bill_docs))
        if skipped_bills:
            print("Skipped scheduled bills: " + "; ".join(skipped_bills))
        if not args.apply:
            print("Preview only. Add --apply to apply the seed. Use --replace-all-user-transactions to replace every existing transaction, including unseeded records.")
            return

        if args.replace_all_user_transactions:
            cleared = db.expenses.delete_many({"user_id": USER_ID}).deleted_count
            print(f"Cleared {cleared} existing transactions for the verified demo user.")

        keys = [d["demo_seed_key"] for d in docs]
        operations = [UpdateOne({"user_id": USER_ID, "demo_seed_key": d["demo_seed_key"]}, {"$set": d}, upsert=True) for d in docs]
        result = db.expenses.bulk_write(operations, ordered=True)
        # Remove only stale records written by this exact seed version.
        deleted = db.expenses.delete_many({"user_id": USER_ID, "demo_seed_tag": SEED_TAG, "demo_seed_key": {"$nin": keys}}).deleted_count
        for goal in goals_by_tag.values():
            goal_doc = {
                "user_id": USER_ID, "goal_type_id": str(goal["type"]["_id"]), "goal_type": goal["type"]["name"],
                "target_name": goal["name"], "target_amount": goal["target"],
                "current_savings": goal["contribution"] * 11, "target_date": goal["target_date"],
                "is_archived": False, "demo_seed_tag": SEED_TAG,
                "demo_seed_key": f"{SEED_TAG}:goal:{goal['key']}",
                "created_at": datetime(2026, 1, 1), "updated_at": now,
            }
            db.goals.update_one({"_id": goal["id"], "user_id": USER_ID},
                                {"$set": goal_doc, "$setOnInsert": {"_id": goal["id"]}}, upsert=True)
        for bill in bill_docs:
            bill_fields = {key: value for key, value in bill.items() if key != "_id"}
            db.fixed_bills.update_one(
                {"_id": bill["_id"], "user_id": USER_ID},
                {"$set": bill_fields, "$setOnInsert": {"_id": bill["_id"]}},
                upsert=True,
            )
        if not args.skip_bills:
            stale_bills = [b["_id"] for b in active_bills if b.get("demo_seed_tag") == SEED_TAG and b.get("_id") not in {x["_id"] for x in bill_docs}]
            if stale_bills:
                db.fixed_bills.update_many({"_id": {"$in": stale_bills}, "user_id": USER_ID}, {"$set": {"is_active": False, "updated_at": datetime.utcnow()}})
        print(f"Seed complete: {result.upserted_count} transactions inserted, {result.modified_count} updated, {deleted} stale tagged rows removed; {len(goals_by_tag)} goals updated; bills left untouched={args.skip_bills}.")
    finally:
        client.close()


if __name__ == "__main__":
    main()
