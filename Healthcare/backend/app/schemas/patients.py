from pydantic import BaseModel, Field, validator
from typing import Optional
from app.schemas.schemas import UserOut
from app.services.sanitizer import sanitize_text

class PatientBase(BaseModel):
    age: Optional[int] = Field(None, ge=0, le=150)
    gender: Optional[str] = Field(None, max_length=20)
    height: Optional[float] = Field(None, ge=0, le=300, description="Height in cm")
    weight: Optional[float] = Field(None, ge=0, le=500, description="Weight in kg")
    blood_group: Optional[str] = Field(None, max_length=10)
    phone: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = Field(None, max_length=200)

    @validator("address", pre=True)
    def sanitize_address(cls, v):
        if v is None:
            return v
        return sanitize_text(v, max_length=200)

class PatientUpdate(PatientBase):
    pass

class PatientOut(PatientBase):
    id: int
    user_id: int
    user: UserOut

    class Config:
        from_attributes = True
