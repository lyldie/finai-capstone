# finai-backend/schemas/budget.py
from pydantic import BaseModel, Field, field_validator
from typing import Literal, Optional
from schemas.money import require_cent_precision

class BudgetCreate(BaseModel):
    user_id: str
    category_id: str      # Dito na tayo mag-link, hindi sa name
    amount: float = Field(..., gt=0, allow_inf_nan=False)
    period_type: Literal["weekly", "monthly", "annual"] = "monthly"
    rollover_enabled: bool = False
    budget_kind: Literal["variable", "fixed"] = "variable"
    period_key: Optional[str] = None
    month_year: Optional[str] = None  # Legacy field; existing budgets remain readable.

    @field_validator("amount", mode="before")
    @classmethod
    def budget_amount_has_cent_precision(cls, value):
        return require_cent_precision(value, "Budget amount")

class BudgetBulkCreate(BaseModel):
    budgets: list[BudgetCreate] = Field(..., min_length=1, max_length=30)

    @field_validator("budgets")
    @classmethod
    def categories_must_be_unique(cls, value):
        keys = [(item.category_id, item.period_type, item.period_key) for item in value]
        if len(keys) != len(set(keys)):
            raise ValueError("Choose each category only once for a budget period.")
        return value

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
