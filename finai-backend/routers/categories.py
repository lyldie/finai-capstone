# finai-backend/routers/categories.py
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPAuthorizationCredentials
from bson import ObjectId
import asyncio
import secrets
from datetime import datetime, timedelta, timezone
from pymongo.errors import DuplicateKeyError
from typing import Optional
from schemas.category import CategoryCreate, CategoryResponse
from database import db

from auth import get_current_admin, verify_admin_credentials, bearer_scheme
from auth import get_current_user
import re
from .logs import log_action

router = APIRouter(prefix="/api/categories", tags=["Categories"])


async def _insert_category_with_name_lock(category_data: dict, duplicate_query: dict, detail: str):
    """Serialize overlapping user/admin category names before checking and inserting."""
    lock_key = f"{category_data['type']}:{category_data['name_key']}"
    owner = secrets.token_urlsafe(18)
    deadline = asyncio.get_running_loop().time() + 5
    acquired = False

    # Atomically claim a short lease. The unique _id means only one request can
    # create a missing lock; concurrent upserts retry until the current owner
    # releases it or its lease expires. This works without Mongo transactions.
    while asyncio.get_running_loop().time() < deadline:
        now = datetime.now(timezone.utc)
        try:
            lock = await db.category_name_locks.find_one_and_update(
                {"_id": lock_key, "$or": [{"expires_at": {"$lte": now}}, {"expires_at": {"$exists": False}}]},
                {"$set": {"owner": owner, "expires_at": now + timedelta(seconds=15)}},
                upsert=True,
                return_document=True,
            )
            if lock and lock.get("owner") == owner:
                acquired = True
                break
        except DuplicateKeyError:
            # Another request owns the unexpired lock; retry briefly.
            pass
        await asyncio.sleep(0.05)

    if not acquired:
        raise HTTPException(status_code=503, detail="Category is being saved. Please try again in a moment.")

    try:
        if await db.categories.find_one(duplicate_query):
            raise HTTPException(status_code=409, detail=detail)
        return await db.categories.insert_one(category_data)
    finally:
        await db.category_name_locks.delete_one({"_id": lock_key, "owner": owner})

def get_default_icon(name: str):
    """(unchanged)"""
    name_lower = name.lower()
    if any(word in name_lower for word in ["food", "grocery", "meal", "eat"]):
        return "fast-food-outline"
    elif any(word in name_lower for word in ["transpo", "gas", "fare", "travel"]):
        return "bus-outline"
    elif any(word in name_lower for word in ["bill", "rent", "electric", "water"]):
        return "card-outline"
    elif any(word in name_lower for word in ["shop", "cloth", "buy"]):
        return "cart-outline"
    elif any(word in name_lower for word in ["health", "med", "doctor"]):
        return "medical-outline"
    elif any(word in name_lower for word in ["salary", "job", "work"]):
        return "cash-outline"
    elif any(word in name_lower for word in ["invest", "bank", "save"]):
        return "trending-up-outline"
    else:
        return "pricetag-outline"

@router.get("/", response_model=list[CategoryResponse])
async def get_categories(user_id: Optional[str] = None, archived: bool = False, current_user: dict = Depends(get_current_user)):
    """CHANGED: added `archived` query param, same reasoning as accounts.py."""
    user_id = current_user["id"]
    query = {"category_role": "admin"}
    if user_id:
        query = {"$or": [{"category_role": "admin"}, {"$and": [{"category_role": "user"}, {"user_id": user_id}]}]}

    query = {"$and": [query, {"is_archived": True if archived else {"$ne": True}}]}

    categories = []
    async for cat in db.categories.find(query):
        cat_data = {**cat, "id": str(cat["_id"])}
        categories.append(CategoryResponse(**cat_data))
    return categories

