from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database.database import get_db
from app.models.models import Prediction, Patient, Appointment, User
from app.schemas.predictions import PredictionRequest, PredictionOut
from app.ml.ml_service import ml_service
from app.services.recommendation import get_doctor_recommendations
from app.auth.dependencies import get_current_user
from app.core.rate_limiter import limiter

router = APIRouter(tags=["predictions"])

# Helper function to check if a doctor is assigned to a patient
def is_doctor_assigned(db: Session, doctor_id: int, patient_id: int) -> bool:
    appointment = db.query(Appointment).filter(
        Appointment.patient_id == patient_id,
        Appointment.doctor_id == doctor_id
    ).first()
    return appointment is not None

@router.post("/predictions/{patient_id}", response_model=PredictionOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def run_prediction(
    patient_id: int,
    req: PredictionRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Ensure patient exists
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found"
        )
        
    # Access Control Check
    if current_user.role == "admin":
        pass
    elif current_user.role == "doctor":
        pass
    elif current_user.role == "patient":
        if patient.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You can only run predictions for yourself."
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized access"
        )
        
    # Run ML Inference
    try:
        inference_result = ml_service.predict(
            pregnancies=req.pregnancies,
            glucose=req.glucose,
            blood_pressure=req.blood_pressure,
            insulin=req.insulin,
            bmi=req.bmi,
            age=req.age
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Prediction service failure: {str(e)}"
        )
        
    risk_score = inference_result["risk_score"]
    prediction_label = inference_result["prediction"]
    feature_contributions = inference_result.get("feature_contributions", {})
    
    # Run Stage 5 Doctor Recommendation Rule Engine
    recommendations = get_doctor_recommendations(
        risk_score=risk_score,
        glucose=req.glucose,
        blood_pressure=req.blood_pressure,
        bmi=req.bmi
    )
    
    # Map input features to dictionary
    input_features_dict = {
        "pregnancies": req.pregnancies,
        "glucose": req.glucose,
        "blood_pressure": req.blood_pressure,
        "insulin": req.insulin,
        "bmi": req.bmi,
        "age": req.age
    }
    
    # Persist prediction in DB (model-agnostic using JSON features column)
    db_prediction = Prediction(
        patient_id=patient_id,
        model_name="Pima Indians Diabetes",
        input_features=input_features_dict,
        feature_contributions=feature_contributions,
        risk_score=risk_score,
        prediction=prediction_label
    )
    
    db.add(db_prediction)
    db.commit()
    db.refresh(db_prediction)
    
    # Build schema output including recommendations list
    return PredictionOut(
        id=db_prediction.id,
        patient_id=db_prediction.patient_id,
        model_name=db_prediction.model_name,
        input_features=db_prediction.input_features,
        feature_contributions=db_prediction.feature_contributions,
        risk_score=db_prediction.risk_score,
        prediction=db_prediction.prediction,
        created_at=db_prediction.created_at,
        recommendations=recommendations
    )

@router.get("/patients/{patient_id}/predictions", response_model=List[PredictionOut])
def read_patient_predictions(
    patient_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Ensure patient exists
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found"
        )
        
    # Access Control Check
    if current_user.role == "admin":
        pass
    elif current_user.role == "doctor":
        pass
    elif current_user.role == "patient":
        if patient.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You can only view your own predictions."
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized access"
        )
        
    predictions = db.query(Prediction).filter(Prediction.patient_id == patient_id).all()
    
    # Build output objects, dynamically running the recommendation rule engine
    results = []
    for pred in predictions:
        features = pred.input_features
        # Run recommendation rule engine based on saved parameters
        recommendations = get_doctor_recommendations(
            risk_score=pred.risk_score,
            glucose=features.get("glucose", 0.0),
            blood_pressure=features.get("blood_pressure", 0.0),
            bmi=features.get("bmi", 0.0)
        )
        
        # Fallback calculation if not stored (e.g. for older prediction log items)
        contribs = pred.feature_contributions
        if not contribs and features:
            try:
                row = [
                    float(features.get("pregnancies", 0.0)),
                    float(features.get("glucose", 0.0)),
                    float(features.get("blood_pressure", 0.0)),
                    float(features.get("insulin", 0.0)),
                    float(features.get("bmi", 0.0)),
                    float(features.get("age", 0.0))
                ]
                contribs = ml_service.model.explain_prediction(row)
            except Exception:
                contribs = None
                
        results.append(PredictionOut(
            id=pred.id,
            patient_id=pred.patient_id,
            model_name=pred.model_name,
            input_features=pred.input_features,
            feature_contributions=contribs,
            risk_score=pred.risk_score,
            prediction=pred.prediction,
            created_at=pred.created_at,
            recommendations=recommendations
        ))
        
    return results

@router.get("/forecast")
async def get_risk_forecast(
    months_ahead: int = 3,
    patient_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns risk score forecast for the current patient.
    Doctors/admins can pass ?patient_id=X to forecast 
    for a specific patient.
    """
    # Determine the target patient
    if patient_id is not None:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient not found"
            )
        # Access control Check
        if current_user.role == "admin":
            pass
        elif current_user.role == "doctor":
            if not is_doctor_assigned(db, current_user.id, patient.id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied. You are not assigned to this patient."
                )
        elif current_user.role == "patient":
            if patient.user_id != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied. You can only view your own forecast."
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized access"
            )
    else:
        # If no patient_id provided, default to current patient if the user is a patient
        if current_user.role == "patient":
            patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
            if not patient:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Patient profile not found"
                )
        else:
            # Doctors/Admins must specify patient_id
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="patient_id parameter is required for doctor/admin roles"
            )
            
    # Query full prediction history for this patient
    predictions = db.query(Prediction)\
        .filter(Prediction.patient_id == patient.id)\
        .order_by(Prediction.created_at.asc())\
        .all()
    
    # Convert to list of dicts for forecasting service
    history = [
        {
            "risk_score": p.risk_score,
            "created_at": p.created_at
        }
        for p in predictions
    ]
    
    # Clamp months_ahead between 1 and 6
    months_ahead = max(1, min(6, months_ahead))
    
    from app.services.forecasting import generate_forecast
    forecast = generate_forecast(history, months_ahead)
    
    return forecast
