"""Small Mongo-backed authentication rate limiter shared by all workers."""
import hashlib
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from database import db


def _attempt_key(scope: str, value: str) -> str:
    return hashlib.sha256(f"{scope}:{value}".encode("utf-8")).hexdigest()


async def enforce_auth_rate_limit(
    request: Request,
    scope: str,
    identifier: str,
    *,
    max_attempts: int,
    ip_max_attempts: int | None = None,
    window_seconds: int,
) -> None:
    """Count attempts by both account identifier and source IP in MongoDB."""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=window_seconds)
    ip_address = request.client.host if request.client else "unknown"
    keys = [
        (_attempt_key(f"{scope}:identity", identifier.strip().lower()), max_attempts),
        (_attempt_key(f"{scope}:ip", ip_address), ip_max_attempts or max_attempts),
    ]

    for key, limit in keys:
        expired = {"$lte": [{"$ifNull": ["$window_started_at", datetime(1970, 1, 1, tzinfo=timezone.utc)]}, cutoff]}
        next_attempts = {"$cond": [expired, 1, {"$add": [{"$ifNull": ["$attempts", 0]}, 1]}]}
        try:
            record = await db.auth_attempts.find_one_and_update(
                {"_id": key},
                [{"$set": {
                    "window_started_at": {"$cond": [expired, now, "$window_started_at"]},
                    "attempts": next_attempts,
                    "expires_at": {"$cond": [expired, now + timedelta(seconds=window_seconds), "$expires_at"]},
                }}],
                upsert=True,
                return_document=ReturnDocument.AFTER,
            )
        except DuplicateKeyError:
            # Simultaneous first requests may race to create the counter. Retry
            # once against the document created by the other request.
            record = await db.auth_attempts.find_one_and_update(
                {"_id": key},
                [{"$set": {
                    "window_started_at": {"$cond": [expired, now, "$window_started_at"]},
                    "attempts": next_attempts,
                    "expires_at": {"$cond": [expired, now + timedelta(seconds=window_seconds), "$expires_at"]},
                }}],
                return_document=ReturnDocument.AFTER,
            )
        if int((record or {}).get("attempts", 0)) > limit:
            raise HTTPException(
                status_code=429,
                detail="Too many attempts. Wait a little while, then try again.",
                headers={"Retry-After": str(window_seconds)},
            )


async def clear_auth_rate_limit(request: Request, scope: str, identifier: str) -> None:
    # Clear only the successfully authenticated identity's counter. Keeping the
    # IP counter prevents a successful login to one account from resetting the
    # per-IP protection for attempts against other accounts.
    await db.auth_attempts.delete_one({
        "_id": _attempt_key(f"{scope}:identity", identifier.strip().lower())
    })
