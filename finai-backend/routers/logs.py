# finai-backend/routers/logs.py
from fastapi import APIRouter
from pydantic import BaseModel
from database import db
from typing import List
from datetime import datetime

router = APIRouter(prefix="/api/logs", tags=["Audit Logs"])

# Schema natin para sa UI
class LogResponse(BaseModel):
    id: str
    action: str
    admin_name: str
    timestamp: str

@router.get("/", response_model=List[LogResponse])
async def get_audit_logs():
    logs = []
    # Nilagyan natin ng sort("timestamp", -1) para laging nasa taas ang pinakabago!
    async for log in db.audit_logs.find().sort("timestamp", -1):
        log_data = {
            "id": str(log["_id"]),
            "action": log.get("action", "Unknown Action"),
            "admin_name": log.get("admin_name", "System"),
            "timestamp": log.get("timestamp", datetime.now().isoformat())
        }
        logs.append(LogResponse(**log_data))
    return logs

# Optional: Helper endpoint para lang makapag-push ka ng test logs mula sa ThunderClient o Postman
class LogCreate(BaseModel):
    action: str
    admin_name: str

@router.post("/")
async def create_test_log(log: LogCreate):
    log_data = log.model_dump()
    log_data["timestamp"] = datetime.now().isoformat()
    await db.audit_logs.insert_one(log_data)
    return {"status": "Success", "message": "Log recorded!"}