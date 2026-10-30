from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator

from schemas.money import require_cent_precision


class FixedBillCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    category_id: str
    amount: float = Field(..., gt=0, allow_inf_nan=False)
    due_day: int = Field(..., ge=1, le=31)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Bill name cannot be blank.")
        return value

    @field_validator("amount", mode="before")
    @classmethod
    def validate_amount(cls, value):
        return require_cent_precision(value, "Bill amount")


class FixedBillUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    category_id: str | None = None
    amount: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    due_day: int | None = Field(default=None, ge=1, le=31)
    is_active: bool | None = None

    @field_validator("amount", mode="before")
    @classmethod
    def validate_amount(cls, value):
        return None if value is None else require_cent_precision(value, "Bill amount")

