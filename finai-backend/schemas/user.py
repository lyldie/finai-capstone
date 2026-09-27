from pydantic import BaseModel
from typing import Optional

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    is_archived: bool = False  # NEW: drives the Active/Archived split in users.tsx

    class Config:
        from_attributes = True