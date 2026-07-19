import os
# Use a separate test database file to prevent polluting the main development database
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import time
from fastapi.testclient import TestClient
from app.main import app
from app.database.database import SessionLocal, Base, engine

client = TestClient(app)

def test_heart_predictions_and_idor():
    print("=== STARTING HEART PREDICTION & IDOR TESTING ===")
    
    timestamp = int(time.time())
    
    # 1. Register test users
    print("\n1. Registering test users...")
    admin_data = {"name": "Admin User", "email": f"admin_heart_{timestamp}@example.com", "password": "adminpassword", "role": "admin"}
    doctor_data = {"name": "Dr. House", "email": f"doctor_heart_{timestamp}@example.com", "password": "doctorpassword", "role": "doctor"}
    patient_data = {"name": "Bob Heart", "email": f"patient_heart_{timestamp}@example.com", "password": "patientpassword", "role": "patient"}
    unassigned_patient_data = {"name": "Unassigned Patient", "email": f"patient_unassigned_{timestamp}@example.com", "password": "patientpassword", "role": "patient"}
    
    admin_res = client.post("/api/auth/register", json=admin_data)
    doctor_res = client.post("/api/auth/register", json=doctor_data)
    patient_res = client.post("/api/auth/register", json=patient_data)
    unassigned_res = client.post("/api/auth/register", json=unassigned_patient_data)
    
    assert admin_res.status_code == 201
    assert doctor_res.status_code == 201
    assert patient_res.status_code == 201
    assert unassigned_res.status_code == 201
    
    doctor_user_id = doctor_res.json()["id"]
    print("OK Users registered.")

    # 2. Login to get tokens
    print("\n2. Logging in test users...")
    admin_token = client.post("/api/auth/login", json={"email": admin_data["email"], "password": admin_data["password"]}).json()["access_token"]
    doctor_token = client.post("/api/auth/login", json={"email": doctor_data["email"], "password": doctor_data["password"]}).json()["access_token"]
    patient_token = client.post("/api/auth/login", json={"email": patient_data["email"], "password": patient_data["password"]}).json()["access_token"]
    unassigned_token = client.post("/api/auth/login", json={"email": unassigned_patient_data["email"], "password": unassigned_patient_data["password"]}).json()["access_token"]
    
    patient_headers = {"Authorization": f"Bearer {patient_token}"}
    doctor_headers = {"Authorization": f"Bearer {doctor_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    unassigned_headers = {"Authorization": f"Bearer {unassigned_token}"}
    client.post("/api/subscription/upgrade", json={"plan_code": "Pro"}, headers=patient_headers)
    
    print("OK Logins complete.")

    # 3. Retrieve Patient profile IDs
    print("\n3. Finding Patient profile IDs...")
    patients_list = client.get("/api/patients", headers=admin_headers).json()["items"]
    
    patient_profile = next(p for p in patients_list if p["user"]["email"] == patient_data["email"])
    unassigned_profile = next(p for p in patients_list if p["user"]["email"] == unassigned_patient_data["email"])
    
    patient_id = patient_profile["id"]
    unassigned_patient_id = unassigned_profile["id"]
    print(f"Patient Profile ID: {patient_id}, Unassigned Patient ID: {unassigned_patient_id}")

    # 4. Create appointment to establish doctor assignment
    print("\n4. Creating appointment for assignment...")
    appt_payload = {
        "patient_id": patient_id,
        "doctor_id": doctor_user_id,
        "scheduled_at": "2026-07-01T10:00:00",
        "status": "Scheduled",
        "notes": "Cardio screening appointment"
    }
    appt_res = client.post("/api/appointments", json=appt_payload, headers=admin_headers)
    assert appt_res.status_code == 201
    print("OK Assignment established.")

    # 5. Check model availability status
    print("\n5. Testing /status endpoint...")
    status_res = client.get("/api/heart/status")
    assert status_res.status_code == 200
    assert "available" in status_res.json()
    print(f"Model Availability Status: {status_res.json()}")

    # 6. Test Diastolic BP Validator (ap_lo must be less than ap_hi)
    print("\n6. Testing diastolic validation failure (ap_lo >= ap_hi)...")
    invalid_bp_payload = {
        "age_years": 45.0,
        "gender": 1,
        "height": 165.0,
        "weight": 68.0,
        "ap_hi": 120,
        "ap_lo": 120, # Diastolic == Systolic (should fail)
        "cholesterol": 1,
        "gluc": 1,
        "smoke": 0,
        "alco": 0,
        "active": 1
    }
    invalid_bp_res = client.post("/api/heart/predict", json=invalid_bp_payload, headers=patient_headers)
    assert invalid_bp_res.status_code == 422
    print("OK Invalid BP payload correctly rejected.")

    # 7. Run Heart Prediction for Self (as Patient)
    print("\n7. Testing prediction by patient self-access...")
    valid_payload = {
        "age_years": 45.0,
        "gender": 1,
        "height": 165.0,
        "weight": 68.0,
        "ap_hi": 120,
        "ap_lo": 80,
        "cholesterol": 1,
        "gluc": 1,
        "smoke": 0,
        "alco": 0,
        "active": 1
    }
    pred_res = client.post("/api/heart/predict", json=valid_payload, headers=patient_headers)
    print(f"Prediction response code: {pred_res.status_code}")
    if pred_res.status_code == 200:
        pred_data = pred_res.json()
        assert "risk_score" in pred_data
        assert "risk_level" in pred_data
        assert "confidence_lower" in pred_data
        assert "feature_contributions" in pred_data
        print("OK Patient self prediction succeeded.")
    else:
        assert pred_res.status_code in [503, 533]
        print("OK Prediction correctly returned unavailable code because model is not loaded.")

    # 8. Doctor runs prediction for ASSIGNED patient
    print("\n8. Testing prediction by doctor for assigned patient...")
    doc_pred_res = client.post(f"/api/heart/predict?patient_id={patient_id}", json=valid_payload, headers=doctor_headers)
    print(f"Doctor prediction response code: {doc_pred_res.status_code}")
    if doc_pred_res.status_code == 200:
        assert "risk_score" in doc_pred_res.json()
        print("OK Doctor prediction for assigned patient succeeded.")
    else:
        assert doc_pred_res.status_code in [503, 533]

    # 9. Doctor runs prediction for UNASSIGNED patient (should fail IDOR check)
    print("\n9. Testing prediction by doctor for unassigned patient (should fail)...")
    doc_unassigned_res = client.post(f"/api/heart/predict?patient_id={unassigned_patient_id}", json=valid_payload, headers=doctor_headers)
    assert doc_unassigned_res.status_code == 403
    print("OK Doctor blocked from predicting for unassigned patient.")

    # 10. Patient accesses own history
    print("\n10. Fetching patient history...")
    history_res = client.get("/api/heart/history", headers=patient_headers)
    assert history_res.status_code == 200
    print(f"History list count: {history_res.json()['total']}")

    # 11. Doctor accesses ASSIGNED patient history
    print("\n11. Fetching history by doctor for assigned patient...")
    doc_history_res = client.get(f"/api/heart/history?patient_id={patient_id}", headers=doctor_headers)
    assert doc_history_res.status_code == 200

    # 12. Doctor accesses UNASSIGNED patient history (should fail IDOR check)
    print("\n12. Fetching history by doctor for unassigned patient (should fail)...")
    doc_unassigned_hist_res = client.get(f"/api/heart/history?patient_id={unassigned_patient_id}", headers=doctor_headers)
    assert doc_unassigned_hist_res.status_code == 403
    print("OK Doctor blocked from reading history of unassigned patient.")

    print("\n=== ALL HEART PREDICTION TESTS COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    test_heart_predictions_and_idor()