@router.post("/", response_model=CategoryResponse)
async def create_category(category: CategoryCreate, current_user: dict = Depends(get_current_user)):
    """FIXED: Added duplicate name check for user."""
    cat_data = category.model_dump()
    user_id = current_user["id"]
    cat_data["user_id"] = user_id
    cat_data["name"] = cat_data["name"].strip()
    cat_data["type"] = cat_data["type"].strip().lower()
    if not cat_data["name"] or cat_data["type"] not in {"expense", "income"}:
        raise HTTPException(status_code=422, detail="Category name and a valid type (expense or income) are required.")

    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required to create a personal category. Admin presets must use POST /api/categories/admin.")

    # 🛡️ FIX: Duplicate category check (Case-insensitive)
    existing_cat = await db.categories.find_one({
        "$or": [{"user_id": user_id, "category_role": "user"}, {"category_role": "admin"}],
        "type": cat_data["type"],
        "name": {"$regex": f"^{re.escape(cat_data['name'])}$", "$options": "i"},
        "is_archived": {"$ne": True}
    })
    if existing_cat:
        if existing_cat.get("category_role") == "admin":
            detail = "This category is already available in the Admin presets. Select it from the category list instead of creating another."
        else:
            detail = "You already created a custom category with this name. Choose a different name."
        raise HTTPException(status_code=409, detail=detail)

    cat_data["category_role"] = "user"
    cat_data["owner_scope"] = user_id
    cat_data["name_key"] = cat_data["name"].casefold()
    cat_data["is_archived"] = False
    if not cat_data.get("icon"):
        cat_data["icon"] = get_default_icon(cat_data["name"])

    try:
        new_cat = await _insert_category_with_name_lock(
            cat_data,
            {"$or": [
                {"category_role": "admin", "type": cat_data["type"], "name_key": cat_data["name_key"], "is_archived": False},
                {"category_role": "user", "user_id": user_id, "type": cat_data["type"], "name_key": cat_data["name_key"], "is_archived": False},
            ]},
            "This category is already available to this user or exists in your custom categories.",
        )
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="A category with this name and type already exists in this scope.") from exc
    created_cat = await db.categories.find_one({"_id": new_cat.inserted_id})
    created_cat_data = {**created_cat, "id": str(created_cat["_id"])}
    return CategoryResponse(**created_cat_data)


@router.post("/admin", response_model=CategoryResponse)
async def create_admin_category(category: CategoryCreate, admin: dict = Depends(get_current_admin)):
    """FIXED: Added duplicate name check for admin presets."""
    cat_data = category.model_dump()
    cat_data["name"] = cat_data["name"].strip()
    cat_data["type"] = cat_data["type"].strip().lower()
    if not cat_data["name"] or cat_data["type"] not in {"expense", "income"}:
        raise HTTPException(status_code=422, detail="Category name and a valid type (expense or income) are required.")

    # 🛡️ FIX: Duplicate category check for admins
    existing_cat = await db.categories.find_one({
        "type": cat_data["type"],
        "name_key": cat_data["name"].casefold(),
        "is_archived": {"$ne": True},
        "$or": [{"category_role": "admin"}, {"category_role": "user"}],
    })
    if existing_cat:
        raise HTTPException(status_code=409, detail="An active category with this name and type already exists. Choose a different name or resolve the existing custom category first.")

    cat_data["user_id"] = None
    cat_data["category_role"] = "admin"
    cat_data["owner_scope"] = "admin"
    cat_data["name_key"] = cat_data["name"].casefold()
    cat_data["is_archived"] = False
    if not cat_data.get("icon"):
        cat_data["icon"] = get_default_icon(cat_data["name"])

    try:
        new_cat = await _insert_category_with_name_lock(
            cat_data,
            {"type": cat_data["type"], "name_key": cat_data["name_key"], "is_archived": False,
             "$or": [{"category_role": "admin"}, {"category_role": "user"}]},
            "An active category with this name and type already exists.",
        )
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="An admin preset with this name and type already exists.") from exc
    created_cat = await db.categories.find_one({"_id": new_cat.inserted_id})
    created_cat_data = {**created_cat, "id": str(created_cat["_id"])}

    await log_action(admin["name"], f"Created category preset '{cat_data['name']}'")
    return CategoryResponse(**created_cat_data)


