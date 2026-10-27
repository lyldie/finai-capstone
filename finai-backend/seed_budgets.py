"""Preview or seed Jan-Oct 2026 monthly and 2026 annual demo budgets.

Read-only unless --apply is passed. Spending is derived from transactions; this
script does not set `spent` and does not trigger notification/email workflows.
"""

import argparse
import os
from datetime import datetime
from pathlib import Path

from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient, UpdateOne

load_dotenv(Path(__file__).with_name(".env"))
USER_ID = os.getenv("DEMO_USER_ID", "6adff6c40dd00daaec95d9cc")
SEED_TAG = "finai-defense-demo-2026-01-10-v1"
LIMITS = {
    "Groceries": 7000,
    "Food": 3000,
    "Transportation": 3000,
    "Utilities": 5000,
    "Rent": 6000,
    "Leisure": 2000,
    "Health": 1500,
}
MONTHS = tuple(f"2026-{month:02d}" for month in range(1, 11))
ALIASES = {"transportation": ("transport", "transpo", "commute", "transportation & fuel"), "leisure": ("entertainment", "dining", "food and dining"),
           "health": ("medical", "healthcare"), "groceries": ("food", "food and groceries"),
           "rent": ("housing",), "utilities": ("bills",)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="upsert the previewed budgets")
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
        expense_categories = {str(c.get("name", "")).strip().lower(): c for c in cats
                              if str(c.get("type", "")).strip().lower() == "expense" and c.get("name")}
        print("Active expense categories available to this user: " + ", ".join(
            str(c.get("name", "?")) for c in cats if str(c.get("type", "")).strip().lower() == "expense"
        ))
        prepared, missing = [], []
        now = datetime.utcnow()
        for name, amount in LIMITS.items():
            category = expense_categories.get(name.lower())
            if not category:
                category = next((expense_categories[a] for a in ALIASES.get(name.lower(), ()) if a in expense_categories), None)
            if not category:
                missing.append(name)
                continue
            category_id = str(category["_id"])
            for month in MONTHS:
                key = {"user_id": USER_ID, "category_id": category_id, "period_type": "monthly", "period_key": month}
                document = {**key, "amount": float(amount), "month_year": None, "rollover_enabled": False,
                            "demo_seed_tag": SEED_TAG, "updated_at": now}
                prepared.append((key, document))
            annual_key = {"user_id": USER_ID, "category_id": category_id, "period_type": "annual", "period_key": "2026"}
            annual_doc = {**annual_key, "amount": float(amount * 12), "month_year": None, "rollover_enabled": False,
                          "demo_seed_tag": SEED_TAG, "updated_at": now}
            prepared.append((annual_key, annual_doc))

        print(f"Target user: {USER_ID}")
        print(f"Prepared {len(prepared)} budget records: Jan-Oct monthly budgets plus 2026 annual budgets.")
        print("Monthly limits (PHP): " + ", ".join(f"{name} {value:,.0f}" for name, value in LIMITS.items()))
        print("Annual limits are monthly limits multiplied by 12.")
        if missing:
            print("Skipped categories not found as active expense categories: " + ", ".join(missing))
        if not args.apply:
            print("Preview only. Add --apply to upsert these records. Existing untagged budgets are not modified.")
            return

        operations = [UpdateOne(key, {"$set": doc, "$setOnInsert": {"created_at": now}}, upsert=True)
                      for key, doc in prepared]
        if operations:
            result = db.budgets.bulk_write(operations, ordered=True)
            print(f"Budget seed complete: {result.upserted_count} inserted, {result.modified_count} updated.")
        else:
            print("No budgets were written because no configured categories were available.")
    finally:
        client.close()


if __name__ == "__main__":
    main()
