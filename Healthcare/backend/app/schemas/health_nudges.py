from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class HealthNudgeBase(BaseModel):
    type: str
    title: str
    message: str
    priority: str = "low"
    status: str = "unread"
    scheduled_for: Optional[datetime] = None
    metadata_json: Optional[str] = None

class HealthNudgeCreate(HealthNudgeBase):
    patient_id: int

class HealthNudgeUpdate(BaseModel):
    status: Optional[str] = None
    read_at: Optional[datetime] = None
    dismissed_at: Optional[datetime] = None

class HealthNudgeResponse(HealthNudgeBase):
    id: int
    patient_id: int
    created_at: datetime
    read_at: Optional[datetime] = None
    dismissed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
