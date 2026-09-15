from pydantic import BaseModel
from typing import Optional

class AccountCreate(BaseModel):
    name: str
    initial_balance: float = 0.0  
    icon: Optional[str] = "wallet" 
    user_id: Optional[str] = None
    account_role: Optional[str] = "user" 
    parent_template_id: Optional[str] = None

class AccountResponse(BaseModel):
    id: str
    name: str
    initial_balance: float = 0.0
    current_balance: float = 0.0 # 👈 Idinagdag natin para sa live wallet balance
    icon: Optional[str] = "wallet"
    user_id: Optional[str] = None
    account_role: Optional[str] = "admin"
    parent_template_id: Optional[str] = None

    class Config:
        from_attributes = True