from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List
from app.database.database import get_db
from app.models.models import MedicalHistory, Patient, Appointment, User
from app.schemas.medical_history import MedicalHistoryCreate, MedicalHistoryUpdate, MedicalHistoryOut
from app.schemas.schemas import PaginatedEnvelope
from app.auth.dependencies import get_current_user, check_ownership_or_403

router = APIRouter(tags=["medical_history"])

# Helper function to check if a doctor is assigned to a patient
def is_doctor_assigned(db: Session, doctor_id: int, patient_id: int) -> bool:
    appointment = db.query(Appointment).filter(
        Appointment.patient_id == patient_id,
        Appointment.doctor_id == doctor_id
    ).first()
    return appointment is not None

@router.get("/patients/{patient_id}/medical-history", response_model=PaginatedEnvelope[MedicalHistoryOut])
def read_patient_medical_history(
    patient_id: int,
    limit: int = Query(default=50, ge=1, le=100),
    skip: int = Query(default=0, ge=0),
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
        
    # Access Control Check via helper
    check_ownership_or_403(patient_id, current_user, db)
        
    query = db.query(MedicalHistory).filter(MedicalHistory.patient_id == patient_id)
    total = query.count()
    items = query.offset(skip).limit(limit).all()
    
    return {
        "items": items,
        "total": total,
        "limit": limit,
        "skip": skip
    }

@router.post("/patients/{patient_id}/medical-history", response_model=MedicalHistoryOut, status_code=status.HTTP_201_CREATED)
def create_medical_history(
    patient_id: int,
    history_in: MedicalHistoryCreate,
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
        
    # Access Control Check via helper
    check_ownership_or_403(patient_id, current_user, db)
        
    # Only doctor and admin can write medical history
    if current_user.role not in ["admin", "doctor"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: insufficient permissions"
        )
        
    db_history = MedicalHistory(
        patient_id=patient_id,
        disease=history_in.disease,
        diagnosis_date=history_in.diagnosis_date,
        medications=history_in.medications,
        notes=history_in.notes
    )
    
    db.add(db_history)
    db.commit()
    db.refresh(db_history)
    return db_history

@router.put("/medical-history/{id}", response_model=MedicalHistoryOut)
def update_medical_history(
    id: int,
    history_in: MedicalHistoryUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_history = db.query(MedicalHistory).filter(MedicalHistory.id == id).first()
    if not db_history:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Medical history record not found"
        )
        
    # Access Control Check via helper
    check_ownership_or_403(db_history.patient_id, current_user, db)
        
    # Only doctor and admin can edit medical history
    if current_user.role not in ["admin", "doctor"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: insufficient permissions"
        )
        
    # Update fields
    update_data = history_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_history, field, value)
        
    db.commit()
    db.refresh(db_history)
    return db_history

@router.delete("/medical-history/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_medical_history(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_history = db.query(MedicalHistory).filter(MedicalHistory.id == id).first()
    if not db_history:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Medical history record not found"
        )
        
    # Access Control Check via helper
    check_ownership_or_403(db_history.patient_id, current_user, db)
        
    # Access Control: Only admin can delete medical history
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: insufficient permissions"
        )
        
    db.delete(db_history)
    db.commit()
    return None
