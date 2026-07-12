from pydantic import BaseModel, Field, validator
from typing import Optional
from datetime import datetime
from app.services.sanitizer import sanitize_text

class MedicalHistoryBase(BaseModel):
    disease: str = Field(..., min_length=2, description="Name of the disease or diagnosis")
    diagnosis_date: datetime
    medications: Optional[str] = None
    notes: Optional[str] = None

    @validator("disease", "medications", "notes", pre=True)
    def sanitize_medical_fields(cls, v):
        if v is None:
            return v
        return sanitize_text(v, max_length=500)

class MedicalHistoryCreate(MedicalHistoryBase):
    pass

class MedicalHistoryUpdate(BaseModel):
    disease: Optional[str] = None
    diagnosis_date: Optional[datetime] = None
    medications: Optional[str] = None
    notes: Optional[str] = None

    @validator("disease", "medications", "notes", pre=True)
    def sanitize_medical_fields(cls, v):
        if v is None:
            return v
        return sanitize_text(v, max_length=500)

class MedicalHistoryOut(MedicalHistoryBase):
    id: int
    public_id: str
    patient_id: int

    class Config:
        from_attributes = True
