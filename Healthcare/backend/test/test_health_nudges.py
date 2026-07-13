import os
# Use a separate test database file to prevent polluting the main development database
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import sys
import time
from datetime import datetime, timedelta
from fastapi.testclient import TestClient

# Import app
try:
    from app.main import app
    from app.database.database import SessionLocal, Base, engine
    from app.models.models import User, Patient, Prediction, Appointment
except ImportError:
    import os
    sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))
    from app.main import app
    from app.database.database import SessionLocal, Base, engine
    from app.models.models import User, Patient, Prediction, Appointment

client = TestClient(app)

def test_health_nudges_flow():
    print("=== STARTING HEALTH NUDGES SYSTEM VERIFICATION ===")
    
    timestamp = int(time.time())
    
    # 1. Register users
    admin_data = {"name": "Admin Nudges", "email": f"admin_nudge_{timestamp}@example.com", "password": "adminpassword", "role": "admin"}
    doc_data = {"name": "Dr. Watson", "email": f"doc_nudge_{timestamp}@example.com", "password": "docpassword", "role": "doctor"}
    pat_a_data = {"name": "Alice Green", "email": f"pat_a_{timestamp}@example.com", "password": "patpassword", "role": "patient"}
    pat_b_data = {"name": "Bob Brown", "email": f"pat_b_{timestamp}@example.com", "password": "patpassword", "role": "patient"}
    
    admin_res = client.post("/api/auth/register", json=admin_data)
    doc_res = client.post("/api/auth/register", json=doc_data)
    pat_a_res = client.post("/api/auth/register", json=pat_a_data)
    pat_b_res = client.post("/api/auth/register", json=pat_b_data)
    
    assert admin_res.status_code == 201
    assert doc_res.status_code == 201
    assert pat_a_res.status_code == 201
    assert pat_b_res.status_code == 201
    
    admin_id = admin_res.json()["id"]
    doc_id = doc_res.json()["id"]
    pat_a_user_id = pat_a_res.json()["id"]
    pat_b_user_id = pat_b_res.json()["id"]
    
    # 2. Login to get tokens
    admin_tok = client.post("/api/auth/login", json={"email": admin_data["email"], "password": admin_data["password"]}).json()["access_token"]
    doc_tok = client.post("/api/auth/login", json={"email": doc_data["email"], "password": doc_data["password"]}).json()["access_token"]
    pat_a_tok = client.post("/api/auth/login", json={"email": pat_a_data["email"], "password": pat_a_data["password"]}).json()["access_token"]
    pat_b_tok = client.post("/api/auth/login", json={"email": pat_b_data["email"], "password": pat_b_data["password"]}).json()["access_token"]
    
    db = SessionLocal()
    try:
        # Get patient model IDs
        pat_a = db.query(Patient).filter(Patient.user_id == pat_a_user_id).first()
        pat_b = db.query(Patient).filter(Patient.user_id == pat_b_user_id).first()
        assert pat_a is not None
        assert pat_b is not None
        
        # Rule 1: Vitals missing nudge check (no predictions exists yet for either)
        run_res = client.post("/api/health-nudges/run-checks", headers={"Authorization": f"Bearer {admin_tok}"})
        assert run_res.status_code == 200
        # Should have created 2 vitals_missing nudges (one for each patient)
        assert run_res.json()["created_count"] >= 2
        
        # Check pat A has nudges
        nudges_a = client.get("/api/health-nudges", headers={"Authorization": f"Bearer {pat_a_tok}"}).json()
        assert len(nudges_a) == 1
        assert nudges_a[0]["type"] == "vitals_missing"
        assert nudges_a[0]["status"] == "unread"
        
        # RBAC: Bob B cannot view Alice A's nudges
        bad_get = client.get(f"/api/health-nudges?patient_id={pat_a.id}", headers={"Authorization": f"Bearer {pat_b_tok}"})
        assert bad_get.status_code == 403
        
        # Rule 2: Deduplication (running checks again shouldn't create duplicates of unread vitals_missing nudges)
        run_res_2 = client.post("/api/health-nudges/run-checks", headers={"Authorization": f"Bearer {admin_tok}"})
        assert run_res_2.json()["created_count"] == 0
        
        # Rule 3: Tomorrow's appointment reminder nudge
        tomorrow = datetime.utcnow() + timedelta(days=1)
        appt = Appointment(
            patient_id=pat_a.id,
            doctor_id=doc_id,
            scheduled_at=tomorrow,
            status="Scheduled",
            notes="Checkup reminder"
        )
        db.add(appt)
        db.commit()
        
        run_res_appt = client.post("/api/health-nudges/run-checks", headers={"Authorization": f"Bearer {admin_tok}"})
        assert run_res_appt.json()["created_count"] == 1
        
        nudges_a = client.get("/api/health-nudges", headers={"Authorization": f"Bearer {pat_a_tok}"}).json()
        assert len(nudges_a) == 2 # vitals_missing + appointment_reminder
        
        # Rule 4: Risk score changed nudge (10%+ increase)
        p1 = Prediction(
            patient_id=pat_a.id,
            risk_score=40.0,
            prediction="Medium Risk",
            model_name="RandomForest",
            input_features={},
            created_at=datetime.utcnow() - timedelta(days=5)
        )
        p2 = Prediction(
            patient_id=pat_a.id,
            risk_score=55.0, # Increased by 15%
            prediction="High Risk",
            model_name="RandomForest",
            input_features={},
            created_at=datetime.utcnow()
        )
        db.add_all([p1, p2])
        db.commit()
        
        run_res_risk = client.post("/api/health-nudges/run-checks", headers={"Authorization": f"Bearer {admin_tok}"})
        assert run_res_risk.json()["created_count"] >= 1
        
        # Rule 5: Follow-up suggestion nudge (risk score >= 70, no upcoming appointments)
        # First let's complete the appointment scheduled tomorrow to get rid of upcoming appointments
        appt_db = db.query(Appointment).filter(Appointment.patient_id == pat_a.id).first()
        appt_db.scheduled_at = datetime.utcnow() - timedelta(days=1) # Move tomorrow's appointment to yesterday
        
        # Add high risk prediction
        p3 = Prediction(
            patient_id=pat_a.id,
            risk_score=75.0, # High risk (>=70)
            prediction="High Risk",
            model_name="RandomForest",
            input_features={},
            created_at=datetime.utcnow()
        )
        db.add(p3)
        db.commit()
        
        run_res_high = client.post("/api/health-nudges/run-checks", headers={"Authorization": f"Bearer {admin_tok}"})
        # Should generate followup_due nudge
        nudges_a = client.get("/api/health-nudges", headers={"Authorization": f"Bearer {pat_a_tok}"}).json()
        types = [n["type"] for n in nudges_a]
        assert "followup_due" in types
        
        # PATCH mark read
        target_nudge = [n for n in nudges_a if n["type"] == "vitals_missing"][0]
        read_res = client.patch(f"/api/health-nudges/{target_nudge['id']}/read", headers={"Authorization": f"Bearer {pat_a_tok}"})
        assert read_res.status_code == 200
        assert read_res.json()["status"] == "read"
        assert read_res.json()["read_at"] is not None
        
        # PATCH dismiss works
        target_nudge2 = [n for n in nudges_a if n["type"] == "followup_due"][0]
        dismiss_res = client.patch(f"/api/health-nudges/{target_nudge2['id']}/dismiss", headers={"Authorization": f"Bearer {pat_a_tok}"})
        assert dismiss_res.status_code == 200
        assert dismiss_res.json()["status"] == "dismissed"
        
        # Chat prompt check: fetch unread nudges in chatbot context
        chat_res = client.post("/api/chat", json={"message": "hello"}, headers={"Authorization": f"Bearer {pat_a_tok}"})
        assert chat_res.status_code == 200

        # Verify that asking about appointments is not blocked by safety precheck deflection
        appt_query_res = client.post("/api/chat", json={"message": "Do I have any appointments?"}, headers={"Authorization": f"Bearer {pat_a_tok}"})
        assert appt_query_res.status_code == 200
        assert "I cannot provide a medical diagnosis" not in appt_query_res.json()["content"]

        # Verify clear chat history works
        clear_res = client.delete("/api/chat/history", headers={"Authorization": f"Bearer {pat_a_tok}"})
        assert clear_res.status_code == 200
        assert clear_res.json()["status"] == "success"
        
        # Verify history is empty now
        history_res = client.get("/api/chat/history", headers={"Authorization": f"Bearer {pat_a_tok}"})
        assert history_res.status_code == 200
        assert len(history_res.json()["items"]) == 0
        
    finally:
        db.close()
