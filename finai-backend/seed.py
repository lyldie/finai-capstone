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
USER_ID = os.getenv("DEMO_USER_ID", "6adff6c40dd00daaec95d9cc")
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
    "transportation": ("transport", "transpo", "commute", "transportation & fuel"),
    "leisure": ("entertainment", "dining", "food and dining"),
    "health": ("medical", "healthcare"),
    "groceries": ("food", "food and groceries"),
    "rent": ("housing",),
    "utilities": ("bills",),
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="upsert the previewed records")
    args = parser.parse_args()
    mongo_url = os.getenv("MONGO_URL")
    if not mongo_url:
        raise SystemExit("Set MONGO_URL in finai-backend/.env. Do not put credentials in this script.")
    if not ObjectId.is_valid(USER_ID):
        raise SystemExit("DEMO_USER_ID must be a valid MongoDB ObjectId string.")

    client = MongoClient(mongo_url, serverSelectionTimeoutMS=10000)
    try:
        client.admin.command("ping")
        db = client["FinAI_DB"]
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
            raise SystemExit("An active Income category named Salary is required before seeding.")
        account = db.accounts.find_one({
            "user_id": USER_ID, "account_role": "user", "is_archived": {"$ne": True},
            "name": {"$regex": "^Cash$", "$options": "i"},
        })
        if not account:
            raise SystemExit("No personal Cash account found for the demo user. Create one in the app, then rerun this seed preview.")

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
        def add(date_text, kind, cat, amount, title, key, goal_contribution=False):
            doc = {
                "user_id": USER_ID, "amount": float(amount),
                "category_id": str(cat["_id"]) if cat else None,
                "category": "Goal Contribution" if goal_contribution else cat["name"],
                "title": title, "item_name": title,
                "note": title, "type": kind, "account": account["name"],
                "account_id": str(account["_id"]), "to_account": None, "to_account_id": None,
                "date": date_text, "created_at": datetime.strptime(date_text, "%Y-%m-%d"),
                "demo_seed_tag": SEED_TAG, "demo_seed_key": f"{SEED_TAG}:{key}",
            }
            if goal_contribution:
                doc["goal_id"] = str(goal_id)
            docs.append(doc)

        for month in range(1, 11):
            for day in (1, 15):
                d = f"2026-{month:02d}-{day:02d}"
                add(d, "Income", salary, 25000, "Salary deposit", f"salary-{d}")
            for day, name, amount, note in MONTHLY_EXPENSES:
                if month == 10 and day > 27:
                    continue
                cat = category("expense", name)
                if not cat:
                    skipped.append(name)
                    continue
                d = f"2026-{month:02d}-{day:02d}"
                add(d, "Expense", cat, amount, note, f"expense-{d}-{name}")
            contribution_day = 26 if month == 10 else 28
            d = f"2026-{month:02d}-{contribution_day:02d}"
            add(d, "Contribution", None, MONTHLY_CONTRIBUTION,
                f"Contribution for {GOAL_NAME}", f"goal-{d}", goal_contribution=True)

        print(f"Target user: {USER_ID}; account: {account['name']}")
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
