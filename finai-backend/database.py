from motor.motor_asyncio import AsyncIOMotorClient

# Siguraduhin na may MongoDB URL ka dito
MONGO_URL = "mongodb+srv://loyld30estardo_db_user:G4fh9SToFxKw2bds@finai-cluster.3hekskr.mongodb.net/?appName=FinAI-Cluster"

# I-initialize ang client at db
client = AsyncIOMotorClient(MONGO_URL)
db = client.FinAI_DB