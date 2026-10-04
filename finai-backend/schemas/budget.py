# finai-backend/schemas/budget.py
from pydantic import BaseModel, Field
from typing import Literal, Optional

class BudgetCreate(BaseModel):
    user_id: str
    category_id: str      # Dito na tayo mag-link, hindi sa name
    amount: float = Field(..., gt=0, allow_inf_nan=False)
    period_type: Literal["weekly", "monthly", "annual"] = "monthly"
    rollover_enabled: bool = False
    period_key: Optional[str] = None
    month_year: Optional[str] = None  # Legacy field; existing budgets remain readable.

class BudgetResponse(BaseModel):
    id: str
    user_id: str
    category_id: str
    amount: float
    period_type: str = "monthly"
    period_key: Optional[str] = None
    month_year: Optional[str] = None
    spent: float = 0.0

    class Config:
        from_attributes = True
