from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional
from app.database.database import get_db
from app.models.models import HealthNudge, Patient, User, Appointment
from app.schemas.health_nudges import HealthNudgeResponse
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/health-nudges", tags=["health-nudges"])

def is_doctor_assigned(db: Session, doctor_id: int, patient_id: int) -> bool:
    appointment = db.query(Appointment).filter(
        Appointment.patient_id == patient_id,
        Appointment.doctor_id == doctor_id
    ).first()
    return appointment is not None

@router.get("", response_model=List[HealthNudgeResponse])
def get_health_nudges(
    status: Optional[str] = None,
    limit: int = 20,
    patient_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if patient_id is not None:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            raise HTTPException(
                status_code=404,
                detail="Patient not found"
            )
        # Check permissions
        if current_user.role == "admin":
            pass
        elif current_user.role == "doctor":
            if not is_doctor_assigned(db, current_user.id, patient.id):
                raise HTTPException(
                    status_code=403,
                    detail="Access denied. You are not assigned to this patient."
                )
        elif current_user.role == "patient":
            if patient.user_id != current_user.id:
                raise HTTPException(
                    status_code=403,
                    detail="Access denied. You cannot view another patient's nudges."
                )
        else:
            raise HTTPException(
                status_code=403,
                detail="Unauthorized access"
            )
    else:
        # Default to current patient if user is a patient
        if current_user.role == "patient":
            patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
            if not patient:
                raise HTTPException(
                    status_code=404,
                    detail="Patient profile not found"
                )
        else:
            # Doctor/Admin must pass patient_id
            raise HTTPException(
                status_code=400,
                detail="patient_id is required for doctor/admin roles"
            )

    query = db.query(HealthNudge).filter(HealthNudge.patient_id == patient.id)
    if status:
        query = query.filter(HealthNudge.status == status)
        
    from sqlalchemy import desc
    query = query.order_by(desc(HealthNudge.status == "unread"), desc(HealthNudge.created_at))
    
    return query.limit(limit).all()

@router.patch("/{nudge_id}/read", response_model=HealthNudgeResponse)
def read_health_nudge(
    nudge_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    nudge = db.query(HealthNudge).filter(HealthNudge.id == nudge_id).first()
    if not nudge:
        raise HTTPException(
            status_code=404,
            detail="Health nudge not found"
        )
        
    # Check ownership
    patient = db.query(Patient).filter(Patient.id == nudge.patient_id).first()
    if not patient:
        raise HTTPException(
            status_code=404,
            detail="Patient not found"
        )
        
    if current_user.role == "patient":
        if patient.user_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied. This is not your nudge."
            )
    elif current_user.role == "doctor":
        if not is_doctor_assigned(db, current_user.id, patient.id):
            raise HTTPException(
                status_code=403,
                detail="Access denied. You are not assigned to this patient."
            )
    elif current_user.role == "admin":
        pass
    else:
        raise HTTPException(
            status_code=403,
            detail="Unauthorized access"
        )
        
    nudge.status = "read"
    nudge.read_at = datetime.utcnow()
    db.commit()
    db.refresh(nudge)
    return nudge

@router.patch("/{nudge_id}/dismiss", response_model=HealthNudgeResponse)
def dismiss_health_nudge(
    nudge_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    nudge = db.query(HealthNudge).filter(HealthNudge.id == nudge_id).first()
    if not nudge:
        raise HTTPException(
            status_code=404,
            detail="Health nudge not found"
        )
        
    # Check ownership
    patient = db.query(Patient).filter(Patient.id == nudge.patient_id).first()
    if not patient:
        raise HTTPException(
            status_code=404,
            detail="Patient not found"
        )
        
    if current_user.role == "patient":
        if patient.user_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied. This is not your nudge."
            )
    elif current_user.role == "doctor":
        if not is_doctor_assigned(db, current_user.id, patient.id):
            raise HTTPException(
                status_code=403,
                detail="Access denied. You are not assigned to this patient."
            )
    elif current_user.role == "admin":
        pass
    else:
        raise HTTPException(
            status_code=403,
            detail="Unauthorized access"
        )
        
    nudge.status = "dismissed"
    nudge.dismissed_at = datetime.utcnow()
    db.commit()
    db.refresh(nudge)
    return nudge

@router.post("/run-checks")
def trigger_checks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only administrators can trigger nudge generation manually"
        )
        
    from app.services.health_nudges import run_all_health_nudge_checks
    count = run_all_health_nudge_checks(db)
    return {"status": "success", "created_count": count}
