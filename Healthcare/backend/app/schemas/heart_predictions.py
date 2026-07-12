from pydantic import BaseModel, Field, validator
from datetime import datetime
from typing import List, Optional

class HeartPredictionCreate(BaseModel):
    age_years: float = Field(..., ge=18, le=100)
    gender: int = Field(..., ge=1, le=2)
    height: float = Field(..., ge=100, le=250)
    weight: float = Field(..., ge=30, le=200)
    ap_hi: int = Field(..., ge=60, le=250)
    ap_lo: int = Field(..., ge=40, le=180)
    cholesterol: int = Field(..., ge=1, le=3)
    gluc: int = Field(..., ge=1, le=3)
    smoke: int = Field(..., ge=0, le=1)
    alco: int = Field(..., ge=0, le=1)
    active: int = Field(..., ge=0, le=1)
    
    @validator("ap_lo")
    def diastolic_less_than_systolic(cls, v, values):
        if "ap_hi" in values and v >= values["ap_hi"]:
            raise ValueError(
                "Diastolic BP must be less than systolic BP"
            )
        return v

class HeartPredictionResponse(BaseModel):
    id: int
    public_id: str
    risk_score: float
    risk_level: str
    confidence_lower: Optional[float] = None
    confidence_upper: Optional[float] = None
    feature_contributions: Optional[dict] = None
    referral_recommendation: Optional[str] = None
    bmi_calculated: float
    created_at: datetime
    
    @validator("feature_contributions", pre=True)
    def parse_json_string(cls, v):
        if isinstance(v, str):
            import json
            try:
                return json.loads(v)
            except Exception:
                return {}
        return v
    
    class Config:
        from_attributes = True

class HeartPredictionHistory(BaseModel):
    predictions: List[HeartPredictionResponse]
    total: int
