from pydantic import BaseModel
from typing import Optional

class GoalTypeCreate(BaseModel):
    name: str
    icon: Optional[str] = None  # Sasaluhin ang emoji mula sa frontend

class GoalTypeResponse(BaseModel):
    id: str
    name: str
    icon: Optional[str] = None  # Ipapasa ang emoji pabalik sa frontend list
    is_archived: bool = False   # NEW: drives the Active/Archived split in goal-types.tsx

    class Config:
        from_attributes = True