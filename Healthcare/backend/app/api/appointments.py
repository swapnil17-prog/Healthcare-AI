from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List
from app.database.database import get_db
from app.models.models import Appointment, Patient, User
from app.schemas.appointments import AppointmentCreate, AppointmentOut, AppointmentUpdate
from app.schemas.schemas import PaginatedEnvelope
from app.auth.dependencies import get_current_user, check_ownership_or_403

router = APIRouter(prefix="/appointments", tags=["appointments"])

@router.post("", response_model=AppointmentOut, status_code=status.HTTP_201_CREATED)
def create_appointment(
    appt_in: AppointmentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Ensure patient exists
    patient = db.query(Patient).filter(Patient.id == appt_in.patient_id).first()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found"
        )
        
    # Access Control: Patient can only create appointments for themselves
    if current_user.role == "patient":
        patient_profile = db.query(Patient).filter(Patient.user_id == current_user.id).first()
        if not patient_profile or appt_in.patient_id != patient_profile.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: insufficient permissions"
            )
        
    # Set doctor_id: If doctor, enforce their own ID; if admin, allow any; if patient, allow scheduling.
    # To keep it flexible for testing, we let admin specify the doctor_id, and default others or validate.
    doctor_id = appt_in.doctor_id
    if current_user.role == "doctor":
        doctor_id = current_user.id
        
    # Check if doctor exists
    doctor = db.query(User).filter(User.id == doctor_id, User.role == "doctor").first()
    if not doctor:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Doctor not found or invalid role"
        )
        
    db_appointment = Appointment(
        patient_id=appt_in.patient_id,
        doctor_id=doctor_id,
        scheduled_at=appt_in.scheduled_at,
        status=appt_in.status,
        notes=appt_in.notes
    )
    
    db.add(db_appointment)
    db.commit()
    db.refresh(db_appointment)
    return db_appointment

@router.get("", response_model=PaginatedEnvelope[AppointmentOut])
def read_appointments(
    limit: int = Query(default=50, ge=1, le=100),
    skip: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Return appointments depending on role
    query = db.query(Appointment)
    if current_user.role == "admin":
        pass
    elif current_user.role == "doctor":
        query = query.filter(Appointment.doctor_id == current_user.id)
    elif current_user.role == "patient":
        # Get the patient record first
        patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
        if not patient:
            return {
                "items": [],
                "total": 0,
                "limit": limit,
                "skip": skip
            }
        query = query.filter(Appointment.patient_id == patient.id)
    else:
        return {
            "items": [],
            "total": 0,
            "limit": limit,
            "skip": skip
        }

    total = query.count()
    items = query.offset(skip).limit(limit).all()
    
    return {
        "items": items,
        "total": total,
        "limit": limit,
        "skip": skip
    }


@router.put("/{id}", response_model=AppointmentOut)
def update_appointment(
    id: int,
    appt_in: AppointmentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    appt = db.query(Appointment).filter(Appointment.id == id).first()
    if not appt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found"
        )
        
    # Access Control Check via helper
    check_ownership_or_403(appt.patient_id, current_user, db)
        
    # Extra role-based validation
    if current_user.role == "patient":
        # Patients can only change status to "Cancelled" or modify date (reschedule)
        if appt_in.status and appt_in.status != "Cancelled":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: insufficient permissions"
            )
    elif current_user.role == "doctor":
        if appt.doctor_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: insufficient permissions"
            )
    elif current_user.role == "admin":
        pass
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: insufficient permissions"
        )
        
    # Update properties
    if appt_in.scheduled_at is not None:
        appt.scheduled_at = appt_in.scheduled_at
    if appt_in.status is not None:
        appt.status = appt_in.status
    if appt_in.notes is not None:
        appt.notes = appt_in.notes
        
    db.commit()
    db.refresh(appt)
    return appt

