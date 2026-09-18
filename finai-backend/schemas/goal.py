# finai-backend/schemas/goal.py
from pydantic import BaseModel, Field

class GoalCreate(BaseModel):
    user_id: str
    goal_type_id: str  
    target_name: str  
    target_amount: float = Field(..., gt=0)
    current_savings: float = Field(default=0.0, ge=0)
    target_date: str = Field(..., pattern=r'^\d{4}-\d{2}-\d{2}$') 

class GoalResponse(GoalCreate):
    id: str

    class Config:
        from_attributes = True

# HETO ANG IDADAGDAG NATIN PAPS:
class GoalDeposit(BaseModel):
    user_id: str  # FIX: required so the endpoint can verify the requester actually owns this goal
    amount: float = Field(..., gt=0)  # FIX: previously unconstrained -- a negative amount could
                                       # silently drain a goal's savings and inject a phantom
                                       # negative "expense" into budget/insights totals.
    account: str  # Dito natin sasabihin kung Cash, GCash, o Bank ang ginamit