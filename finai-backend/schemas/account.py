from pydantic import BaseModel, Field, field_validator
from typing import Optional
from schemas.money import require_cent_precision

class AccountCreate(BaseModel):
    name: str
    initial_balance: float = Field(default=0.0, ge=0, allow_inf_nan=False)
    icon: Optional[str] = "wallet"
    user_id: Optional[str] = None
    account_role: Optional[str] = "user"
    parent_template_id: Optional[str] = None

    @field_validator("initial_balance", mode="before")
    @classmethod
    def opening_balance_has_cent_precision(cls, value):
        return require_cent_precision(value, "Opening balance")

class AccountResponse(BaseModel):
    id: str
    name: str
    initial_balance: float = 0.0
    current_balance: float = 0.0
    icon: Optional[str] = "wallet"
    user_id: Optional[str] = None
    account_role: Optional[str] = "admin"
    parent_template_id: Optional[str] = None
    is_archived: bool = False  # NEW: drives the Active/Archived split in accounts.tsx

    class Config:
        from_attributes = True
