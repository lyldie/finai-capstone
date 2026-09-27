# finai-backend/routers/logs.py
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from database import db
from typing import List
from datetime import datetime
from zoneinfo import ZoneInfo

from auth import get_current_admin

router = APIRouter(prefix="/api/logs", tags=["Audit Logs"])

PH_TZ = ZoneInfo("Asia/Manila")


# Schema natin para sa UI
class LogResponse(BaseModel):
    id: str
    action: str
    admin_name: str
    timestamp: str


async def log_action(admin_name: str, action: str) -> None:
    """Reusable audit-log writer. Import this into any router that performs an
    admin mutation (accounts, categories, goal_types, users) and call it right
    after the mutation succeeds.

    FIX: previously logs.py only had a manual POST endpoint meant for testing
    from Postman/ThunderClient -- nothing in the actual admin flows ever
    called it, so the audit trail was a working pipe with nothing feeding it.
    This function is what closes that gap; each router's create/update/delete
    endpoint calls it directly instead of going through an extra HTTP round
    trip to POST /api/logs/.

    Never raises: a logging failure should never block or fail the admin
    action that triggered it.
    """
    try:
        await db.audit_logs.insert_one({
            "admin_name": admin_name,
            "action": action,
            "timestamp": datetime.now(PH_TZ).isoformat(),
        })
    except Exception as e:
        print(f"[AuditLog] Failed to record action '{action}': {e}")


@router.get("/", response_model=List[LogResponse], dependencies=[Depends(get_current_admin)])
async def get_audit_logs():
    logs = []
    # Nilagyan natin ng sort("timestamp", -1) para laging nasa taas ang pinakabago!
    async for log in db.audit_logs.find().sort("timestamp", -1):
        log_data = {
            "id": str(log["_id"]),
            "action": log.get("action", "Unknown Action"),
            "admin_name": log.get("admin_name", "System"),
            "timestamp": log.get("timestamp", datetime.now(PH_TZ).isoformat())
        }
        logs.append(LogResponse(**log_data))
    return logs


# Optional: Helper endpoint para lang makapag-push ka ng test logs mula sa ThunderClient o Postman.
# Now gated behind admin auth too -- previously anyone could pollute the audit trail with
# fake entries since this endpoint had no guard at all.
class LogCreate(BaseModel):
    action: str
    admin_name: str

@router.post("/", dependencies=[Depends(get_current_admin)])
async def create_test_log(log: LogCreate):
    await log_action(log.admin_name, log.action)
    return {"status": "Success", "message": "Log recorded!"}