@router.put("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: str,
    category: CategoryCreate,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    current_user: dict = Depends(get_current_user),
):
    """(unchanged) Branches between admin-JWT (preset) and ownership check (personal category)."""
    try:
        oid = ObjectId(category_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid Category ID format")

    existing_cat = await db.categories.find_one({"_id": oid})
    if not existing_cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if existing_cat.get("is_archived", False):
        raise HTTPException(status_code=409, detail="Restore this category preset before editing it.")

    admin_actor = None
    if existing_cat.get("category_role") == "admin":
        admin_actor = await verify_admin_credentials(credentials)
    else:
        if str(existing_cat.get("user_id")) != current_user["id"]:
            raise HTTPException(status_code=403, detail="You don't have permission to edit this category.")

    old_name = existing_cat.get("name")
    old_type = str(existing_cat.get("type", "")).lower()

    category_data = category.model_dump(exclude={"user_id", "category_role"})
    category_data["name"] = category_data["name"].strip()
    category_data["type"] = category_data["type"].strip().lower()
    if not category_data["name"] or category_data["type"] not in {"expense", "income"}:
        raise HTTPException(status_code=422, detail="Category name and a valid type (expense or income) are required.")
    category_data["user_id"] = existing_cat.get("user_id")
    category_data["category_role"] = existing_cat.get("category_role", "user")
    category_data["owner_scope"] = "admin" if category_data["category_role"] == "admin" else current_user["id"]
    category_data["name_key"] = category_data["name"].casefold()
    duplicate_query = {
        "_id": {"$ne": oid}, "is_archived": {"$ne": True}, "type": category_data["type"],
        "name": {"$regex": f"^{re.escape(category_data['name'])}$", "$options": "i"},
    }
    if existing_cat.get("category_role") == "admin":
        duplicate_query["$or"] = [
            {"category_role": "admin"},
            {"category_role": "user"},
        ]
    else:
        duplicate_query["$or"] = [
            {"category_role": "admin"},
            {"category_role": "user", "user_id": current_user["id"]},
        ]
    if await db.categories.find_one(duplicate_query):
        raise HTTPException(status_code=409, detail="A category with this name and type already exists.")

    # Category type determines whether a transaction is income or expense. Do
    # not let a used category switch types and leave its historical records
    # pointing at a category of the wrong type.
    if old_type != category_data["type"]:
        category_key = str(oid)
        reference_scope = {} if existing_cat.get("category_role") == "admin" else {"user_id": current_user["id"]}
        linked_transaction = await db.expenses.find_one({
            **reference_scope,
            "$or": [
                {"category_id": {"$in": [category_key, oid]}},
                {"category_id": {"$in": [None, ""]}, "category": old_name,
                 "type": {"$regex": f"^{re.escape(old_type)}$", "$options": "i"}},
            ],
        })
        linked_budget = await db.budgets.find_one({
            **reference_scope, "category_id": {"$in": [category_key, oid]}
        })
        if linked_transaction or linked_budget:
            raise HTTPException(
                status_code=409,
                detail="This category is already used by transactions or a budget, so its type can’t be changed. Create a separate category for the other type.",
            )

    try:
        updated_cat = await db.categories.find_one_and_update({"_id": oid}, {"$set": category_data}, return_document=True)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="A category with this name and type already exists in this scope.") from exc
    if not updated_cat:
        raise HTTPException(status_code=404, detail="Category not found")

    new_name = category_data["name"]
    if new_name and new_name != old_name:
        category_key = str(oid)
        expense_query = {"$or": [
            {"category_id": {"$in": [category_key, oid]}},
            {"category_id": {"$in": [None, ""]}, "category": old_name,
             "type": {"$regex": f"^{re.escape(old_type)}$", "$options": "i"}},
        ]}
        if existing_cat.get("category_role") != "admin":
            expense_query["user_id"] = current_user["id"]
        await db.expenses.update_many(expense_query, {"$set": {"category": new_name, "category_id": str(oid)}})
        if admin_actor:
            await log_action(admin_actor["name"], f"Renamed category '{old_name}' to '{new_name}'")

    updated_cat_data = {**updated_cat, "id": str(updated_cat["_id"])}
    return CategoryResponse(**updated_cat_data)


