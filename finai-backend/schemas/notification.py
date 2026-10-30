from datetime import datetime
from pydantic import BaseModel


class NotificationResponse(BaseModel):
    id: str
    user_id: str
    budget_id: str | None = None
    category_id: str | None = None
    category_name: str | None = None
    period_key: str | None = None
    event_type: str = "budget_threshold"
    title: str | None = None
    threshold: int = 0
    percentage_used: float | None = None
    current_amount: float | None = None
    baseline_amount: float | None = None
    change_amount: float | None = None
    change_percent: float | None = None
    channel: str = "in_app"
    level: str
    message: str
    is_read: bool = False
    created_at: datetime

    class Config:
        from_attributes = True
