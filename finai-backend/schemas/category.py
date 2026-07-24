from pydantic import BaseModel
from typing import Optional

class CategoryCreate(BaseModel):
    name: str
    type: str                    # "income" o "expense"
    category_role: str = "user"  # Default natin ay "user" para hindi mo kailangan i-set kada gawa
    user_id: Optional[str] = None # Optional ito, pero required kung ang role ay "user"
    icon: Optional[str] = None

class CategoryResponse(BaseModel):
    id: str
    name: str
    type: str
    category_role: str = "user"
    user_id: Optional[str] = None
    icon: Optional[str] = None

    class Config:
        from_attributes = True