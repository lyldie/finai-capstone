from motor.motor_asyncio import AsyncIOMotorClient
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))
MONGO_URL = os.getenv("MONGO_URL")
if not MONGO_URL:
    raise RuntimeError("MONGO_URL must be set in the environment before starting the backend.")

# I-initialize ang client at db
client = AsyncIOMotorClient(MONGO_URL)
db = client.FinAI_DB


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

    # FIX: pending_signups now backs OTP verification (previously an in-memory dict --
    # see main.py's /register and /verify-otp). This TTL index auto-deletes any
    # unverified registration 15 minutes after it was created, a small safety margin
    # past the 10-minute app-level expiry check, so abandoned signups don't pile up.
    await db.pending_signups.create_index("timestamp", expireAfterSeconds=900)

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
