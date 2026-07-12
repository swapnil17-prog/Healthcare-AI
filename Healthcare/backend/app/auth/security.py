import os
# Note: Refresh token cookie configurations are defined and handled in app/api/auth.py
from datetime import datetime, timedelta
from typing import Any, Union
import bcrypt
from jose import jwt
import uuid

# Pre-computed dummy hash — takes same time to verify as real hash
DUMMY_HASH = bcrypt.hashpw(b"dummy_password_for_timing_safety", bcrypt.gensalt()).decode("utf-8")

def verify_password_safe(plain_password: str, hashed_password: str | None) -> bool:
    """
    Always runs bcrypt comparison to normalize timing.
    Returns False if hashed_password is None (dummy run).
    """
    if hashed_password is None:
        # Run dummy comparison to normalize timing
        bcrypt.checkpw(plain_password.encode("utf-8"), DUMMY_HASH.encode("utf-8"))
        return False
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8")
        )
    except Exception:
        return False

# Secret keys for JWT signing
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "super_secret_key_for_development_only_12345")
REFRESH_SECRET_KEY = os.getenv("JWT_REFRESH_SECRET_KEY", "super_secret_refresh_key_for_development_only_12345")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8")
        )
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def create_access_token(subject: Union[str, Any], role: str, expires_delta: timedelta = None) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {
        "exp": expire, 
        "sub": str(subject), 
        "role": role,
        "jti": str(uuid.uuid4()),
        "iat": datetime.utcnow()
    }
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def create_refresh_token(subject: Union[str, Any], role: str, expires_delta: timedelta = None) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    
    to_encode = {
        "exp": expire, 
        "sub": str(subject), 
        "role": role, 
        "refresh": True,
        "jti": str(uuid.uuid4()),
        "iat": datetime.utcnow()
    }
    encoded_jwt = jwt.encode(to_encode, REFRESH_SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> dict:
    try:
        header = jwt.get_unverified_header(token)
        if header.get("alg") != "HS256":
            return None
        decoded_token = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        # Ensure exp has not elapsed
        return decoded_token if decoded_token["exp"] >= datetime.utcnow().timestamp() else None
    except jwt.JWTError:
        return None

def decode_refresh_token(token: str) -> dict:
    try:
        header = jwt.get_unverified_header(token)
        if header.get("alg") != "HS256":
            return None
        decoded_token = jwt.decode(token, REFRESH_SECRET_KEY, algorithms=["HS256"])
        return decoded_token if decoded_token["exp"] >= datetime.utcnow().timestamp() else None
    except jwt.JWTError:
        return None
