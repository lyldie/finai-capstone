"""Preview or clear the demo user's transaction and budget records.

By default this script only prints counts. Pass --apply to delete the records.
It does not delete the user, accounts, categories, goals, notifications, or goal types.
Transactions include any goal-contribution ledger entries, so goal savings should
be reset/rebuilt consistently if this script is applied.
"""

import argparse
import os
from pathlib import Path

from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient


load_dotenv(Path(__file__).with_name(".env"))
USER_ID = os.getenv("DEMO_USER_ID", "6adff6c40dd00daaec95d9cc")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="delete this user's transactions and budgets")
    args = parser.parse_args()

    mongo_url = os.getenv("MONGO_URL")
    if not mongo_url:
        raise SystemExit("Set MONGO_URL in finai-backend/.env (do not put credentials in this script).")
    if not ObjectId.is_valid(USER_ID):
        raise SystemExit("DEMO_USER_ID must be a valid MongoDB ObjectId string.")

    client = MongoClient(mongo_url, serverSelectionTimeoutMS=10000)
    try:
        client.admin.command("ping")
        db = client["FinAI_DB"]
        transaction_query = {"user_id": USER_ID}
        budget_query = {"user_id": USER_ID}
        transaction_count = db.expenses.count_documents(transaction_query)
        budget_count = db.budgets.count_documents(budget_query)
        budget_rule_count = db.budget_rules.count_documents(budget_query)
        goal_count = db.goals.count_documents({"user_id": USER_ID})
        funded_goal_count = db.goals.count_documents({"user_id": USER_ID, "current_savings": {"$gt": 0}})

        print(f"Demo user: {USER_ID}")
        print(f"Transactions to clear: {transaction_count}")
        print(f"Budgets to clear: {budget_count}")
        print(f"Recurring budget rules to clear: {budget_rule_count}")
        print(f"Goals that will remain: {goal_count}")
        print(f"Goals with saved amounts that would become inconsistent: {funded_goal_count}")
        print("Notifications will remain; old budget alerts may need to be cleared in the app.")
        if not args.apply:
            print("Preview only. Add --apply to delete the listed transactions, budgets, and recurring budget rules.")
            return

        if funded_goal_count:
            raise SystemExit("Reset stopped to protect goal history. First decide how to preserve or reset those goal balances.")

        deleted_transactions = db.expenses.delete_many(transaction_query).deleted_count
        deleted_budgets = db.budgets.delete_many(budget_query).deleted_count
        deleted_rules = db.budget_rules.delete_many(budget_query).deleted_count
        print(
            f"Reset complete: deleted {deleted_transactions} transactions, "
            f"{deleted_budgets} budgets, and {deleted_rules} recurring budget rules."
        )
    finally:
        client.close()


if __name__ == "__main__":
    main()
