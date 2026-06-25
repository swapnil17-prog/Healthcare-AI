from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database.database import get_db
from app.models.models import MedicalHistory, Patient, Appointment, User
from app.schemas.medical_history import MedicalHistoryCreate, MedicalHistoryUpdate, MedicalHistoryOut
from app.auth.dependencies import get_current_user

router = APIRouter(tags=["medical_history"])

# Helper function to check if a doctor is assigned to a patient
def is_doctor_assigned(db: Session, doctor_id: int, patient_id: int) -> bool:
    appointment = db.query(Appointment).filter(
        Appointment.patient_id == patient_id,
        Appointment.doctor_id == doctor_id
    ).first()
    return appointment is not None

@router.get("/patients/{patient_id}/medical-history", response_model=List[MedicalHistoryOut])
def read_patient_medical_history(
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
        
    # Access Control Checks
    if current_user.role == "admin":
        pass
    elif current_user.role == "doctor":
        pass
    elif current_user.role == "patient":
        if patient.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You can only view your own medical history."
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized access"
        )
        
    return db.query(MedicalHistory).filter(MedicalHistory.patient_id == patient_id).all()

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
        
    # Access Control: Only admin and assigned doctors can write medical history
    if current_user.role == "admin":
        pass
    elif current_user.role == "doctor":
        pass
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Only doctors or admins can create medical history."
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
        
    # Access Control: Only admin and assigned doctors can edit medical history
    if current_user.role == "admin":
        pass
    elif current_user.role == "doctor":
        pass
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Only doctors or admins can update medical history."
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
        
    # Access Control: Only admin can delete medical history
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Only administrators can delete medical history."
        )
        
    db.delete(db_history)
    db.commit()
    return None
