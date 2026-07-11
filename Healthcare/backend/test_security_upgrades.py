import os
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import sys
from fastapi.testclient import TestClient
from jose import jwt
import pytest

from app.main import app
from app.database.database import SessionLocal, Base, engine
from app.models.models import User, Patient
from app.auth.security import SECRET_KEY

client = TestClient(app)

def test_security_features():
    # Setup test DB
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    # 1. Register a test user
    email = "security_test@example.com"
    password = "secure_password_123"
    register_data = {
        "name": "Security Test User",
        "email": email,
        "password": password,
        "role": "patient"
    }
    res = client.post("/api/auth/register", json=register_data)
    assert res.status_code == 201
    
    # Get user id
    user_id = res.json()["id"]
    
    # 2. Test Account Enumeration / Login Error Message
    # Try invalid email
    res = client.post("/api/auth/login", json={"email": "wrong_email@example.com", "password": password})
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid email or password"
    
    # Try valid email, wrong password
    res = client.post("/api/auth/login", json={"email": email, "password": "wrong_password"})
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid email or password"

    # 3. Test Brute Force Lockout (5 attempts)
    # Already did 1 wrong attempt. Let's do 3 more wrong attempts.
    for i in range(3):
        res = client.post("/api/auth/login", json={"email": email, "password": "wrong_password"})
        assert res.status_code == 401
        assert res.json()["detail"] == "Invalid email or password"
    
    # The 5th wrong attempt should lock the account
    res = client.post("/api/auth/login", json={"email": email, "password": "wrong_password"})
    assert res.status_code == 403
    assert "Account locked" in res.json()["detail"]
    
    # Try logging in with the correct password while locked — should still be blocked
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 403
    assert "Account locked" in res.json()["detail"]

    # 4. Test JWT Algorithm Confusion
    # Manually construct an alg="none" token
    import base64
    import json
    header_b64 = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload_b64 = base64.urlsafe_b64encode(json.dumps({"sub": email, "role": "patient", "exp": 9999999999}).encode()).decode().rstrip("=")
    none_token = f"{header_b64}.{payload_b64}."
    
    # Make a request using this token
    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {none_token}"})
    assert res.status_code == 401 # Should reject it

    # Test an algorithm other than HS256 (e.g. HS384)
    hs384_token = jwt.encode({"sub": email, "role": "patient", "exp": 9999999999}, SECRET_KEY, algorithm="HS384")
    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {hs384_token}"})
    assert res.status_code == 401 # Should reject it

    # 5. Test File Upload Magic Bytes
    # Log in to get valid token of another patient/doctor (need to bypass lockout or register a new one)
    email_b = "doctor_security@example.com"
    password_b = "docpassword"
    client.post("/api/auth/register", json={
        "name": "Dr. Security",
        "email": email_b,
        "password": password_b,
        "role": "doctor"
    })
    login_res = client.post("/api/auth/login", json={"email": email_b, "password": password_b})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    
    # Get patient A profile
    patient_a = db.query(Patient).filter(Patient.user_id == user_id).first()
    patient_a_id = patient_a.id
    
    # Try uploading a dangerous file renamed as .pdf
    fake_pdf = b"MZ\x90\x00\x03\x00\x00\x00this is an exe virus"
    files = {"file": ("virus.pdf", fake_pdf, "application/pdf")}
    res = client.post(
        f"/api/patients/{patient_a_id}/reports",
        headers={"Authorization": f"Bearer {token}"},
        files=files,
        data={"report_type": "Blood Test"}
    )
    assert res.status_code == 400
    assert "Content does not match PDF signature" in res.json()["detail"]

    # Try uploading a dangerous file renamed as .csv
    fake_csv = b"MZ\x90\x00\x03\x00\x00\x00this is an exe virus"
    files = {"file": ("virus.csv", fake_csv, "text/csv")}
    res = client.post(
        f"/api/patients/{patient_a_id}/reports",
        headers={"Authorization": f"Bearer {token}"},
        files=files,
        data={"report_type": "Blood Test"}
    )
    assert res.status_code == 400
    assert "Executables are not allowed" in res.json()["detail"]

    # Clean up DB
    db.close()
