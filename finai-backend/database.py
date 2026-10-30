from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))
MONGO_URL = os.getenv("MONGO_URL")
if not MONGO_URL:
    raise RuntimeError("MONGO_URL must be set in the environment before starting the backend.")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "FinAI_DB").strip() or "FinAI_DB"

# I-initialize ang client at db
client = AsyncIOMotorClient(MONGO_URL)
db = client[MONGO_DB_NAME]


async def _backfill_unique_keys(collection, key_field: str, key_builder) -> None:
    async for document in collection.find({}):
        key = key_builder(document)
        if key is not None and document.get(key_field) != key:
            await collection.update_one({"_id": document["_id"]}, {"$set": {key_field: key}})


async def ensure_indexes():
    """Create required indexes if they don't already exist. Safe to call on every
    startup -- create_index is a no-op if an equivalent index is already present.

    unique=True on (user_id, category_id, period_type, period_key) is the DB-level
    backstop for the duplicate-budget race fixed in routers/budgets.py: even if two
    near-simultaneous requests somehow both reach the upsert at the same instant,
    MongoDB itself will reject the second write instead of allowing two budget
    documents to exist for the same user/category/period.
    """
    await db.budgets.create_index(
        [("user_id", 1), ("category_id", 1), ("period_type", 1), ("period_key", 1)],
        unique=True,
    )
    await db.budget_rules.create_index(
        [("user_id", 1), ("category_id", 1), ("period_type", 1)],
        unique=True,
    )
    await db.bill_occurrences.create_index(
        [("user_id", 1), ("bill_id", 1), ("period_key", 1)], unique=True,
        name="bill_occurrence_user_bill_month_unique",
    )
    await db.fixed_bills.create_index(
        [("user_id", 1), ("is_active", 1), ("due_day", 1)],
        name="fixed_bills_user_active_due_day",
    )

    # Canonical keys let Mongo enforce the same case/whitespace-insensitive
    # uniqueness as the API checks, including when concurrent requests race.
    await _backfill_unique_keys(
        db.users, "email_key",
        lambda doc: doc.get("email", "").strip().casefold() if isinstance(doc.get("email"), str) and doc.get("email", "").strip() else None,
    )
    async for user in db.users.find({"email": {"$type": "string"}}):
        normalized_email = user["email"].strip().lower()
        if user["email"] != normalized_email:
            await db.users.update_one({"_id": user["_id"]}, {"$set": {"email": normalized_email}})
    await _backfill_unique_keys(
        db.categories, "name_key",
        lambda doc: doc.get("name", "").strip().casefold() if isinstance(doc.get("name"), str) and doc.get("name", "").strip() else None,
    )
    await _backfill_unique_keys(
        db.accounts, "name_key",
        lambda doc: doc.get("name", "").strip().casefold() if isinstance(doc.get("name"), str) and doc.get("name", "").strip() else None,
    )
    async for category in db.categories.find({"name_key": {"$type": "string"}}):
        role = category.get("category_role", "user")
        owner_scope = "admin" if role == "admin" else str(category.get("user_id", ""))
        await db.categories.update_one(
            {"_id": category["_id"]},
            {"$set": {
                "owner_scope": owner_scope,
                "category_role": role,
                "type": str(category.get("type", "")).strip().lower(),
                "is_archived": bool(category.get("is_archived", False)),
            }},
        )
    async for account in db.accounts.find({"name_key": {"$type": "string"}}):
        role = account.get("account_role", "admin")
        owner_scope = "admin" if role == "admin" else str(account.get("user_id", ""))
        await db.accounts.update_one(
            {"_id": account["_id"]},
            {"$set": {
                "owner_scope": owner_scope,
                "account_role": role,
                "is_archived": bool(account.get("is_archived", False)),
            }},
        )

    # Existing collisions must be resolved explicitly; startup now fails rather
    # than silently running without the protections these indexes provide.
    await db.users.create_index([("email_key", ASCENDING)], unique=True, name="users_email_key_unique", partialFilterExpression={"email_key": {"$type": "string"}})
    await db.categories.create_index(
        [("category_role", ASCENDING), ("owner_scope", ASCENDING), ("type", ASCENDING), ("name_key", ASCENDING)],
        unique=True, name="categories_owner_type_name_unique",
        partialFilterExpression={"name_key": {"$type": "string"}, "is_archived": False},
    )
    await db.accounts.create_index(
        [("account_role", ASCENDING), ("owner_scope", ASCENDING), ("name_key", ASCENDING)],
        unique=True, name="accounts_owner_name_unique",
        partialFilterExpression={"name_key": {"$type": "string"}, "is_archived": False},
    )

    # FIX: pending_signups now backs OTP verification (previously an in-memory dict --
    # see main.py's /register and /verify-otp). This TTL index auto-deletes any
    # unverified registration 15 minutes after it was created, a small safety margin
    # past the 10-minute app-level expiry check, so abandoned signups don't pile up.
    await db.pending_signups.create_index("timestamp", expireAfterSeconds=900)
    await db.auth_attempts.create_index("expires_at", expireAfterSeconds=0, name="auth_attempts_ttl")
    await db.category_name_locks.create_index("expires_at", expireAfterSeconds=0, name="category_name_locks_ttl")

    # Keeps date-range analytics (dashboard and advisor) scoped to one user's
    # non-archived transaction history instead of scanning the entire collection.
    await db.expenses.create_index([("user_id", 1), ("is_archived", 1), ("date", 1)])

    # Advisor threads are one per user and topic; messages remain separately
    # addressable so the inbox can load previews without reading full histories.
    await db.advisor_conversations.create_index(
        [("user_id", 1), ("topic", 1)], unique=True,
    )
    await db.advisor_messages.create_index(
        [("user_id", 1), ("conversation_id", 1), ("created_at", 1)],
    )
    await db.advisor_messages.create_index(
        [("user_id", 1), ("created_at", -1)],
    )
    # A sparse compound index still includes ordinary chat messages because
    # user_id is always present. Restrict uniqueness to messages with a string
    # event_key so many conversational messages can omit that field.
    event_index_name = "user_id_1_event_key_1"
    event_index_filter = {"event_key": {"$type": "string"}}
    existing_event_index = (await db.advisor_messages.index_information()).get(event_index_name)
    if existing_event_index and existing_event_index.get("partialFilterExpression") != event_index_filter:
        await db.advisor_messages.drop_index(event_index_name)
    await db.advisor_messages.create_index(
        [("user_id", 1), ("event_key", 1)],
        unique=True,
        partialFilterExpression=event_index_filter,
        name=event_index_name,
    )
