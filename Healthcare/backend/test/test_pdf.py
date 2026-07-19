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

def test_pdf_report_generation():
    print("=== STARTING PDF REPORT GENERATION VERIFICATION ===")
    
    timestamp = int(time.time())
    
    # 1. Register and login test patient
    print("\n1. Registering test patient...")
    patient_data = {"name": "PDF Patient", "email": f"pat_pdf_{timestamp}@example.com", "password": "patientpassword", "role": "patient"}
    reg_res = client.post("/api/auth/register", json=patient_data)
    assert reg_res.status_code == 201
    
    print("\n2. Logging in test patient...")
    login_res = client.post("/api/auth/login", json={"email": patient_data["email"], "password": patient_data["password"]})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    client.post("/api/subscription/upgrade", json={"plan_code": "Pro"}, headers=headers)
    
    # Get Patient ID
    patients_list = client.get("/api/patients", headers=headers).json()["items"]
    patient_id = patients_list[0]["id"]
    print(f"Patient Profile ID: {patient_id}")

    # 3. Create a risk prediction for patient
    print("\n3. Creating risk prediction for patient history...")
    prediction_payload = {
        "pregnancies": 2,
        "glucose": 130.0,
        "blood_pressure": 82.0,
        "insulin": 100.0,
        "bmi": 28.5,
        "age": 33
    }
    pred_res = client.post(f"/api/predictions/{patient_id}", json=prediction_payload, headers=headers)
    assert pred_res.status_code == 201
    print("OK Patient prediction record written.")

    # 3.5. Create a heart disease prediction for patient
    print("\n3.5. Creating heart disease prediction for patient history...")
    heart_payload = {
        "age_years": 45,
        "gender": 1,
        "height": 165,
        "weight": 70.0,
        "ap_hi": 125,
        "ap_lo": 82,
        "cholesterol": 1,
        "gluc": 1,
        "smoke": 0,
        "alco": 0,
        "active": 1
    }
    heart_res = client.post("/api/heart/predict", json=heart_payload, headers=headers)
    assert heart_res.status_code == 200
    print("OK Patient heart prediction record written.")

    # 4. Generate PDF Report
    print("\n4. Triggering PDF Generation request...")
    pdf_res = client.get(f"/api/patients/{patient_id}/pdf-report", headers=headers)
    print(f"Status Code: {pdf_res.status_code}")
    assert pdf_res.status_code == 200
    
    # 5. Validate PDF header content
    content = pdf_res.content
    print(f"PDF Size: {len(content)} bytes")
    
    # Check magic bytes for PDF format
    assert content.startswith(b"%PDF"), "Response is not a valid PDF file"
    print("OK PDF format magic bytes (%PDF) verified.")
    print("OK PDF report compiles and downloads successfully.")

    print("\n=== PDF REPORT GENERATION VERIFICATION PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    test_pdf_report_generation()
