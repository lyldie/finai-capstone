# finai-backend/schemas/goal.py
from pydantic import BaseModel, Field

class GoalCreate(BaseModel):
    user_id: str
    goal_type_id: str  
    target_name: str  
    target_amount: float
    current_savings: float
    target_date: str = Field(..., pattern=r'^\d{4}-\d{2}-\d{2}$') 

class GoalResponse(GoalCreate):
    id: str

    class Config:
        from_attributes = True

# HETO ANG IDADAGDAG NATIN PAPS:
class GoalDeposit(BaseModel):
    amount: float
    account: str  # Dito natin sasabihin kung Cash, GCash, o Bank ang ginamit