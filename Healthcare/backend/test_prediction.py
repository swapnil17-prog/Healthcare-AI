import os
# Use a separate test database file to prevent polluting the main development database
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import sys
import time
from fastapi.testclient import TestClient

# Import app
try:
    from app.main import app
    from app.database.database import SessionLocal, Base, engine
except ImportError:
    import os
    sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))
    from app.main import app
    from app.database.database import SessionLocal, Base, engine

client = TestClient(app)

def test_prediction_and_referrals():
    print("=== STARTING PREDICTION & REFERRAL ENGINE VERIFICATION ===")
    
    timestamp = int(time.time())
    
    # 1. Register test users
    print("\n1. Registering test users...")
    admin_data = {"name": "Admin Prediction", "email": f"admin_pred_{timestamp}@example.com", "password": "adminpassword", "role": "admin"}
    doctor_data = {"name": "Dr. House", "email": f"doctor_pred_{timestamp}@example.com", "password": "doctorpassword", "role": "doctor"}
    patient_data = {"name": "Bob Smith", "email": f"patient_pred_{timestamp}@example.com", "password": "patientpassword", "role": "patient"}
    unassigned_patient_data = {"name": "Unassigned Patient", "email": f"patient_un_{timestamp}@example.com", "password": "patientpassword", "role": "patient"}
    
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
    
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    doctor_headers = {"Authorization": f"Bearer {doctor_token}"}
    patient_headers = {"Authorization": f"Bearer {patient_token}"}
    unassigned_headers = {"Authorization": f"Bearer {unassigned_token}"}
    
    print("OK Logins complete.")

    # 3. Retrieve Patient profile IDs
    print("\n3. Finding Patient profile IDs...")
    patients_list = client.get("/api/patients", headers=admin_headers).json()
    
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
        "notes": "Predictive screening appointment"
    }
    appt_res = client.post("/api/appointments", json=appt_payload, headers=admin_headers)
    assert appt_res.status_code == 201
    print("OK Assignment established.")

    # 5. Run High Risk prediction via Doctor
    print("\n5. Testing prediction for High Risk patient features...")
    high_risk_payload = {
        "pregnancies": 6,
        "glucose": 170.0,
        "blood_pressure": 95.0,
        "insulin": 300.0,
        "bmi": 38.5,
        "age": 48
    }
    
    pred_res = client.post(f"/api/predictions/{patient_id}", json=high_risk_payload, headers=doctor_headers)
    print(f"Status Code: {pred_res.status_code}")
    assert pred_res.status_code == 201, "Prediction request failed"
    pred_data = pred_res.json()
    print(f"Response: {pred_data}")
    
    # Assert ML Output
    assert pred_data["prediction"] == "High Risk"
    assert pred_data["risk_score"] > 50.0
    
    # Assert Rule-based Doctor Recommendations
    recs = pred_data["recommendations"]
    print(f"Recommendations returned: {recs}")
    assert any("Endocrinologist" in r for r in recs), "Missing Endocrinologist referral"
    assert any("Cardiologist" in r for r in recs), "Missing Cardiologist referral"
    assert any("Nutritionist" in r for r in recs), "Missing Nutritionist referral"
    print("OK High risk ML inference and rule engine referrals validated.")

    # 6. Run Low Risk prediction via Patient self-access
    print("\n6. Testing prediction for Low Risk patient features...")
    low_risk_payload = {
        "pregnancies": 1,
        "glucose": 95.0,
        "blood_pressure": 70.0,
        "insulin": 60.0,
        "bmi": 21.5,
        "age": 23
    }
    
    pred_low_res = client.post(f"/api/predictions/{patient_id}", json=low_risk_payload, headers=patient_headers)
    print(f"Status Code: {pred_low_res.status_code}")
    assert pred_low_res.status_code == 201
    pred_low_data = pred_low_res.json()
    print(f"Response: {pred_low_data}")
    
    # Assert ML Output
    assert pred_low_data["prediction"] == "Low Risk"
    
    # Assert Default referral to GP (General Practitioner) since no triggers met
    low_recs = pred_low_data["recommendations"]
    print(f"Low risk recommendations: {low_recs}")
    assert len(low_recs) == 1
    assert "General Practitioner" in low_recs[0]
    print("OK Low risk ML inference and default General Practitioner referral validated.")

    # 7. Check database prediction history retrieval
    print("\n7. Fetching patient prediction history...")
    history_res = client.get(f"/api/patients/{patient_id}/predictions", headers=patient_headers)
    assert history_res.status_code == 200
    history_data = history_res.json()
    print(f"Predictions in history: {len(history_data)}")
    assert len(history_data) >= 2
    print("OK Historical predictions persisted and retrieved correctly.")

    # 8. Test access control on unassigned patient prediction
    print("\n8. Testing RBAC validation on unassigned patient...")
    # Doctor tries to predict for unassigned patient
    un_pred_res = client.post(f"/api/predictions/{unassigned_patient_id}", json=low_risk_payload, headers=doctor_headers)
    assert un_pred_res.status_code == 201
    print("OK Doctor can run predictions on any patient.")
    
    # Patient tries to view unassigned patient history
    un_hist_res = client.get(f"/api/patients/{unassigned_patient_id}/predictions", headers=patient_headers)
    assert un_hist_res.status_code == 403
    print("OK Patient blocked from viewing another patient's prediction history.")

    print("\n=== PREDICTION & REFERRAL ENGINE VERIFICATION PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    test_prediction_and_referrals()
