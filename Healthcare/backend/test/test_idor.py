import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database.database import SessionLocal
from app.models.models import User, Patient, Appointment, Prediction, MedicalHistory, LabReport
from app.auth.security import get_password_hash
import datetime
import uuid

client = TestClient(app)

def test_idor_and_public_id():
    # Initialize variables to None to prevent UnboundLocalError in finally block
    pat_a_user = None
    pat_b_user = None
    doc_user = None
    admin_user = None
    patient_a = None
    patient_b = None
    appt = None
    pred = None
    history = None
    report = None

    db = SessionLocal()
    try:
        # Clean up previous test users if any
        db.query(User).filter(User.email.in_([
            "idor_pat_a@test.com", "idor_pat_b@test.com", 
            "idor_doc_a@test.com", "idor_admin@test.com"
        ])).delete(synchronize_session=False)
        db.commit()

        # Create Patient A
        pat_a_user = User(
            name="Patient A", 
            email="idor_pat_a@test.com", 
            role="patient", 
            subscription_tier="Pro",
            password_hash=get_password_hash("password123")
        )
        db.add(pat_a_user)
        db.flush()
        
        patient_a = Patient(user_id=pat_a_user.id, age=30, gender="Female", blood_group="O+")
        db.add(patient_a)
        db.flush()

        # Create Patient B
        pat_b_user = User(
            name="Patient B", 
            email="idor_pat_b@test.com", 
            role="patient", 
            subscription_tier="Pro",
            password_hash=get_password_hash("password123")
        )
        db.add(pat_b_user)
        db.flush()
        
        patient_b = Patient(user_id=pat_b_user.id, age=40, gender="Male", blood_group="A-")
        db.add(patient_b)
        db.flush()

        # Create Doctor
        doc_user = User(
            name="Doctor A", 
            email="idor_doc_a@test.com", 
            role="doctor", 
            password_hash=get_password_hash("password123")
        )
        db.add(doc_user)
        db.flush()

        # Create Admin
        admin_user = User(
            name="Admin", 
            email="idor_admin@test.com", 
            role="admin", 
            password_hash=get_password_hash("password123")
        )
        db.add(admin_user)
        db.flush()

        # Create an Appointment to assign Patient A to Doctor A
        appt = Appointment(
            patient_id=patient_a.id,
            doctor_id=doc_user.id,
            scheduled_at=datetime.datetime.utcnow() + datetime.timedelta(days=1),
            status="Scheduled",
            notes="Assigned consultation"
        )
        db.add(appt)

        # Create some prediction record for Patient A
        pred = Prediction(
            patient_id=patient_a.id,
            model_name="Pima Indians Diabetes",
            input_features={"glucose": 120.0, "bmi": 24.5},
            risk_score=45.0,
            prediction="Medium Risk"
        )
        db.add(pred)

        # Create some medical history for Patient A
        history = MedicalHistory(
            patient_id=patient_a.id,
            disease="Diabetes",
            notes="Managed well"
        )
        # Avoid missing required field error if diagnosis_date is required in schema (it is a datetime)
        history.diagnosis_date = datetime.datetime.utcnow()
        db.add(history)

        # Create a report for Patient A
        report = LabReport(
            patient_id=patient_a.id,
            file_path="uploads/reports/test_report.csv",
            report_type="Blood Test"
        )
        db.add(report)

        db.commit()

        # Refresh objects to fetch generated fields (like public_id)
        db.refresh(patient_a)
        db.refresh(patient_b)
        db.refresh(pred)
        db.refresh(history)
        db.refresh(report)

        pred_public_id = pred.public_id
        report_public_id = report.public_id

        # Obtain authorization tokens
        token_pat_a = client.post("/api/auth/login", json={"email": "idor_pat_a@test.com", "password": "password123"}).json()["access_token"]
        token_pat_b = client.post("/api/auth/login", json={"email": "idor_pat_b@test.com", "password": "password123"}).json()["access_token"]
        token_doc = client.post("/api/auth/login", json={"email": "idor_doc_a@test.com", "password": "password123"}).json()["access_token"]
        token_admin = client.post("/api/auth/login", json={"email": "idor_admin@test.com", "password": "password123"}).json()["access_token"]

        headers_pat_a = {"Authorization": f"Bearer {token_pat_a}"}
        headers_pat_b = {"Authorization": f"Bearer {token_pat_b}"}
        headers_doc = {"Authorization": f"Bearer {token_doc}"}
        headers_admin = {"Authorization": f"Bearer {token_admin}"}

        # --- 1. TEST PREDICTIONS ACCESS ---
        # Patient A should be able to view their own predictions list
        res = client.get(f"/api/patients/{patient_a.id}/predictions", headers=headers_pat_a)
        assert res.status_code == 200
        
        # Patient B should NOT be able to view Patient A's predictions list
        res = client.get(f"/api/patients/{patient_a.id}/predictions", headers=headers_pat_b)
        assert res.status_code == 403
        assert res.json()["detail"] == "Access denied: insufficient permissions"

        # Assigned Doctor should be able to view Patient A's predictions
        res = client.get(f"/api/patients/{patient_a.id}/predictions", headers=headers_doc)
        assert res.status_code == 200

        # Doctor should NOT be able to view Patient B's predictions (not assigned)
        res = client.get(f"/api/patients/{patient_b.id}/predictions", headers=headers_doc)
        assert res.status_code == 403
        assert res.json()["detail"] == "Access denied: insufficient permissions"

        # --- 2. TEST DETAILED VIEW BY public_id (UUID) ---
        # Patient A should be able to get a single prediction by its public_id
        res = client.get(f"/api/predictions/{pred_public_id}", headers=headers_pat_a)
        assert res.status_code == 200

        # Patient B should NOT be able to get Patient A's prediction by public_id
        res = client.get(f"/api/predictions/{pred_public_id}", headers=headers_pat_b)
        assert res.status_code == 403
        assert res.json()["detail"] == "Access denied: insufficient permissions"

        # --- 3. TEST MEDICAL HISTORY ACCESS ---
        # Patient A should be able to view their own history
        res = client.get(f"/api/patients/{patient_a.id}/medical-history", headers=headers_pat_a)
        assert res.status_code == 200

        # Patient B should NOT be able to view Patient A's history
        res = client.get(f"/api/patients/{patient_a.id}/medical-history", headers=headers_pat_b)
        assert res.status_code == 403
        assert res.json()["detail"] == "Access denied: insufficient permissions"

        # --- 4. TEST APPOINTMENTS ACCESS ---
        # Patient A should be able to update their own appointment (status -> Cancelled)
        res = client.put(f"/api/appointments/{appt.id}", json={"status": "Cancelled"}, headers=headers_pat_a)
        assert res.status_code == 200

        # Patient B should NOT be able to update Patient A's appointment
        res = client.put(f"/api/appointments/{appt.id}", json={"status": "Cancelled"}, headers=headers_pat_b)
        assert res.status_code == 403
        assert res.json()["detail"] == "Access denied: insufficient permissions"

        # --- 5. TEST REPORT DOWNLOADS VIA public_id ---
        # Patient A should be able to download own report via UUID public_id
        # Write dummy file first so test doesn't crash on os.path.exists
        import os
        os.makedirs("uploads/reports", exist_ok=True)
        with open("uploads/reports/test_report.csv", "w") as f:
            f.write("test data")

        res = client.get(f"/api/reports/{report_public_id}/download", headers=headers_pat_a)
        assert res.status_code == 200
        assert res.text == "test data"

        # Patient B should NOT be able to download Patient A's report
        res = client.get(f"/api/reports/{report_public_id}/download", headers=headers_pat_b)
        assert res.status_code == 403
        assert res.json()["detail"] == "Access denied: insufficient permissions"

        # Clean up file
        try:
            os.remove("uploads/reports/test_report.csv")
        except OSError:
            pass

        # --- 6. TEST PROFILE MODIFICATION ACCESS ---
        # Patient B should NOT be able to update Patient A's profile
        res = client.put(f"/api/patients/{patient_a.id}", json={"phone": "999999"}, headers=headers_pat_b)
        assert res.status_code == 403
        assert res.json()["detail"] == "Access denied: insufficient permissions"

        # Patient A should be able to update their own profile
        res = client.put(f"/api/patients/{patient_a.id}", json={"phone": "999999"}, headers=headers_pat_a)
        assert res.status_code == 200

        # --- 7. TEST CHAT HISTORY ACCESS ---
        # Patient A should be able to get their own history
        res = client.get("/api/chat/history", headers=headers_pat_a)
        assert res.status_code == 200

        # Doctor should be able to get history of Patient A (assigned)
        res = client.get(f"/api/chat/history?patient_id={patient_a.id}", headers=headers_doc)
        assert res.status_code == 200

        # Doctor should NOT be able to get history of Patient B (not assigned)
        res = client.get(f"/api/chat/history?patient_id={patient_b.id}", headers=headers_doc)
        assert res.status_code == 403
        assert res.json()["detail"] == "Access denied: insufficient permissions"

        # Admin should be able to get history of Patient B (admin role)
        res = client.get(f"/api/chat/history?patient_id={patient_b.id}", headers=headers_admin)
        assert res.status_code == 200

        print("\n=== ALL IDOR & PUBLIC ID TESTS COMPLETED SUCCESSFULLY ===")

    finally:
        # Clean up database records securely checking if variables were initialized
        if patient_a:
            db.query(Appointment).filter(Appointment.patient_id == patient_a.id).delete()
            db.query(Prediction).filter(Prediction.patient_id == patient_a.id).delete()
            db.query(MedicalHistory).filter(MedicalHistory.patient_id == patient_a.id).delete()
            db.query(LabReport).filter(LabReport.patient_id == patient_a.id).delete()
        
        users_to_delete = []
        if pat_a_user:
            db.query(Patient).filter(Patient.user_id == pat_a_user.id).delete()
            users_to_delete.append(pat_a_user.id)
        if pat_b_user:
            db.query(Patient).filter(Patient.user_id == pat_b_user.id).delete()
            users_to_delete.append(pat_b_user.id)
        if doc_user:
            users_to_delete.append(doc_user.id)
        if admin_user:
            users_to_delete.append(admin_user.id)
            
        if users_to_delete:
            db.query(User).filter(User.id.in_(users_to_delete)).delete(synchronize_session=False)
            
        db.commit()
        db.close()
