from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class MedicalHistoryBase(BaseModel):
    disease: str = Field(..., min_length=2, description="Name of the disease or diagnosis")
    diagnosis_date: datetime
    medications: Optional[str] = None
    notes: Optional[str] = None

class MedicalHistoryCreate(MedicalHistoryBase):
    pass

class MedicalHistoryUpdate(BaseModel):
    disease: Optional[str] = None
    diagnosis_date: Optional[datetime] = None
    medications: Optional[str] = None
    notes: Optional[str] = None

class MedicalHistoryOut(MedicalHistoryBase):
    id: int
    public_id: str
    patient_id: int

    class Config:
        from_attributes = True
