from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import json

from app.database.database import get_db
from app.models.models import HeartPrediction, Patient, Appointment, User
from app.schemas.heart_predictions import HeartPredictionCreate, HeartPredictionResponse, HeartPredictionHistory
from app.auth.dependencies import get_current_user, require_heart_prediction_slot
from app.ml.ml_service import heart_ml_service

router = APIRouter(prefix="/heart", tags=["heart"])

@router.get("/status")
def get_heart_status():
    return {"available": heart_ml_service.available}

@router.post("/predict", response_model=HeartPredictionResponse)
async def predict_heart_disease(
    data: HeartPredictionCreate,
    patient_id: Optional[int] = Query(None),
    slot_user: User = Depends(require_heart_prediction_slot),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not heart_ml_service.available:
        raise HTTPException(
            status_code=533,
            detail="Heart disease model not available. Please contact administrator."
        )
    
    if current_user.role == "patient":
        target_patient_user_id = current_user.id
    elif current_user.role in ["doctor", "admin"]:
        if not patient_id:
            raise HTTPException(status_code=400, detail="patient_id query parameter is required for doctor/admin requests")
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        if current_user.role == "doctor":
            # Verify assignment
            appointment = db.query(Appointment).filter(
                Appointment.patient_id == patient.id,
                Appointment.doctor_id == current_user.id
            ).first()
            if not appointment:
                raise HTTPException(status_code=403, detail="Not authorized to run predictions for this patient")
        
        target_patient_user_id = patient.user_id
    else:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Calculate BMI
    height_m = data.height / 100
    bmi = round(data.weight / (height_m ** 2), 2)
    
    # Build feature array in correct order
    features = [
        data.age_years, data.gender, data.height,
        data.weight, data.ap_hi, data.ap_lo,
        data.cholesterol, data.gluc, data.smoke,
        data.alco, data.active
    ]
    
    # Run prediction
    try:
        result = heart_ml_service.predict(features)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {str(e)}"
        )
    
    # Referral recommendation
    referral = None
    if result["risk_level"] == "High":
        referral = "Cardiologist consultation strongly recommended"
    elif result["risk_level"] == "Medium":
        referral = "Consider consultation with a Cardiologist"
    
    # Save to database
    prediction = HeartPrediction(
        patient_id=target_patient_user_id,
        age_years=data.age_years,
        gender=data.gender,
        height=data.height,
        weight=data.weight,
        ap_hi=data.ap_hi,
        ap_lo=data.ap_lo,
        cholesterol=data.cholesterol,
        gluc=data.gluc,
        smoke=data.smoke,
        alco=data.alco,
        active=data.active,
        bmi_calculated=bmi,
        risk_score=result["risk_score"],
        risk_level=result["risk_level"],
        confidence_lower=result["confidence_lower"],
        confidence_upper=result["confidence_upper"],
        feature_contributions=json.dumps(
            result["feature_contributions"]
        ),
        referral_recommendation=referral
    )
    db.add(prediction)
    db.commit()
    db.refresh(prediction)
    
    return prediction

@router.get("/history", response_model=HeartPredictionHistory)
async def get_heart_prediction_history(
    limit: int = Query(default=10, ge=1, le=50),
    skip: int = Query(default=0, ge=0),
    patient_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(HeartPrediction)
    
    if current_user.role == "patient":
        query = query.filter(
            HeartPrediction.patient_id == current_user.id
        )
    elif current_user.role == "doctor":
        if patient_id:
            patient = db.query(Patient).filter(Patient.id == patient_id).first()
            if not patient:
                raise HTTPException(status_code=404, detail="Patient not found")
            appointment = db.query(Appointment).filter(
                Appointment.patient_id == patient.id,
                Appointment.doctor_id == current_user.id
            ).first()
            if not appointment:
                raise HTTPException(status_code=403, detail="Not authorized to access this patient's records.")
            query = query.filter(HeartPrediction.patient_id == patient.user_id)
        else:
            assigned_user_ids = db.query(Patient.user_id).filter(Patient.id.in_(
                db.query(Appointment.patient_id).filter(Appointment.doctor_id == current_user.id).subquery()
            )).subquery()
            query = query.filter(HeartPrediction.patient_id.in_(assigned_user_ids))
    elif current_user.role == "admin":
        if patient_id:
            patient = db.query(Patient).filter(Patient.id == patient_id).first()
            if not patient:
                raise HTTPException(status_code=404, detail="Patient not found")
            query = query.filter(HeartPrediction.patient_id == patient.user_id)
    else:
        raise HTTPException(
            status_code=403,
            detail="Access denied: insufficient permissions"
        )
    
    total = query.count()
    predictions = query\
        .order_by(HeartPrediction.created_at.desc())\
        .offset(skip)\
        .limit(limit)\
        .all()
    
    return {"predictions": predictions, "total": total}
