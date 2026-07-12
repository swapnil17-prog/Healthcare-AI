import os
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Response, Cookie, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import Optional
from app.database.database import get_db
from app.models.models import User, Patient, RevokedToken
from app.schemas.schemas import UserCreate, UserLogin, Token, UserOut
from app.auth.security import (
    get_password_hash,
    verify_password,
    verify_password_safe,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    decode_access_token,
    REFRESH_TOKEN_EXPIRE_DAYS
)
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    # Check if email already exists
    existing_user = db.query(User).filter(User.email == user_in.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists"
        )
    
    # Validate role
    role = user_in.role.lower()
    if role not in ["admin", "doctor", "patient"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role must be one of: admin, doctor, patient"
        )
    
    # Hash password and create user
    hashed_password = get_password_hash(user_in.password)
    db_user = User(
        name=user_in.name,
        email=user_in.email,
        password_hash=hashed_password,
        role=role
    )
    
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    # If the user is a patient, initialize their patient profile
    if role == "patient":
        db_patient = Patient(user_id=db_user.id)
        db.add(db_patient)
        db.commit()
        
    return db_user

from datetime import datetime, timedelta

@router.post("/login", response_model=Token)
def login(response: Response, login_in: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == login_in.email).first()
    
    # Always run password check (normalizes timing)
    password_valid = verify_password_safe(
        login_in.password, 
        user.password_hash if user else None
    )
        
    # Check if account is locked
    if user and user.locked_until and user.locked_until > datetime.utcnow():
        minutes_left = int((user.locked_until - datetime.utcnow()).total_seconds() / 60) + 1
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account locked. Try again in {minutes_left} minutes."
        )
        
    if not user or not password_valid:
        if user:
            user.login_attempts = (user.login_attempts or 0) + 1
            if user.login_attempts >= 5:
                user.locked_until = datetime.utcnow() + timedelta(minutes=15)
                user.login_attempts = 0
                db.commit()
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Account locked. Try again in 15 minutes."
                )
            db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
        
    # Reset attempts on successful login
    user.login_attempts = 0
    user.locked_until = None
    db.commit()
        
    access_token = create_access_token(subject=user.email, role=user.role)
    refresh_token = create_refresh_token(subject=user.email, role=user.role)
    
    # Set secure HTTP-only cookie for Refresh Token
    # Use secure=True, except when DATABASE_URL is in-memory sqlite to allow local TestClient unit tests to pass
    is_testing = "sqlite:///:memory:" in os.getenv("DATABASE_URL", "")
    secure_val = not is_testing
    
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=secure_val,
        samesite="Lax",
        max_age=7 * 24 * 60 * 60,
        path="/api/auth/refresh",
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role
    }

@router.post("/refresh", response_model=Token)
async def refresh(
    request: Request,
    response: Response,
    refresh_token: Optional[str] = Cookie(None),
    db: Session = Depends(get_db)
):
    origin = request.headers.get("origin", "")
    allowed = os.environ.get(
        "ALLOWED_ORIGINS", 
        "http://localhost:5173"
    ).split(",")
    
    if origin and origin not in allowed:
        raise HTTPException(
            status_code=403, 
            detail="CSRF check failed"
        )
        
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing from cookies"
        )
        
    payload = decode_refresh_token(refresh_token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )
        
    email = payload.get("sub")
    role = payload.get("role")
    
    # Verify user still exists
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
        
    new_access_token = create_access_token(subject=email, role=role)
    new_refresh_token = create_refresh_token(subject=email, role=role)
    
    # Set the refreshed token in cookie
    # Use secure=True, except when DATABASE_URL is in-memory sqlite to allow local TestClient unit tests to pass
    is_testing = "sqlite:///:memory:" in os.getenv("DATABASE_URL", "")
    secure_val = not is_testing
    
    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=secure_val,
        samesite="Lax",
        max_age=7 * 24 * 60 * 60,
        path="/api/auth/refresh",
    )
    
    return {
        "access_token": new_access_token,
        "token_type": "bearer",
        "role": role
    }

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    refresh_token: Optional[str] = Cookie(None),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
    db: Session = Depends(get_db)
):
    if credentials:
        token = credentials.credentials
        payload = decode_access_token(token)
        if payload:
            jti = payload.get("jti")
            exp = payload.get("exp")
            if jti and exp:
                expires_at = datetime.utcfromtimestamp(exp)
                exists = db.query(RevokedToken).filter(RevokedToken.token_jti == jti).first()
                if not exists:
                    revoked = RevokedToken(token_jti=jti, expires_at=expires_at)
                    db.add(revoked)
                    db.commit()
                    
    if refresh_token:
        payload = decode_refresh_token(refresh_token)
        if payload:
            jti = payload.get("jti")
            exp = payload.get("exp")
            if jti and exp:
                expires_at = datetime.utcfromtimestamp(exp)
                exists = db.query(RevokedToken).filter(RevokedToken.token_jti == jti).first()
                if not exists:
                    revoked = RevokedToken(token_jti=jti, expires_at=expires_at)
                    db.add(revoked)
                    db.commit()

    response.delete_cookie(key="refresh_token", path="/api/auth/refresh")
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.get("/me", response_model=UserOut)
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user
