from pydantic import BaseModel

class GoalTypeCreate(BaseModel):
    name: str

class GoalTypeResponse(BaseModel):
    id: str
    name: str

    # Dapat nakapasok ito sa loob ng Response class paps!
    class Config:
        from_attributes = True