@router.patch("/{category_id}/archive", response_model=CategoryResponse)
async def archive_category(category_id: str, admin: dict = Depends(get_current_admin)):
    """NEW: replaces hard-deleting an admin preset."""
    try:
        oid = ObjectId(category_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid Category ID format")

    category = await db.categories.find_one({"_id": oid})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    if category.get("category_role") != "admin":
        raise HTTPException(status_code=400, detail="Only category presets can be archived here. Personal categories are managed by their owner.")

    # Backfill legacy transactions before this label can be reused. Newer records
    # already carry the stable category ID; older ones can only be resolved by name.
    await db.expenses.update_many(
        {
            "category": category.get("name"),
            "category_id": {"$in": [None, ""]},
            "type": {"$regex": f"^{re.escape(str(category.get('type', '')))}$", "$options": "i"},
        },
        {"$set": {"category_id": str(oid)}},
    )

    updated = await db.categories.find_one_and_update({"_id": oid}, {"$set": {"is_archived": True}}, return_document=True)
    await log_action(admin["name"], f"Archived category '{category.get('name')}'")
    return CategoryResponse(**{**updated, "id": str(updated["_id"])})


@router.patch("/{category_id}/restore", response_model=CategoryResponse)
async def restore_category(category_id: str, admin: dict = Depends(get_current_admin)):
    """NEW: the undo for archive_category above."""
    try:
        oid = ObjectId(category_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid Category ID format")

    category = await db.categories.find_one({"_id": oid})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    if category.get("category_role") != "admin" or not category.get("is_archived", False):
        raise HTTPException(status_code=400, detail="Only archived admin category presets can be restored.")
    duplicate = await db.categories.find_one({
        "_id": {"$ne": oid}, "type": category.get("type"),
        "name_key": str(category.get("name", "")).strip().casefold(),
        "is_archived": {"$ne": True},
        "$or": [{"category_role": "admin"}, {"category_role": "user"}],
    })
    if duplicate:
        raise HTTPException(status_code=409, detail="An active category with this name and type already exists, so this preset cannot be restored yet.")

    try:
        updated = await db.categories.find_one_and_update(
            {"_id": oid, "is_archived": True},
            {"$set": {"is_archived": False}},
            return_document=True,
        )
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="An active category with this name and type already exists.") from exc
    if not updated:
        raise HTTPException(status_code=409, detail="This category changed while it was being restored. Refresh and try again.")
    await log_action(admin["name"], f"Restored category '{category.get('name')}'")
    return CategoryResponse(**{**updated, "id": str(updated["_id"])})


@router.delete("/admin/{category_id}/permanent")
async def permanent_delete_category(category_id: str, admin: dict = Depends(get_current_admin)):
    """FIXED: Uses db.expenses instead of db.transactions to check for orphaned data."""
    try:
        oid = ObjectId(category_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid Category ID format")

    category = await db.categories.find_one({"_id": oid})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    if category.get("category_role") != "admin":
        raise HTTPException(status_code=400, detail="Only admin category presets can be permanently deleted through this route.")
    if not category.get("is_archived", False):
        raise HTTPException(status_code=400, detail="Archive the preset before permanently deleting it.")

    category_name = category.get("name")
    
    # 🛡️ FIX: Pinalitan ng db.expenses dahil yun ang tamang collection name ninyo
    category_key = str(oid)
    linked_transaction = await db.expenses.find_one({
        "$or": [
            {"category_id": {"$in": [category_key, oid]}},
            {"category_id": {"$in": [None, ""]}, "category": category_name,
             "type": {"$regex": f"^{re.escape(str(category.get('type', '')))}$", "$options": "i"}},
        ]
    })
    if linked_transaction:
        raise HTTPException(
            status_code=400, 
            detail="This category cannot be permanently deleted because recorded transactions still reference it."
        )

    linked_budget = await db.budgets.find_one({"category_id": {"$in": [str(oid), oid]}})
    if linked_budget:
        raise HTTPException(status_code=409, detail="This category is still used by a budget and cannot be permanently deleted.")

    result = await db.categories.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")

    await log_action(admin["name"], f"Permanently deleted category preset '{category_name}'")
    return {"message": "Category permanently deleted successfully"}


@router.delete("/{category_id}")
async def delete_category(
    category_id: str,
    user_id: Optional[str] = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    current_user: dict = Depends(get_current_user),
):
    """FIXED: Added check for orphaned expenses before deleting."""
    try:
        oid = ObjectId(category_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid Category ID format")

    existing = await db.categories.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")

    if existing.get("category_role") == "admin":
        raise HTTPException(status_code=400, detail="Category presets can't be deleted -- use archive instead (PATCH /api/categories/{id}/archive).")

    user_id = current_user["id"]
    if str(existing.get("user_id")) != user_id:
        raise HTTPException(status_code=403, detail="You don't have permission to delete this category.")

    # 🛡️ FIX: Check kung may BUDGET na gumagamit nito
    linked_budget = await db.budgets.find_one({
        "category_id": {"$in": [category_id, oid]}, "user_id": user_id,
    })
    if linked_budget:
        raise HTTPException(status_code=400, detail="This category has an active budget. Delete or reassign that budget first.")

    # Match transactions by stable category ID. Older records without an ID
    # fall back to both category label and transaction type so same-name income
    # and expense categories do not block each other's deletion.
    category_key = str(oid)
    category_type = str(existing.get("type", ""))
    linked_transaction_query = {
        "user_id": user_id,
        "$or": [
            {"category_id": {"$in": [category_key, oid]}},
            {"category_id": {"$in": [None, ""]}, "category": existing.get("name"),
             "type": {"$regex": f"^{re.escape(category_type)}$", "$options": "i"}},
        ],
    }
    linked_transaction_count = await db.expenses.count_documents(linked_transaction_query)
    if linked_transaction_count:
        category_kind = "income" if category_type.lower() == "income" else "expense"
        raise HTTPException(
            status_code=400,
            detail=(
                f'This {category_kind} category is linked to {linked_transaction_count} '
                f'recorded transaction(s). Edit or reassign those transactions before deleting it.'
            ),
        )

    result = await db.categories.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")

    return {"message": "Category deleted successfully"}

@router.post("/seed-categories", tags=["Admin Setup"])
async def seed_categories(admin: dict = Depends(get_current_admin)):
    """(unchanged) Admin-only, gated."""
    expense_categories = [
        {"name": "Food", "type": "expense", "icon": "fast-food-outline", "category_role": "admin"},
        {"name": "Transpo", "type": "expense", "icon": "bus-outline", "category_role": "admin"},
        {"name": "Bills", "type": "expense", "icon": "card-outline", "category_role": "admin"},
        {"name": "Shopping", "type": "expense", "icon": "cart-outline", "category_role": "admin"},
        {"name": "Health", "type": "expense", "icon": "medical-outline", "category_role": "admin"},
        {"name": "Others", "type": "expense", "icon": "ellipsis-horizontal-outline", "category_role": "admin"}
    ]
    income_categories = [
        {"name": "Salary", "type": "income", "icon": "cash-outline", "category_role": "admin"},
        {"name": "Allowance", "type": "income", "icon": "wallet-outline", "category_role": "admin"},
        {"name": "Investment", "type": "income", "icon": "trending-up-outline", "category_role": "admin"},
        {"name": "Business", "type": "income", "icon": "business-outline", "category_role": "admin"},
        {"name": "Others", "type": "income", "icon": "add-circle-outline", "category_role": "admin"}
    ]
    accounts_list = [
        {"name": "Cash", "initial_balance": 0.0, "icon": "wallet", "account_role": "admin"},
        {"name": "GCash", "initial_balance": 0.0, "icon": "phone-portrait", "account_role": "admin"},
        {"name": "Bank", "initial_balance": 0.0, "icon": "card", "account_role": "admin"},
        {"name": "Savings", "initial_balance": 0.0, "icon": "archive", "account_role": "admin"}
    ]

    all_data = expense_categories + income_categories
    existing_count = await db.categories.count_documents({})
    if existing_count > 0:
        return {"status": "Info", "message": f"The database already contains {existing_count} items. No seeding is needed."}

    for category in all_data:
        category["name"] = category["name"].strip()
        category["name_key"] = category["name"].casefold()
        category["owner_scope"] = "admin"
        category["is_archived"] = False
    for account in accounts_list:
        account["name_key"] = account["name"].strip().casefold()
        account["owner_scope"] = "admin"
        account["is_archived"] = False

    await db.categories.insert_many(all_data)
    await db.accounts.insert_many(accounts_list)
    await log_action(admin["name"], "Seeded default categories and accounts")
    return {"status": "Success", "message": "All categories and accounts seeded successfully!"}
