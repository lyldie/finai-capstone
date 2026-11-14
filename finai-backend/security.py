"""Small Mongo-backed authentication rate limiter shared by all workers."""
import hashlib
import ipaddress
import os
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from database import db


# Temporary demo switch for authenticated AI/OCR feature caps. Auth/login
# attempt limits remain active regardless of this setting.
AI_FEATURE_RATE_LIMITS_ENABLED = os.getenv("AI_FEATURE_RATE_LIMITS_ENABLED", "false").strip().lower() in {
    "1", "true", "yes", "on",
}


def _attempt_key(scope: str, value: str) -> str:
    return hashlib.sha256(f"{scope}:{value}".encode("utf-8")).hexdigest()


def _client_ip(request: Request) -> str:
    """Use the forwarded client address when Cloud Run connects over link-local."""
    peer = request.client.host if request.client else "unknown"
    try:
        peer_ip = ipaddress.ip_address(peer)
    except ValueError:
        return peer

    # Cloud Run can expose its internal link-local proxy as the socket peer.
    # In that case, the first X-Forwarded-For item is the originating client.
    # Use this only for rate-limit bucketing; identity limits remain independent.
    if peer_ip.is_link_local:
        forwarded_for = request.headers.get("x-forwarded-for", "")
        for candidate in forwarded_for.split(","):
            try:
                return ipaddress.ip_address(candidate.strip()).compressed
            except ValueError:
                continue

    return peer_ip.compressed


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
    ip_address = _client_ip(request)
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


async def enforce_user_feature_rate_limit(
    user_id: str,
    feature: str,
    *,
    max_requests: int,
    window_seconds: int = 3600,
) -> None:
    """Apply a shared, Mongo-backed request limit to an authenticated user.

    MongoDB makes the counter consistent across Cloud Run instances and device
    sessions. The existing TTL index on auth_attempts removes old counters.
    """
    if not AI_FEATURE_RATE_LIMITS_ENABLED:
        return

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=window_seconds)
    key = _attempt_key(f"feature:{feature}", user_id)
    expired = {"$lte": [{"$ifNull": ["$window_started_at", datetime(1970, 1, 1, tzinfo=timezone.utc)]}, cutoff]}
    next_attempts = {"$cond": [expired, 1, {"$add": [{"$ifNull": ["$attempts", 0]}, 1]}]}
    update = [{"$set": {
        "window_started_at": {"$cond": [expired, now, "$window_started_at"]},
        "attempts": next_attempts,
        "expires_at": {"$cond": [expired, now + timedelta(seconds=window_seconds), "$expires_at"]},
    }}]
    try:
        record = await db.auth_attempts.find_one_and_update(
            {"_id": key}, update, upsert=True, return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        # Concurrent initial requests can race to upsert the same user counter.
        record = await db.auth_attempts.find_one_and_update(
            {"_id": key}, update, return_document=ReturnDocument.AFTER,
        )

    if int((record or {}).get("attempts", 0)) > max_requests:
        started_at = (record or {}).get("window_started_at", now)
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)
        retry_after = max(1, int((started_at + timedelta(seconds=window_seconds) - now).total_seconds()))
        raise HTTPException(
            status_code=429,
            detail="You’ve reached the temporary usage limit for this feature. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )
