# finai-backend/schemas/budget.py
from pydantic import BaseModel, Field
from typing import Optional

class BudgetCreate(BaseModel):
    user_id: str
    category_id: str      # Dito na tayo mag-link, hindi sa name
    amount: float = Field(..., gt=0)
    month_year: str       # e.g., "06-2026"

class BudgetResponse(BaseModel):
    id: str
    user_id: str
    category_id: str
    amount: float
    month_year: str
    spent: float = 0.0

    class Config:
        from_attributes = True