from pydantic import BaseModel

class GoalTypeCreate(BaseModel):
    name: str

class GoalTypeResponse(BaseModel):
    id: str
    name: str
    is_archived: bool = False  # NEW: drives the Active/Archived split in goal-types.tsx

    class Config:
        from_attributes = True