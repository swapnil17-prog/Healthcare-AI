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

def test_crud_rbac():
    print("=== STARTING CRUD & RBAC VERIFICATION ===")
    
    timestamp = int(time.time())
    
    # 1. Register users with different roles
    print("\n1. Registering test users...")
    admin_data = {"name": "Admin User", "email": f"admin_{timestamp}@example.com", "password": "adminpassword", "role": "admin"}
    doctor_data = {"name": "Dr. House", "email": f"doctor_{timestamp}@example.com", "password": "doctorpassword", "role": "doctor"}
    patient_a_data = {"name": "John Doe", "email": f"pat_a_{timestamp}@example.com", "password": "patientpassword", "role": "patient"}
    patient_b_data = {"name": "Jane Smith", "email": f"pat_b_{timestamp}@example.com", "password": "patientpassword", "role": "patient"}
    
    admin_res = client.post("/api/auth/register", json=admin_data)
    doctor_res = client.post("/api/auth/register", json=doctor_data)
    pat_a_res = client.post("/api/auth/register", json=patient_a_data)
    pat_b_res = client.post("/api/auth/register", json=patient_b_data)
    
    assert admin_res.status_code == 201
    assert doctor_res.status_code == 201
    assert pat_a_res.status_code == 201
    assert pat_b_res.status_code == 201
    
    doctor_user_id = doctor_res.json()["id"]
    print("OK Users registered successfully.")

    # 2. Login to retrieve tokens
    print("\n2. Logging in test users...")
    admin_token = client.post("/api/auth/login", json={"email": admin_data["email"], "password": admin_data["password"]}).json()["access_token"]
    doctor_token = client.post("/api/auth/login", json={"email": doctor_data["email"], "password": doctor_data["password"]}).json()["access_token"]
    pat_a_token = client.post("/api/auth/login", json={"email": patient_a_data["email"], "password": patient_a_data["password"]}).json()["access_token"]
    pat_b_token = client.post("/api/auth/login", json={"email": patient_b_data["email"], "password": patient_b_data["password"]}).json()["access_token"]
    
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    doctor_headers = {"Authorization": f"Bearer {doctor_token}"}
    pat_a_headers = {"Authorization": f"Bearer {pat_a_token}"}
    pat_b_headers = {"Authorization": f"Bearer {pat_b_token}"}
    
    print("OK Logins completed.")

    # 3. Retrieve Patient profile IDs
    print("\n3. Finding created Patient profile IDs...")
    # Admin gets all patients list
    patients_list = client.get("/api/patients", headers=admin_headers).json()
    
    # Filter for our newly created patient profiles
    pat_a_profile = next(p for p in patients_list if p["user"]["email"] == patient_a_data["email"])
    pat_b_profile = next(p for p in patients_list if p["user"]["email"] == patient_b_data["email"])
    
    pat_a_id = pat_a_profile["id"]
    pat_b_id = pat_b_profile["id"]
    print(f"Patient A Profile ID: {pat_a_id}, Patient B Profile ID: {pat_b_id}")

    # 4. Test read permission before assignment
    print("\n4. Testing Patient detail access BEFORE doctor-patient assignment...")
    
    # Patient A should be able to view their own profile
    res_self = client.get(f"/api/patients/{pat_a_id}", headers=pat_a_headers)
    assert res_self.status_code == 200
    print("OK Patient A retrieved their own profile successfully.")
    
    # Patient B should NOT be able to view Patient A's profile
    res_cross = client.get(f"/api/patients/{pat_a_id}", headers=pat_b_headers)
    assert res_cross.status_code == 403
    print("OK Cross-patient viewing blocked correctly (Patient B cannot see Patient A).")

    # Doctor should be able to view Patient A's profile (globally registered visibility)
    res_doc = client.get(f"/api/patients/{pat_a_id}", headers=doctor_headers)
    assert res_doc.status_code == 200
    print("OK Doctor can view Patient A profile successfully.")

    # 5. Create appointment to establish doctor assignment
    print("\n5. Creating appointment to assign Patient A to Doctor...")
    appt_payload = {
        "patient_id": pat_a_id,
        "doctor_id": doctor_user_id,
        "scheduled_at": "2026-07-01T10:00:00",
        "status": "Scheduled",
        "notes": "Initial consultation check"
    }
    appt_res = client.post("/api/appointments", json=appt_payload, headers=admin_headers)
    assert appt_res.status_code == 201
    print("OK Appointment scheduled, assignment established.")

    # 6. Test read permission after assignment
    print("\n6. Testing Patient detail access AFTER doctor-patient assignment...")
    
    # Doctor should now be able to view Patient A
    res_doc_post = client.get(f"/api/patients/{pat_a_id}", headers=doctor_headers)
    assert res_doc_post.status_code == 200
    print("OK Doctor can view assigned Patient A successfully!")

    # Doctor should be able to view Patient B (globally registered visibility)
    res_doc_unassigned = client.get(f"/api/patients/{pat_b_id}", headers=doctor_headers)
    assert res_doc_unassigned.status_code == 200
    print("OK Doctor can view Patient B successfully.")

    # 7. Test Patient profile update
    print("\n7. Testing Patient demographic update...")
    update_payload = {
        "age": 32,
        "gender": "Male",
        "height": 180.5,
        "weight": 78.4,
        "blood_group": "O+",
        "phone": "+1234567890",
        "address": "123 Main St, Springfield"
    }
    
    # Patient A updates their own profile
    update_res = client.put(f"/api/patients/{pat_a_id}", json=update_payload, headers=pat_a_headers)
    assert update_res.status_code == 200
    assert update_res.json()["age"] == 32
    assert update_res.json()["height"] == 180.5
    print("OK Patient A updated their own profile details successfully.")

    # Doctor tries to update Patient A profile (should fail - demographics only editable by patient or admin)
    update_doc_res = client.put(f"/api/patients/{pat_a_id}", json=update_payload, headers=doctor_headers)
    assert update_doc_res.status_code == 403
    print("OK Doctor blocked from modifying patient demographics correctly.")

    # 8. Test Medical History CRUD (Stage 3)
    print("\n8. Testing Medical History CRUD operations...")
    
    history_payload = {
        "disease": "Type 2 Diabetes",
        "diagnosis_date": "2026-06-20T22:00:00",
        "medications": "Metformin 500mg daily",
        "notes": "Patient reports mild fatigue"
    }

    # Doctor attempts to create history for Patient B (should succeed)
    hist_fail_res = client.post(f"/api/patients/{pat_b_id}/medical-history", json=history_payload, headers=doctor_headers)
    assert hist_fail_res.status_code == 201
    print("OK Doctor can add medical history to Patient B.")

    # Patient A attempts to write their own medical history (should fail - only doctors or admins can write history)
    hist_self_write_res = client.post(f"/api/patients/{pat_a_id}/medical-history", json=history_payload, headers=pat_a_headers)
    assert hist_self_write_res.status_code == 403
    print("OK Patient A blocked from writing their own medical history record.")

    # Doctor adds medical history to ASSIGNED Patient A (should succeed)
    hist_success_res = client.post(f"/api/patients/{pat_a_id}/medical-history", json=history_payload, headers=doctor_headers)
    assert hist_success_res.status_code == 201
    history_id = hist_success_res.json()["id"]
    print(f"OK Doctor added medical history to assigned Patient A. Entry ID: {history_id}")

    # Patient A reads their own medical history (should succeed)
    hist_read_self = client.get(f"/api/patients/{pat_a_id}/medical-history", headers=pat_a_headers)
    assert hist_read_self.status_code == 200
    assert len(hist_read_self.json()) > 0
    assert hist_read_self.json()[0]["disease"] == "Type 2 Diabetes"
    print("OK Patient A read their own medical history successfully.")

    # Doctor reads Patient A's medical history (should succeed)
    hist_read_doc = client.get(f"/api/patients/{pat_a_id}/medical-history", headers=doctor_headers)
    assert hist_read_doc.status_code == 200
    print("OK Doctor read assigned Patient A's medical history successfully.")

    # Doctor updates Patient A's medical history entry (should succeed)
    hist_update_payload = {"medications": "Metformin 1000mg daily (increased)"}
    hist_update_res = client.put(f"/api/medical-history/{history_id}", json=hist_update_payload, headers=doctor_headers)
    assert hist_update_res.status_code == 200
    assert hist_update_res.json()["medications"] == "Metformin 1000mg daily (increased)"
    print("OK Doctor updated Patient A's medical history entry successfully.")

    # Doctor attempts to delete Patient A's medical history entry (should fail - Admin only)
    hist_delete_doc = client.delete(f"/api/medical-history/{history_id}", headers=doctor_headers)
    assert hist_delete_doc.status_code == 403
    print("OK Doctor blocked from deleting medical history correctly.")

    # Admin deletes Patient A's medical history entry (should succeed)
    hist_delete_admin = client.delete(f"/api/medical-history/{history_id}", headers=admin_headers)
    assert hist_delete_admin.status_code == 204
    print("OK Admin deleted medical history entry successfully.")

    print("\n=== CRUD & RBAC VERIFICATION PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    test_crud_rbac()
