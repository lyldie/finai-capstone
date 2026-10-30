# finai-backend/schemas/goal.py
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from schemas.money import require_cent_precision

class GoalCreate(BaseModel):
    user_id: str
    goal_type_id: str  
    target_name: str  
    target_amount: float = Field(..., gt=0, allow_inf_nan=False)
    current_savings: float = Field(default=0.0, ge=0, allow_inf_nan=False)
    target_date: str = Field(..., pattern=r'^\d{4}-\d{2}-\d{2}$') 

    @field_validator("target_amount", "current_savings", mode="before")
    @classmethod
    def goal_money_has_cent_precision(cls, value):
        return require_cent_precision(value, "Goal amount")

class GoalResponse(GoalCreate):
    id: str
    is_archived: bool = False

    class Config:
        from_attributes = True

# HETO ANG IDADAGDAG NATIN PAPS:
class GoalDeposit(BaseModel):
    user_id: str  # FIX: required so the endpoint can verify the requester actually owns this goal
    amount: float = Field(..., gt=0, allow_inf_nan=False)  # FIX: previously unconstrained -- a negative amount could
                                       # silently drain a goal's savings and inject a phantom
                                       # negative "expense" into budget/insights totals.
    account: str  # Dito natin sasabihin kung Cash, GCash, o Bank ang ginamit

    @field_validator("amount", mode="before")
    @classmethod
    def deposit_has_cent_precision(cls, value):
        return require_cent_precision(value, "Contribution amount")
