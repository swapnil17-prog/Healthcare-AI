from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional
from datetime import datetime
from app.services.sanitizer import sanitize_name

# --- Token Schemas ---
class Token(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str
    role: str

class TokenData(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None

# --- User Schemas ---
class UserBase(BaseModel):
    name: str
    email: EmailStr

class UserCreate(UserBase):
    password: str = Field(..., min_length=6, description="Password must be at least 6 characters long")
    role: str = Field("patient", description="Role must be patient, doctor, or admin")

    @validator("name")
    def sanitize_user_name(cls, v):
        return sanitize_name(v)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserOut(UserBase):
    id: int
    role: str
    created_at: datetime

    class Config:
        from_attributes = True

# --- Patient Base (to link when registering patient profile if desired) ---
class PatientBase(BaseModel):
    age: Optional[int] = None
    gender: Optional[str] = None
    height: Optional[float] = None
    weight: Optional[float] = None
    blood_group: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

class PatientOut(PatientBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True


# --- Admin Panel Schemas ---
class AdminUserCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str = Field(..., min_length=6, description="Password must be at least 6 characters long")
    role: str = Field(..., description="Role must be patient or doctor")

    @validator("full_name")
    def sanitize_full_name(cls, v):
        return sanitize_name(v)

class AdminUserResponse(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    role: str
    is_active: bool
    created_at: datetime
    risk_score: Optional[float] = None
    prediction_date: Optional[datetime] = None
    patient_count: Optional[int] = None

    class Config:
        from_attributes = True

class AdminStatsResponse(BaseModel):
    total_patients: int
    total_doctors: int
    total_predictions: int
    high_risk_count: int
    total_appointments_today: int
    total_reports: int

class AdminAssignRequest(BaseModel):
    patient_id: int
    doctor_id: int

from typing import Generic, TypeVar, List

T = TypeVar('T')

class PaginatedEnvelope(BaseModel, Generic[T]):
    items: List[T]
    total: int
    limit: int
    skip: int

    class Config:
        from_attributes = True
