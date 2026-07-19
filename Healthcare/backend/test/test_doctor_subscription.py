import os
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import sys
import time
from fastapi.testclient import TestClient

try:
    from app.main import app
    from app.database.database import SessionLocal, Base, engine
except ImportError:
    import os
    sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
    from app.main import app
    from app.database.database import SessionLocal, Base, engine

client = TestClient(app)

def test_doctor_subscription_and_limits():
    print("=== STARTING DOCTOR SUBSCRIPTION & CLINICAL LIMITS VERIFICATION ===")
    
    timestamp = int(time.time())
    
    # 1. Register test doctor
    print("\n1. Registering test doctor...")
    doc_data = {
        "name": "Dr. Sub Test",
        "email": f"doc_sub_{timestamp}@example.com",
        "password": "docpassword123",
        "role": "doctor"
    }
    reg_res = client.post("/api/auth/register", json=doc_data)
    assert reg_res.status_code == 201
    doc_user_id = reg_res.json()["id"]
    
    # 2. Login test doctor
    login_res = client.post("/api/auth/login", json={"email": doc_data["email"], "password": doc_data["password"]})
    assert login_res.status_code == 200
    doc_token = login_res.json()["access_token"]
    doc_headers = {"Authorization": f"Bearer {doc_token}"}
    
    # 3. Fetch Doctor subscription plans
    print("\n2. Fetching doctor subscription plans...")
    plans_res = client.get("/api/subscription/plans?role=doctor", headers=doc_headers)
    assert plans_res.status_code == 200
    plans = plans_res.json()
    assert len(plans) >= 3
    plan_codes = [p["code"] for p in plans]
    assert "Doc_Free" in plan_codes
    assert "Doc_Professional" in plan_codes
    assert "Doc_Clinical_Plus" in plan_codes
    print("OK Doctor subscription plans (Doc_Free, Doc_Professional, Doc_Clinical_Plus) verified.")
    
    # 4. Fetch current doctor subscription (default Free Doctor)
    print("\n3. Testing /api/subscription/current for doctor...")
    curr_res = client.get("/api/subscription/current", headers=doc_headers)
    assert curr_res.status_code == 200
    curr_data = curr_res.json()
    assert curr_data["usage_stats"]["assigned_patients_limit"] == 5
    assert curr_data["usage_stats"]["doctor_ml_scans_limit"] == 10
    assert curr_data["usage_stats"]["doctor_pdf_downloads_limit"] == 5
    print("OK Default Free Doctor limits (5 patients, 10 scans, 5 PDFs) verified.")
    
    # 5. Register 6 test patients and assign to doctor
    print("\n4. Testing patient assignment limit (5 max on Free Doctor)...")
    patient_ids = []
    for i in range(1, 7):
        p_data = {
            "name": f"Patient Sub {i}",
            "email": f"pat_docsub_{i}_{timestamp}@example.com",
            "password": "patientpassword",
            "role": "patient"
        }
        r = client.post("/api/auth/register", json=p_data)
        assert r.status_code == 201
        
        # Login patient to get profile ID
        p_login = client.post("/api/auth/login", json={"email": p_data["email"], "password": p_data["password"]}).json()
        p_headers = {"Authorization": f"Bearer {p_login['access_token']}"}
        p_profile = client.get("/api/patients", headers=p_headers).json()
        items = p_profile.get("items", p_profile) if isinstance(p_profile, dict) else p_profile
        patient_ids.append(items[0]["id"])

    # Assign first 5 patients (should succeed)
    for idx, pid in enumerate(patient_ids[:5], 1):
        appt_payload = {
            "patient_id": pid,
            "doctor_id": doc_user_id,
            "scheduled_at": f"2026-08-0{idx}T10:00:00Z",
            "notes": f"Initial Consultation {idx}"
        }
        appt_res = client.post("/api/appointments", json=appt_payload, headers=doc_headers)
        assert appt_res.status_code == 201, f"Appointment for patient {idx} failed: {appt_res.text}"
        print(f"OK Patient {idx}/5 assigned successfully.")

    # Assign 6th patient (should be blocked with HTTP 429)
    blocked_appt = client.post("/api/appointments", json={
        "patient_id": patient_ids[5],
        "doctor_id": doc_user_id,
        "scheduled_at": "2026-08-06T10:00:00Z",
        "notes": "6th Patient Assignment Attempt"
    }, headers=doc_headers)
    assert blocked_appt.status_code == 429
    assert blocked_appt.json()["detail"]["error"] == "limit_reached"
    print("OK 6th patient assignment blocked with HTTP 429 Limit Reached on Free Doctor plan as expected.")

    # 6. Upgrade Doctor to Professional (Doc_Professional)
    print("\n5. Testing Upgrade to Professional Doctor Plan (₹999/mo)...")
    upg_res = client.post("/api/subscription/upgrade", json={"plan_code": "Doc_Professional", "payment_method": "mock"}, headers=doc_headers)
    assert upg_res.status_code == 200
    assert upg_res.json()["subscription_tier"] == "Doc_Professional"
    print("OK Doctor successfully upgraded to Doc_Professional.")

    # Assign 6th patient again (should now succeed on Professional tier!)
    unblocked_appt = client.post("/api/appointments", json={
        "patient_id": patient_ids[5],
        "doctor_id": doc_user_id,
        "scheduled_at": "2026-08-06T10:00:00Z",
        "notes": "6th Patient Assignment Attempt Post-Upgrade"
    }, headers=doc_headers)
    assert unblocked_appt.status_code == 201
    print("OK 6th patient assignment succeeded after upgrading to Professional Doctor plan!")

    # 7. Upgrade Doctor to Clinical Plus (Doc_Clinical_Plus)
    print("\n6. Testing Upgrade to Clinical Plus Doctor Plan (₹2,499/mo)...")
    upg_cp_res = client.post("/api/subscription/upgrade", json={"plan_code": "Doc_Clinical_Plus", "payment_method": "mock"}, headers=doc_headers)
    assert upg_cp_res.status_code == 200
    assert upg_cp_res.json()["subscription_tier"] == "Doc_Clinical_Plus"

    curr_cp = client.get("/api/subscription/current", headers=doc_headers).json()
    assert curr_cp["usage_stats"]["assigned_patients_limit"] == -1
    assert curr_cp["usage_stats"]["doctor_ml_scans_limit"] == -1
    print("OK Clinical Plus Doctor tier verified with Unlimited patient management!")

    print("\n=== ALL DOCTOR SUBSCRIPTION & LIMIT TESTS PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    test_doctor_subscription_and_limits()
