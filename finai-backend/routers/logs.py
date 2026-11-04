# finai-backend/routers/logs.py
import asyncio
import logging
from uuid import uuid4

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from database import db
from typing import List
from datetime import datetime
from zoneinfo import ZoneInfo
from pymongo import WriteConcern
from pymongo.errors import PyMongoError

from auth import get_current_admin

router = APIRouter(prefix="/api/logs", tags=["Audit Logs"])

PH_TZ = ZoneInfo("Asia/Manila")
logger = logging.getLogger(__name__)


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

    Retry transient Mongo failures with an idempotent event ID and majority
    write concern. The admin action remains successful if logging is still
    unavailable after retries; the final failure is visible in Cloud Run logs.
    """
    event_id = str(uuid4())
    event = {
        "_id": event_id,
        "admin_name": admin_name,
        "action": action,
        "timestamp": datetime.now(PH_TZ).isoformat(),
    }
    durable_logs = db.audit_logs.with_options(
        write_concern=WriteConcern(w="majority", wtimeout=5000)
    )
    for attempt in range(3):
        try:
            await durable_logs.update_one(
                {"_id": event_id}, {"$setOnInsert": event}, upsert=True,
            )
            return
        except PyMongoError as exc:
            if attempt == 2:
                logger.error(
                    "Audit event %s could not be persisted after retries (%s).",
                    event_id,
                    type(exc).__name__,
                )
                return
            await asyncio.sleep(0.15 * (2 ** attempt))


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

@router.post("/")
async def create_test_log(log: LogCreate, admin: dict = Depends(get_current_admin)):
    # Attribute test/manual entries to the authenticated actor; never trust a
    # caller-supplied admin_name in an audit record.
    await log_action(admin["name"], log.action)
    return {"status": "Success", "message": "Log recorded!"}
