from pydantic import BaseModel, Field, validator
from typing import Optional
from datetime import datetime
from app.services.sanitizer import sanitize_notes

class AppointmentBase(BaseModel):
    scheduled_at: datetime
    status: Optional[str] = Field("Scheduled", description="Scheduled, Completed, Cancelled")
    notes: Optional[str] = None

    @validator("notes", pre=True)
    def sanitize_appointment_notes(cls, v):
        if v is None:
            return v
        return sanitize_notes(v)

class AppointmentCreate(AppointmentBase):
    patient_id: int
    doctor_id: int


class AppointmentOut(AppointmentBase):
    id: int
    public_id: str
    patient_id: int
    doctor_id: int

    class Config:
        from_attributes = True


class AppointmentUpdate(BaseModel):
    scheduled_at: Optional[datetime] = None
    status: Optional[str] = Field(None, description="Scheduled, Accepted, Rejected, Rescheduled, Completed, Cancelled")
    notes: Optional[str] = None

    @validator("notes", pre=True)
    def sanitize_appointment_notes(cls, v):
        if v is None:
            return v
        return sanitize_notes(v)

