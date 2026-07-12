from datetime import datetime
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.database.database import get_db
from app.models.models import User, RevokedToken
from app.auth.security import decode_access_token

security_scheme = HTTPBearer()

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db)
) -> User:
    token = credentials.credentials
    payload = decode_access_token(token)
    
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    jti = payload.get("jti")
    if jti:
        revoked = db.query(RevokedToken).filter(RevokedToken.token_jti == jti).first()
        if revoked:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked",
                headers={"WWW-Authenticate": "Bearer"},
            )
    
    email: str = payload.get("sub")
    if email is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject information",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found in system",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    iat = payload.get("iat")
    if iat:
        token_issued_at = datetime.utcfromtimestamp(iat)
        if user.suspended_at and token_issued_at < user.suspended_at:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account suspended",
                headers={"WWW-Authenticate": "Bearer"},
            )
    
    return user

class RoleChecker:
    def __init__(self, allowed_roles: list[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation not permitted. Required role: {self.allowed_roles}",
            )
        return current_user

# Reusable role-check dependencies
def require_role(role: str):
    return Depends(RoleChecker([role]))

def require_roles(*roles: str):
    return Depends(RoleChecker(list(roles)))

from app.models.models import Patient, Appointment

def verify_patient_ownership(
    record_patient_id: int,
    current_user,
    db
) -> bool:
    """
    Verifies current user can access a record belonging to record_patient_id (Patient.id).
    Returns True if access allowed, False if denied.
    """
    # Admin can access everything
    if current_user.role == "admin":
        return True
    
    # Patient can only access own records
    if current_user.role == "patient":
        patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
        return patient is not None and record_patient_id == patient.id
    
    # Doctor can only access assigned patients
    if current_user.role == "doctor":
        # Check if there is an appointment between the doctor and patient
        appointment = db.query(Appointment).filter(
            Appointment.patient_id == record_patient_id,
            Appointment.doctor_id == current_user.id
        ).first()
        return appointment is not None
    
    return False

def check_ownership_or_403(
    record_patient_id: int,
    current_user,
    db
):
    """
    Raises 403 if current user cannot access the record.
    """
    if not verify_patient_ownership(record_patient_id, current_user, db):
        raise HTTPException(
            status_code=403,
            detail="Access denied: insufficient permissions"
        )
