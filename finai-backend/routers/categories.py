# finai-backend/routers/categories.py
from fastapi import APIRouter, HTTPException
from bson import ObjectId 
from typing import Optional
from schemas.category import CategoryCreate, CategoryResponse
from database import db

router = APIRouter(prefix="/api/categories", tags=["Categories"])

# Helper function para sa auto-icon assignment
def get_default_icon(name: str):
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
        return "pricetag-outline" # Default fallback icon

@router.get("/", response_model=list[CategoryResponse])
async def get_categories(user_id: Optional[str] = None):
    # Kung walang user_id, admin categories lang ang lalabas
    query = {"category_role": "admin"} 
    if user_id:
        query = {
            "$or": [
                {"category_role": "admin"},
                {"$and": [{"category_role": "user"}, {"user_id": user_id}]}
            ]
        }
    
    categories = []
    async for cat in db.categories.find(query):
        cat_data = {**cat, "id": str(cat["_id"])}
        categories.append(CategoryResponse(**cat_data))
    return categories

@router.post("/", response_model=CategoryResponse)
async def create_category(category: CategoryCreate):
    cat_data = category.model_dump()
    
    # Siguraduhin na kung may user_id, ang role ay "user"
    if cat_data.get("user_id"):
        cat_data["category_role"] = "user"
    else:
        cat_data["category_role"] = "admin"

    # I-auto assign ang icon kung wala
    if not cat_data.get("icon"):
        cat_data["icon"] = get_default_icon(cat_data["name"])

    new_cat = await db.categories.insert_one(cat_data)
    created_cat = await db.categories.find_one({"_id": new_cat.inserted_id})
    
    created_cat_data = {**created_cat, "id": str(created_cat["_id"])}
    return CategoryResponse(**created_cat_data)

@router.put("/{category_id}", response_model=CategoryResponse)
async def update_category(category_id: str, category: CategoryCreate):
    try:
        oid = ObjectId(category_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid Category ID format")

    updated_cat = await db.categories.find_one_and_update(
        {"_id": oid}, 
        {"$set": category.model_dump()},
        return_document=True
    )
    if not updated_cat:
        raise HTTPException(status_code=404, detail="Category not found")
    updated_cat_data = {**updated_cat, "id": str(updated_cat["_id"])}
    return CategoryResponse(**updated_cat_data)

@router.delete("/{category_id}")
async def delete_category(category_id: str):
    try:
        oid = ObjectId(category_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid Category ID format")

    result = await db.categories.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deleted successfully"}

@router.post("/seed-categories", tags=["Admin Setup"])
async def seed_categories():
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
    
    # INAYOS: Binigyan ng kumpletong fields ang default accounts para tugma sa bagong Account Schema natin
    accounts_list = [
        {"name": "Cash", "initial_balance": 0.0, "icon": "wallet", "account_role": "admin"}, 
        {"name": "GCash", "initial_balance": 0.0, "icon": "phone-portrait", "account_role": "admin"}, 
        {"name": "Bank", "initial_balance": 0.0, "icon": "card", "account_role": "admin"}, 
        {"name": "Savings", "initial_balance": 0.0, "icon": "archive", "account_role": "admin"},
        {"name": "Savings", "type": "expense", "icon": "archive-outline", "category_role": "admin"}
    ]

    all_data = expense_categories + income_categories
    
    existing_count = await db.categories.count_documents({})
    if existing_count > 0:
        return {"status": "Info", "message": f"May {existing_count} items na sa DB. Hindi na kailangan i-seed!"}
    
    await db.categories.insert_many(all_data)
    await db.accounts.insert_many(accounts_list)
    
    return {"status": "Success", "message": "All categories and accounts seeded successfully!"}