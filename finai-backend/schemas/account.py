from pydantic import BaseModel
from typing import Optional

class AccountCreate(BaseModel):
    name: str
    initial_balance: float = 0.0  # Idinagdag para sa paunang pera sa wallet
    icon: Optional[str] = "wallet" # Idinagdag para sa icon ng GCash/Bank sa UI
    user_id: Optional[str] = None
    account_role: Optional[str] = "user" # Ginawang default "user" kapag custom gawa ng tao

class AccountResponse(BaseModel):
    id: str
    name: str
    initial_balance: float = 0.0
    icon: Optional[str] = "wallet"
    user_id: Optional[str] = None
    account_role: Optional[str] = "admin"

    class Config:
        from_attributes = True