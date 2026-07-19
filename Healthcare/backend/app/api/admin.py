from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.database.database import get_db
from app.models.models import User, Patient, Appointment, LabReport, Prediction, UserSubscription
from app.schemas.schemas import (AdminUserCreate, AdminUserResponse, AdminStatsResponse, AdminAssignRequest, PaginatedEnvelope)
from app.schemas.subscription import UpgradeRequest
from app.services.subscription_service import process_subscription_upgrade, process_subscription_cancel
from app.auth.dependencies import require_role, get_current_user
from app.auth.security import get_password_hash
from datetime import datetime, time, timedelta
from typing import List, Optional

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[require_role("admin")]
)

@router.get("/stats", response_model=AdminStatsResponse)
def get_stats(db: Session = Depends(get_db)):
    total_patients = db.query(User).filter(User.role == "patient").count()
    total_doctors = db.query(User).filter(User.role == "doctor").count()
    total_predictions = db.query(Prediction).count()
    high_risk_count = db.query(Prediction).filter(Prediction.prediction == "High Risk").count()
    
    # Calculate appointments today
    today = datetime.utcnow().date()
    start_of_today = datetime.combine(today, time.min)
    end_of_today = datetime.combine(today, time.max)
    total_appointments_today = db.query(Appointment).filter(
        Appointment.scheduled_at >= start_of_today,
        Appointment.scheduled_at <= end_of_today
    ).count()
    
    total_reports = db.query(LabReport).count()
    
    return {
        "total_patients": total_patients,
        "total_doctors": total_doctors,
        "total_predictions": total_predictions,
        "high_risk_count": high_risk_count,
        "total_appointments_today": total_appointments_today,
        "total_reports": total_reports
    }

@router.get("/users", response_model=PaginatedEnvelope[AdminUserResponse])
def get_users(
    role: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=100),
    skip: int = Query(default=0, ge=0),
    db: Session = Depends(get_db)
):
    query = db.query(User)
    
    if role:
        query = query.filter(User.role == role)
        
    if search:
        query = query.filter(User.name.ilike(f"%{search}%"))
        
    total = query.count()
    users = query.offset(skip).limit(limit).all()
    results = []
    
    for user in users:
        risk_score = None
        prediction_date = None
        patient_count = None
        
        if user.role == "patient":
            patient = db.query(Patient).filter(Patient.user_id == user.id).first()
            if patient:
                latest_pred = db.query(Prediction).filter(
                    Prediction.patient_id == patient.id
                ).order_by(Prediction.created_at.desc()).first()
                if latest_pred:
                    risk_score = latest_pred.risk_score
                    prediction_date = latest_pred.created_at
        elif user.role == "doctor":
            patient_count = db.query(Appointment.patient_id).filter(
                Appointment.doctor_id == user.id
            ).distinct().count()
            
        results.append({
            "id": user.id,
            "full_name": user.name,
            "email": user.email,
            "role": user.role,
            "is_active": user.is_active,
            "created_at": user.created_at,
            "risk_score": risk_score,
            "prediction_date": prediction_date,
            "patient_count": patient_count
        })
        
    return {
        "items": results,
        "total": total,
        "limit": limit,
        "skip": skip
    }

