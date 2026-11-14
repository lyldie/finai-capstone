"""Preview or seed Jan-Nov 2026 demo budgets with non-overlapping periods.

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
STAGING_DB_NAME = "FinAI_Staging"
USER_ID = os.getenv("DEMO_USER_ID", "").strip()
SEED_TAG = "finai-defense-demo-2026-01-10-v1"
MONTHLY_LIMITS = {
    "Groceries": 6500,
    "Food": 2500,
    "Transportation": 3500,
    "Utilities": 5500,
    "Rent": 12500,
    "Health": 2000,
    "Others": 1500,
}
# Keep a small number of discretionary categories annual-only. This avoids
# showing both a monthly and annual limit for the same category in Plan Ahead.
ANNUAL_LIMITS = {
    "Leisure": 24000,
    # The active user category is Accessories; the transaction seed maps its
    # Shopping rows to Accessories, so the annual limit covers those expenses.
    "Accessories": 21600,
}
MONTHS = tuple(f"2026-{month:02d}" for month in range(1, 12))
ALIASES = {"transportation": ("transport", "transpo", "commute", "transportation & fuel"), "leisure": ("entertainment", "dining", "food and dining"),
           "health": ("medical", "healthcare"), "shopping": ("accessories", "apparel"),
           "groceries": ("food", "food and groceries"),
           "rent": ("housing", "bills"), "utilities": ("bills",)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-email", required=True, help="Only inspect/seed the demo account matching this email.")
    parser.add_argument("--apply", action="store_true", help="upsert the previewed budgets")
    parser.add_argument(
        "--clean-category-periods", action="store_true",
        help="remove only budgets for configured categories whose period type conflicts with the seed",
    )
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
            raise SystemExit(f"No configured demo user exists in {STAGING_DB_NAME}; refusing to seed.")
        if str(target_user.get("email", "")).strip().lower() != args.expected_email.strip().lower():
            raise SystemExit("Configured demo user email does not match --expected-email; refusing to continue.")
        if str(target_user.get("role", "user")).lower() != "user":
            raise SystemExit("DEMO_USER_ID must belong to a regular user, not an admin account.")
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
        seen_category_ids = set()
        desired_period_by_category = {}
        configured_limits = [
            (name, amount, "monthly") for name, amount in MONTHLY_LIMITS.items()
        ] + [
            (name, amount, "annual") for name, amount in ANNUAL_LIMITS.items()
        ]
        for name, amount, period_type in configured_limits:
            category = expense_categories.get(name.lower())
            if not category:
                category = next((expense_categories[a] for a in ALIASES.get(name.lower(), ()) if a in expense_categories), None)
            if not category:
                missing.append(name)
                continue
            category_id = str(category["_id"])
            if category_id in seen_category_ids:
                missing.append(f"{name} (shares the {category.get('name')} category; skipped duplicate budget)")
                continue
            seen_category_ids.add(category_id)
            desired_period_by_category[category_id] = period_type
            if period_type == "monthly":
                category_months = MONTHS[:10] if name.lower() == "rent" else MONTHS
                for month in category_months:
                    key = {"user_id": USER_ID, "category_id": category_id, "period_type": "monthly", "period_key": month}
                    document = {**key, "amount": float(amount), "month_year": None, "rollover_enabled": False,
                                "demo_seed_tag": SEED_TAG, "updated_at": now}
                    prepared.append((key, document))
            else:
                annual_key = {"user_id": USER_ID, "category_id": category_id, "period_type": "annual", "period_key": "2026"}
                annual_doc = {**annual_key, "amount": float(amount), "month_year": None, "rollover_enabled": False,
                              "demo_seed_tag": SEED_TAG, "updated_at": now}
                prepared.append((annual_key, annual_doc))

        print(f"Target database: {STAGING_DB_NAME}")
        print(f"Target user: {target_user.get('name', 'Demo user')} <{target_user.get('email', '')}>")
        print(f"Prepared {len(prepared)} non-overlapping budget records: Rent monthly limits Jan-Oct, other monthly limits Jan-Nov, and selected 2026 annual-only limits.")
        print("Monthly limits (PHP): " + ", ".join(f"{name} {value:,.0f}" for name, value in MONTHLY_LIMITS.items()))
        print("Annual-only limits (PHP): " + ", ".join(f"{name} {value:,.0f}" for name, value in ANNUAL_LIMITS.items()))
        if missing:
            print("Skipped categories not found as active expense categories: " + ", ".join(missing))

        annual_category_ids = [str(expense_categories[name.lower()]["_id"])
                               for name in ANNUAL_LIMITS if name.lower() in expense_categories]
        print("Annual-limit transaction coverage (existing seed rows):")
        for month in MONTHS:
            month_rows = list(db.expenses.find({
                "user_id": USER_ID,
                "category_id": {"$in": annual_category_ids},
                "type": "Expense",
                "date": {"$regex": f"^{month}-"},
            }, {"category_id": 1, "amount": 1}))
            month_total = sum(float(row.get("amount", 0) or 0) for row in month_rows)
            print(f"  {month}: {len(month_rows)} transactions, PHP {month_total:,.0f}")

        current_tagged = db.budgets.count_documents({"user_id": USER_ID, "demo_seed_tag": SEED_TAG})
        current_untagged = db.budgets.count_documents({"user_id": USER_ID, "demo_seed_tag": {"$exists": False}})
        current_other_tagged = db.budgets.count_documents({
            "user_id": USER_ID,
            "demo_seed_tag": {"$exists": True, "$ne": SEED_TAG},
        })
        print(f"Current budget records for this user: {current_tagged} from this seed, {current_untagged} untagged, {current_other_tagged} from other seeds.")
        category_names = {str(c["_id"]): str(c.get("name", "Unknown")) for c in cats}
        current_budgets = list(db.budgets.find({"user_id": USER_ID}, {
            "_id": 1, "category_id": 1, "period_type": 1, "period_key": 1, "amount": 1, "demo_seed_tag": 1,
        }))
        print("Existing periods by category:")
        for budget in current_budgets:
            category_name = category_names.get(str(budget.get("category_id")), "Unknown")
            owner = "this seed" if budget.get("demo_seed_tag") == SEED_TAG else "existing/manual"
            print(f"  {category_name}: {budget.get('period_type')} {budget.get('period_key')} PHP {float(budget.get('amount', 0)):,.0f} ({owner})")
        conflicting_periods = [
            budget for budget in current_budgets
            if str(budget.get("category_id")) in desired_period_by_category
            and budget.get("period_type") != desired_period_by_category[str(budget.get("category_id"))]
        ]
        if conflicting_periods:
            print(f"Mismatched category periods to remove with --clean-category-periods: {len(conflicting_periods)}")
            for budget in conflicting_periods:
                category_name = category_names.get(str(budget.get("category_id")), "Unknown")
                print(f"  {category_name}: {budget.get('period_type')} {budget.get('period_key')}")

        # Never overwrite a budget the user created manually or another seed owns.
        # Re-running this seed may update only records carrying this exact seed tag.
        safe_prepared = []
        conflicts = []
        for key, document in prepared:
            existing = db.budgets.find_one(key, {"demo_seed_tag": 1})
            if existing and existing.get("demo_seed_tag") != SEED_TAG and not args.clean_category_periods:
                conflicts.append(key)
                continue
            safe_prepared.append((key, document))
        prepared = safe_prepared
        if conflicts:
            print(f"Skipped {len(conflicts)} budget periods that already have unseeded or differently seeded budgets; they were left unchanged.")
        if not args.apply:
            if args.clean_category_periods:
                print(f"Preview only. With --apply --clean-category-periods, only the {len(conflicting_periods)} mismatched category periods above will be removed; matching periods will be updated to the configured norms.")
            else:
                print("Preview only. Add --apply to upsert these records. Existing untagged budgets are not modified.")
            return

        if args.clean_category_periods and conflicting_periods:
            removed = db.budgets.delete_many({
                "user_id": USER_ID,
                "_id": {"$in": [budget["_id"] for budget in conflicting_periods]},
            }).deleted_count
            print(f"Removed {removed} mismatched category-period budgets.")

        operations = [UpdateOne(key, {"$set": doc, "$setOnInsert": {"created_at": now}}, upsert=True)
                      for key, doc in prepared]
        if operations:
            result = db.budgets.bulk_write(operations, ordered=True)
            expected_keys = [key for key, _ in prepared]
            stale_filter = {"user_id": USER_ID, "demo_seed_tag": SEED_TAG}
            if expected_keys:
                stale_filter["$nor"] = expected_keys
            stale_removed = db.budgets.delete_many(stale_filter).deleted_count
            print(f"Budget seed complete: {result.upserted_count} inserted, {result.modified_count} updated, {stale_removed} obsolete tagged budgets removed.")
        else:
            print("No budgets were written because no configured categories were available.")
    finally:
        client.close()


if __name__ == "__main__":
    main()
