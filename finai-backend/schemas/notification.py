from datetime import datetime
from pydantic import BaseModel


class NotificationResponse(BaseModel):
    id: str
    user_id: str
    budget_id: str
    category_id: str
    period_key: str
    threshold: int
    channel: str = "in_app"
    level: str
    message: str
    is_read: bool = False
    created_at: datetime

    class Config:
        from_attributes = True