@router.post("/users", response_model=AdminUserResponse)
def create_user(
    user_in: AdminUserCreate,
    db: Session = Depends(get_db)
):
    if user_in.role not in ["patient", "doctor"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role must be either 'patient' or 'doctor'"
        )
        
    # Check if email exists
    existing_user = db.query(User).filter(User.email == user_in.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
        
    # Create user
    db_user = User(
        name=user_in.full_name,
        email=user_in.email,
        password_hash=get_password_hash(user_in.password),
        role=user_in.role,
        is_active=True
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    # If role is patient, initialize their patient profile
    if user_in.role == "patient":
        db_patient = Patient(user_id=db_user.id)
        db.add(db_patient)
        db.commit()
        
    return {
        "id": db_user.id,
        "full_name": db_user.name,
        "email": db_user.email,
        "role": db_user.role,
        "is_active": db_user.is_active,
        "created_at": db_user.created_at,
        "risk_score": None,
        "prediction_date": None,
        "patient_count": None if user_in.role == "patient" else 0
    }

@router.patch("/users/{user_id}/status", response_model=AdminUserResponse)
def toggle_user_status(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin cannot suspend themselves"
        )
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
        
    user.is_active = not user.is_active
    if not user.is_active:
        user.suspended_at = datetime.utcnow()
    else:
        user.suspended_at = None
    db.commit()
    db.refresh(user)
    
    risk_score = None
    prediction_date = None
    patient_count = None
    
    if user.role == "patient":
        patient = db.query(Patient).filter(Patient.user_id == user.id).first()
        if patient:
            latest_pred = db.query(Prediction).filter(
                Prediction.patient_id == patient.id
            ).order_by(Prediction.created_at.desc()).first()
            if latest_pred:
                risk_score = latest_pred.risk_score
                prediction_date = latest_pred.created_at
    elif user.role == "doctor":
        patient_count = db.query(Appointment.patient_id).filter(
            Appointment.doctor_id == user.id
        ).distinct().count()
        
    return {
        "id": user.id,
        "full_name": user.name,
        "email": user.email,
        "role": user.role,
        "is_active": user.is_active,
        "created_at": user.created_at,
        "risk_score": risk_score,
        "prediction_date": prediction_date,
        "patient_count": patient_count
    }

@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin cannot delete themselves"
        )
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
        
    db.delete(user)
    db.commit()
    return {"status": "success", "message": "User deleted successfully"}

@router.get("/assignments")
def get_assignments(
    limit: int = Query(default=50, ge=1, le=100),
    skip: int = Query(default=0, ge=0),
    db: Session = Depends(get_db)
):
    query = db.query(Patient)
    total = query.count()
    patients = query.offset(skip).limit(limit).all()
    results = []
    
    for patient in patients:
        user = db.query(User).filter(User.id == patient.user_id).first()
        if not user:
            continue
            
        latest_appt = db.query(Appointment).filter(
            Appointment.patient_id == patient.id
        ).order_by(Appointment.scheduled_at.desc()).first()
        
        assigned_doctor_id = None
        assigned_doctor_name = None
        
        if latest_appt:
            doctor = db.query(User).filter(User.id == latest_appt.doctor_id).first()
            if doctor:
                assigned_doctor_id = doctor.id
                assigned_doctor_name = doctor.name
                
        results.append({
            "patient_id": patient.id,
            "patient_name": user.name,
            "assigned_doctor_id": assigned_doctor_id,
            "assigned_doctor_name": assigned_doctor_name
        })
        
    return {
        "items": results,
        "total": total,
        "limit": limit,
        "skip": skip
    }

@router.post("/assignments")
def assign_patient(
    req: AdminAssignRequest,
    db: Session = Depends(get_db)
):
    patient = db.query(Patient).filter(Patient.id == req.patient_id).first()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found"
        )
        
    doctor = db.query(User).filter(
        User.id == req.doctor_id,
        User.role == "doctor"
    ).first()
    if not doctor:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Doctor not found or invalid role"
        )
        
    existing_appt = db.query(Appointment).filter(
        Appointment.patient_id == req.patient_id
    ).first()
    
    if existing_appt:
        existing_appt.doctor_id = req.doctor_id
    else:
        new_appt = Appointment(
            patient_id=req.patient_id,
            doctor_id=req.doctor_id,
            scheduled_at=datetime.utcnow() + timedelta(days=7),
            status="Scheduled",
            notes="Admin assigned consultation"
        )
        db.add(new_appt)
        
    db.commit()
    return {"status": "success", "message": "Patient assigned to doctor successfully"}

@router.get("/subscriptions")
def get_admin_subscriptions(
    role: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=100),
    skip: int = Query(default=0, ge=0),
    db: Session = Depends(get_db)
):
    """Fetches all users and their active subscription status for Admin management."""
    query = db.query(User)
    if role and role.strip():
        query = query.filter(User.role == role.strip())
    if search and search.strip():
        s = f"%{search.strip()}%"
        query = query.filter((User.name.ilike(s)) | (User.email.ilike(s)))

    total = query.count()
    users = query.offset(skip).limit(limit).all()

    items = []
    for u in users:
        sub = db.query(UserSubscription).filter(
            UserSubscription.user_id == u.id,
            UserSubscription.status == "active"
        ).order_by(UserSubscription.start_date.desc(), UserSubscription.id.desc()).first()

        default_tier = "Doc_Free" if u.role == "doctor" else "Free"
        items.append({
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "subscription_tier": u.subscription_tier or default_tier,
            "status": sub.status if sub else "active",
            "start_date": sub.start_date.isoformat() if (sub and sub.start_date) else (u.created_at.isoformat() if u.created_at else None),
            "end_date": sub.end_date.isoformat() if (sub and sub.end_date) else None,
            "payment_method": sub.payment_method if sub else None
        })

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "skip": skip
    }

@router.post("/subscriptions/{user_id}/upgrade")
def admin_upgrade_user_subscription(
    user_id: int,
    req: UpgradeRequest,
    db: Session = Depends(get_db)
):
    """Allows Admin to manually upgrade/change subscription tier for any user."""
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")

    valid_codes = ["Free", "Pro", "Clinical", "Doc_Free", "Doc_Professional", "Doc_Clinical_Plus"]
    if req.plan_code not in valid_codes:
        raise HTTPException(status_code=400, detail="Invalid subscription plan code.")

    target_code = req.plan_code
    if target_user.role == "doctor":
        if target_code == "Pro":
            target_code = "Doc_Professional"
        elif target_code == "Clinical":
            target_code = "Doc_Clinical_Plus"
        elif target_code == "Free":
            target_code = "Doc_Free"

    user, sub_rec = process_subscription_upgrade(
        user=target_user,
        plan_code=target_code,
        payment_method=req.payment_method or "admin_override",
        payment_id=req.payment_id or f"admin_tx_{target_code.lower()}_{user_id}",
        db=db
    )

    return {
        "status": "success",
        "message": f"Successfully updated subscription for {user.name} to {target_code}.",
        "user_id": user.id,
        "subscription_tier": user.subscription_tier
    }

@router.post("/subscriptions/{user_id}/cancel")
def admin_cancel_user_subscription(
    user_id: int,
    db: Session = Depends(get_db)
):
    """Allows Admin to manually cancel active subscription for any user."""
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")

    user = process_subscription_cancel(user=target_user, db=db)
    return {
        "status": "success",
        "message": f"Successfully cancelled subscription for {user.name}.",
        "user_id": user.id,
        "subscription_tier": user.subscription_tier
    }
