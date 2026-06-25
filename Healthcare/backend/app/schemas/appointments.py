from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class AppointmentBase(BaseModel):
    scheduled_at: datetime
    status: Optional[str] = Field("Scheduled", description="Scheduled, Completed, Cancelled")
    notes: Optional[str] = None

class AppointmentCreate(AppointmentBase):
    patient_id: int
    doctor_id: int


class AppointmentOut(AppointmentBase):
    id: int
    patient_id: int
    doctor_id: int

    class Config:
        from_attributes = True


class AppointmentUpdate(BaseModel):
    scheduled_at: Optional[datetime] = None
    status: Optional[str] = Field(None, description="Scheduled, Accepted, Rejected, Rescheduled, Completed, Cancelled")
    notes: Optional[str] = None

