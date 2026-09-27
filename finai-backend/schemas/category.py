from pydantic import BaseModel
from typing import Optional

class CategoryCreate(BaseModel):
    name: str
    type: str
    category_role: str = "user"
    user_id: Optional[str] = None
    icon: Optional[str] = None

class CategoryResponse(BaseModel):
    id: str
    name: str
    type: str
    category_role: str = "user"
    user_id: Optional[str] = None
    icon: Optional[str] = None
    is_archived: bool = False  # NEW: drives the Active/Archived split in categories.tsx

    class Config:
        from_attributes = True