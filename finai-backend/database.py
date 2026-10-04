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
