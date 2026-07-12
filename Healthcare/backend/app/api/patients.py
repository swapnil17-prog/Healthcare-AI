from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database.database import get_db
from app.models.models import Patient, Appointment, User
from app.schemas.patients import PatientUpdate, PatientOut
from app.schemas.schemas import UserOut
from app.auth.dependencies import get_current_user, require_roles, check_ownership_or_403


router = APIRouter(prefix="/patients", tags=["patients"])

@router.get("", response_model=List[PatientOut])
def read_patients(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role == "admin":
        return db.query(Patient).all()
        
    elif current_user.role == "doctor":
        # Return patients assigned to this doctor
        patients = db.query(Patient).filter(Patient.id.in_(
            db.query(Appointment.patient_id).filter(Appointment.doctor_id == current_user.id).subquery()
        )).all()
        return patients
            
    elif current_user.role == "patient":
        # Return only the patient's own profile (as a single-item list for API signature consistency)
        patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
        return [patient] if patient else []
        
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied: insufficient permissions"
    )
@router.get("/doctors", response_model=List[UserOut])
def read_doctors(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(User).filter(User.role == "doctor").all()

@router.get("/{id}", response_model=PatientOut)
def read_patient(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    patient = db.query(Patient).filter(Patient.id == id).first()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found"
        )
        
    # Access Control Check via helper
    check_ownership_or_403(id, current_user, db)
    return patient

@router.put("/{id}", response_model=PatientOut)
def update_patient(
    id: int,
    patient_in: PatientUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    patient = db.query(Patient).filter(Patient.id == id).first()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found"
        )
        
    # Access Control Checks (Only Admin and the Patient themselves can update)
    if current_user.role == "patient" and patient.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: insufficient permissions"
        )
    elif current_user.role not in ["admin", "patient"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: insufficient permissions"
        )
        
    # Update fields
    update_data = patient_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(patient, field, value)
        
    db.commit()
    db.refresh(patient)
    return patient



