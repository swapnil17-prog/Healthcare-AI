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

def test_reports_upload_and_download():
    print("=== STARTING LAB REPORT UPLOAD & DOWNLOAD VERIFICATION ===")
    
    timestamp = int(time.time())
    
    # 1. Register test users
    print("\n1. Registering test users...")
    admin_data = {"name": "Admin Reports", "email": f"admin_rep_{timestamp}@example.com", "password": "adminpassword", "role": "admin"}
    doctor_data = {"name": "Dr. Watson", "email": f"doctor_rep_{timestamp}@example.com", "password": "doctorpassword", "role": "doctor"}
    patient_a_data = {"name": "Alice Green", "email": f"pat_rep_a_{timestamp}@example.com", "password": "patientpassword", "role": "patient"}
    patient_b_data = {"name": "Bob Brown", "email": f"pat_rep_b_{timestamp}@example.com", "password": "patientpassword", "role": "patient"}
    
    admin_res = client.post("/api/auth/register", json=admin_data)
    doctor_res = client.post("/api/auth/register", json=doctor_data)
    pat_a_res = client.post("/api/auth/register", json=patient_a_data)
    pat_b_res = client.post("/api/auth/register", json=patient_b_data)
    
    assert admin_res.status_code == 201
    assert doctor_res.status_code == 201
    assert pat_a_res.status_code == 201
    assert pat_b_res.status_code == 201
    
    doctor_user_id = doctor_res.json()["id"]
    print("OK Users registered.")

    # 2. Login to get tokens
    print("\n2. Logging in test users...")
    admin_token = client.post("/api/auth/login", json={"email": admin_data["email"], "password": admin_data["password"]}).json()["access_token"]
    doctor_token = client.post("/api/auth/login", json={"email": doctor_data["email"], "password": doctor_data["password"]}).json()["access_token"]
    pat_a_token = client.post("/api/auth/login", json={"email": patient_a_data["email"], "password": patient_a_data["password"]}).json()["access_token"]
    pat_b_token = client.post("/api/auth/login", json={"email": patient_b_data["email"], "password": patient_b_data["password"]}).json()["access_token"]
    
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    doctor_headers = {"Authorization": f"Bearer {doctor_token}"}
    pat_a_headers = {"Authorization": f"Bearer {pat_a_token}"}
    pat_b_headers = {"Authorization": f"Bearer {pat_b_token}"}
    
    print("OK Logins complete.")

    # 3. Retrieve Patient profile IDs
    print("\n3. Finding Patient profile IDs...")
    patients_list = client.get("/api/patients", headers=admin_headers).json()
    
    pat_a_profile = next(p for p in patients_list if p["user"]["email"] == patient_a_data["email"])
    pat_b_profile = next(p for p in patients_list if p["user"]["email"] == patient_b_data["email"])
    
    pat_a_id = pat_a_profile["id"]
    pat_b_id = pat_b_profile["id"]
    print(f"Patient A Profile ID: {pat_a_id}, Patient B Profile ID: {pat_b_id}")

    # 4. Create appointment to establish doctor assignment for Patient A
    print("\n4. Assigning Patient A to Doctor via appointment...")
    appt_payload = {
        "patient_id": pat_a_id,
        "doctor_id": doctor_user_id,
        "scheduled_at": "2026-07-05T14:30:00",
        "status": "Scheduled",
        "notes": "Reviewing blood work"
    }
    appt_res = client.post("/api/appointments", json=appt_payload, headers=admin_headers)
    assert appt_res.status_code == 201
    print("OK Doctor assigned to Patient A.")

    # 5. Upload valid CSV file as Patient A (own profile)
    print("\n5. Testing valid file upload (CSV)...")
    csv_content = "glucose,insulin,hbA1c\n110,85,5.7"
    files = {"file": ("blood_test.csv", csv_content, "text/csv")}
    form_data = {"report_type": "Glucose Panel"}
    
    upload_res = client.post(f"/api/patients/{pat_a_id}/reports", files=files, data=form_data, headers=pat_a_headers)
    print(f"Status Code: {upload_res.status_code}")
    print(f"Response Body: {upload_res.json()}")
    assert upload_res.status_code == 201
    report_id = upload_res.json()["id"]
    report_public_id = upload_res.json()["public_id"]
    assert "uploads/reports" in upload_res.json()["file_path"]
    assert upload_res.json()["report_type"] == "Glucose Panel"
    
    # Verify that a prediction is automatically triggered and saved with correct values
    predictions_res = client.get(f"/api/patients/{pat_a_id}/predictions", headers=pat_a_headers)
    assert predictions_res.status_code == 200
    preds_list = predictions_res.json()
    assert len(preds_list) > 0
    latest_pred = preds_list[-1]
    assert latest_pred["model_name"] == "Pima Indians Diabetes (via Lab Report)"
    assert latest_pred["input_features"]["glucose"] == 110.0
    assert latest_pred["input_features"]["insulin"] == 85.0
    print("OK Risk prediction automatically generated and verified.")
    print("OK Valid CSV file uploaded successfully.")


    # 6. Test invalid file extension upload (e.g. .exe)
    print("\n6. Testing invalid file extension rejection...")
    exe_content = b"MZ\x90\x00\x03\x00\x00\x00"
    files_exe = {"file": ("malicious.exe", exe_content, "application/octet-stream")}
    
    upload_exe_res = client.post(f"/api/patients/{pat_a_id}/reports", files=files_exe, data=form_data, headers=pat_a_headers)
    print(f"Status Code: {upload_exe_res.status_code}")
    print(f"Response Body: {upload_exe_res.json()}")
    assert upload_exe_res.status_code == 400
    assert "PDF and CSV files are allowed" in upload_exe_res.json()["detail"]
    print("OK Invalid file extension blocked correctly.")

    # 7. Test file too large (e.g. > 5MB)
    print("\n7. Testing file size limit (exceeding 5MB)...")
    large_content = b"x" * (6 * 1024 * 1024)  # 6 MB
    files_large = {"file": ("huge_scan.pdf", large_content, "application/pdf")}
    
    upload_large_res = client.post(f"/api/patients/{pat_a_id}/reports", files=files_large, data=form_data, headers=pat_a_headers)
    print(f"Status Code: {upload_large_res.status_code}")
    print(f"Response Body: {upload_large_res.json()}")
    assert upload_large_res.status_code == 400
    assert "Maximum size allowed is 5MB" in upload_large_res.json()["detail"]
    print("OK Over-sized file blocked correctly.")

    # 8. Test access control on listing reports
    print("\n8. Testing RBAC for listing reports...")
    
    # Doctor (assigned to Patient A) lists Patient A's reports (should succeed)
    list_doc_res = client.get(f"/api/patients/{pat_a_id}/reports", headers=doctor_headers)
    assert list_doc_res.status_code == 200
    assert len(list_doc_res.json()) >= 1
    print("OK Assigned Doctor can list Patient A reports.")

    # Patient B (unassigned) lists Patient A's reports (should fail)
    list_cross_res = client.get(f"/api/patients/{pat_a_id}/reports", headers=pat_b_headers)
    assert list_cross_res.status_code == 403
    print("OK Unrelated patient blocked from listing reports correctly.")

    # 9. Test downloading file
    print("\n9. Testing downloading lab reports...")
    
    # Patient A downloads their own report (should succeed)
    download_self_res = client.get(f"/api/reports/{report_public_id}/download", headers=pat_a_headers)
    assert download_self_res.status_code == 200
    assert download_self_res.text == csv_content
    print("OK Patient A downloaded their own report successfully.")

    # Doctor (assigned) downloads report (should succeed)
    download_doc_res = client.get(f"/api/reports/{report_public_id}/download", headers=doctor_headers)
    assert download_doc_res.status_code == 200
    assert download_doc_res.text == csv_content
    print("OK Assigned Doctor downloaded Patient A report successfully.")

    # Patient B (unassigned) attempts download (should fail)
    download_cross_res = client.get(f"/api/reports/{report_public_id}/download", headers=pat_b_headers)
    assert download_cross_res.status_code == 403
    print("OK Unrelated patient blocked from downloading report correctly.")

    print("\n=== LAB REPORT UPLOAD & DOWNLOAD VERIFICATION PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    test_reports_upload_and_download()
