from fastapi import FastAPI
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from datetime import datetime

app = FastAPI()

# Siguraduhin na ito yung updated connection string mo paps
MONGO_URL = "mongodb+srv://loyld30estardo_db_user:UvwihQM1QAq8z1e5@finai-cluster.3hekskr.mongodb.net/?appName=FinAI-Cluster"
client = AsyncIOMotorClient(MONGO_URL)
db = client.FinAI_DB  # Ito ang pangalan ng database mo sa Cloud

# 1. Blueprint ng Data (Variables)
class Transaction(BaseModel):
    item_name: str
    amount: float
    category: str 
    date: str = datetime.now().strftime("%Y-%m-%d")

@app.get("/")
async def root():
    return {"message": "FinAI Backend is Live!"}

# 2. Command para mag-save ng gastos
@app.post("/add-expense")
async def add_expense(data: Transaction):
    try:
        collection = db.daily_expenses
        new_record = await collection.insert_one(data.dict())
        return {
            "status": "Success",
            "message": f"Saved {data.item_name} (₱{data.amount}) to Cloud!",
            "id": str(new_record.inserted_id)
        }
    except Exception as e:
        return {"status": "Error", "message": str(e)}

        # Ito ang command para "kunin" ang lahat ng gastos mula sa database
@app.get("/get-expenses")
async def get_expenses():
    try:
        collection = db.daily_expenses
        # Kukunin natin lahat ng documents, i-sort natin by date (latest first)
        cursor = collection.find().sort("date", -1)
        expenses = await cursor.to_list(length=100)
        
        # Kailangan nating i-convert yung MongoDB ID para mabasa ng JSON
        for expense in expenses:
            expense["_id"] = str(expense["_id"])
            
        return {"status": "Success", "data": expenses}
    except Exception as e:
        return {"status": "Error", "message": str(e)}

        from bson import ObjectId # Idagdag mo 'to sa pinakataas na imports paps

# Ito ang command para "i-edit" ang isang existing transaction
@app.put("/update-expense/{expense_id}")
async def update_expense(expense_id: str, data: Transaction):
    try:
        collection = db.daily_expenses
        
        # Hahanapin natin yung record gamit ang ID at papalitan ang laman
        result = await collection.update_one(
            {"_id": ObjectId(expense_id)},
            {"$set": data.dict()}
        )
        
        if result.modified_count == 1:
            return {"status": "Success", "message": f"Updated {data.item_name} successfully!"}
        return {"status": "Error", "message": "Walang nabago o hindi nahanap ang ID."}
        
    except Exception as e:
        return {"status": "Error", "message": str(e)}

@app.delete("/delete-expense/{expense_id}")
async def delete_expense(expense_id: str):
    try:
        collection = db.daily_expenses

        result = await collection.delete_one({"_id": ObjectId(expense_id)})

        if result.deleted_count ==1:
            return {"status": "Success", "message": "Record deleted succesfully!"}
        
        return {"status": "Error:", "message": "Record not found."}

        except Exception as e:
            return {"status": "Error", "message": str(e)}
