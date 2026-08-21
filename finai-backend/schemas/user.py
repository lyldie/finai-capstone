# finai-backend/schemas/user.py
from pydantic import BaseModel
from typing import Optional

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str

    class Config:
        from_attributes = True