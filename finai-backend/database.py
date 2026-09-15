from motor.motor_asyncio import AsyncIOMotorClient

# Siguraduhin na may MongoDB URL ka dito
MONGO_URL = "mongodb+srv://loyld30estardo_db_user:G4fh9SToFxKw2bds@finai-cluster.3hekskr.mongodb.net/?appName=FinAI-Cluster"

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