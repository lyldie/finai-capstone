# finai-backend/auth.py
"""
JWT auth layer for authenticated user and admin endpoints.

Why this exists: none of the admin routers (accounts, categories, goal_types,
users, logs) previously checked WHO was calling them or WHETHER they were an
admin. Any client that knew the API base URL could call
DELETE /api/users/{id} directly. This module adds:

  1. create_access_token() - called from /login and /verify-otp in main.py for
     regular users and admins.
  2. get_current_admin() - a FastAPI dependency you attach to routes that are
     ALWAYS admin-only (goal_types, logs, users). It verifies the token's
     signature (so it can't be forged without SECRET_KEY), then re-checks the
     DB that the user still exists and is still role="admin" (defense in
     depth -- a role change or deletion invalidates old tokens immediately
     instead of waiting for expiry).
  3. verify_admin_credentials() - the same validation as get_current_admin,
     but callable directly rather than as a route-level Depends. Needed for
     accounts.py/categories.py, where PUT/DELETE are shared between admins
     editing a preset and regular users editing their own personal item --
     which check applies depends on which record is being touched, decided
     inside the route function, not upfront by the route signature.

Install requirement (add to requirements.txt if not already present):
    python-jose[cryptography]
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from bson import ObjectId

from database import db

# SECURITY NOTE: in production this MUST come from an environment variable.
# The fallback exists only so the app doesn't crash if you haven't set one
# yet locally -- change ADMIN_JWT_SECRET in your .env before any real deploy
# or demo where someone else could inspect your environment.
load_dotenv(Path(__file__).with_name(".env"))
SECRET_KEY = os.getenv("ADMIN_JWT_SECRET")
if not SECRET_KEY:
    raise RuntimeError("ADMIN_JWT_SECRET must be set before starting the backend.")
SUPER_ADMIN_EMAIL = os.getenv("SUPER_ADMIN_EMAIL", "").strip().lower()
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 12  # 12 hours -- long enough for a work session, short enough to limit a leaked-token window

# auto_error=False: a request with no Authorization header at all should not
# immediately 401 here -- some routes (accounts/categories PUT & DELETE) need
# to inspect *which record* is being touched before deciding whether a token
# is even required.
bearer_scheme = HTTPBearer(auto_error=False)


def create_access_token(user_id: str, role: str) -> str:
    """Build a signed token carrying just enough to identify + authorize the caller.
    Kept minimal on purpose -- no name/email inside, so the token itself leaks
    nothing extra if it's ever logged or intercepted."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": user_id, "role": role, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


async def _validate_admin_token(credentials: Optional[HTTPAuthorizationCredentials]) -> dict:
    """Core validation logic, shared by both entry points below."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing admin credentials. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        role = payload.get("role")
        if not user_id or role != "admin":
            raise JWTError("Token missing required admin claims")
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Defense in depth: confirm the user still exists and is still an admin
    # RIGHT NOW, not just at the moment the token was issued. This means
    # demoting/deleting an admin takes effect immediately instead of waiting
    # up to ACCESS_TOKEN_EXPIRE_MINUTES for the old token to expire.
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid session. Please log in again.")

    admin_user = await db.users.find_one({"_id": oid})
    if not admin_user or admin_user.get("role") != "admin" or admin_user.get("is_archived"):
        raise HTTPException(status_code=401, detail="Admin access revoked. Please log in again.")

    return {"id": user_id, "name": admin_user.get("name", "Admin"), "email": admin_user.get("email", "")}


async def get_current_admin(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)) -> dict:
    """FastAPI dependency for routes that are ALWAYS admin-only (goal_types,
    logs, users). Use this via Depends(get_current_admin) in a route signature."""
    return await _validate_admin_token(credentials)


async def get_current_super_admin(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)) -> dict:
    """Allow only the configured, active super-admin account to manage admins."""
    if not SUPER_ADMIN_EMAIL:
        raise HTTPException(status_code=503, detail="Super-admin access is not configured.")
    admin = await _validate_admin_token(credentials)
    if admin.get("email", "").strip().lower() != SUPER_ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Only the configured super admin can manage administrator accounts.")
    return admin


async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)) -> dict:
    """Authenticate any active user and return their database identity."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing credentials. Please log in again.", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id or payload.get("role") not in {"user", "admin"}:
            raise JWTError("Token missing required claims")
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired session. Please log in again.", headers={"WWW-Authenticate": "Bearer"})
    user = await db.users.find_one({"_id": oid})
    if not user or user.get("is_archived"):
        raise HTTPException(status_code=401, detail="Session is no longer valid. Please log in again.")
    return {"id": user_id, "name": user.get("name", ""), "email": user.get("email", ""), "role": user.get("role", "user")}


async def verify_admin_credentials(credentials: Optional[HTTPAuthorizationCredentials]) -> dict:
    """Call this directly (not via Depends) inside a route body when whether
    admin auth is required depends on which record is being touched -- e.g.
    accounts.py/categories.py's update/delete, where a preset (account_role
    or category_role == "admin") needs this check, but a regular user's own
    personal item needs an ownership check instead. Get the optional
    credentials via Depends(bearer_scheme) in the route signature, then call
    this function only on the branch that actually needs it."""
    return await _validate_admin_token(credentials)
