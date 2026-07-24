# finai-backend/models.py
from pydantic import BaseModel, Field
from typing import Optional
from bson import ObjectId
from pydantic_core import core_schema

# Helper class para ma-handle ng Pydantic ang MongoDB ObjectId sa V2
class PyObjectId(str):
    @classmethod
    def __get_pydantic_core_schema__(cls, _source_type, _handler):
        return core_schema.str_schema()

# Ito ang model para sa Categories natin
class CategoryModel(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    name: str
    type: str  # "admin" o "user"
    user_id: Optional[str] = None  # null para sa admin, user_id string para sa user
    icon: str  # Dito natin ilalagay yung pangalan ng icon (e.g., 'fast-food-outline')

    class Config:
        populate_by_name = True # Updated from allow_population_by_field_name
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

# Dagdag sa models.py
class BudgetModel(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    user_id: str
    category_id: str  # Ito yung link sa category
    amount: float     # Ang budget limit
    spent: float = 0.0 # <--- ADD THIS FIELD (Default is 0)
    month_year: str   # Halimbawa: "06-2026" (Para alam natin kung para sa anong buwan)

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

# Dagdag sa models.py para sa Presets Manager (Admin side)
class GoalTypeModel(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    name: str          # e.g., "Emergency Fund", "Travel Goal"
    icon: str          # e.g., "airplane-outline"
    description: str   # short description para sa user

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

# Dagdag sa models.py para sa Accounts
class AccountModel(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    name: str
    icon: str = "wallet-outline"
    initial_balance: float = 0.0

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}