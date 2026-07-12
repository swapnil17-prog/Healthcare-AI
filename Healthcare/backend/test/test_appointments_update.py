import os
import sys
import time
from fastapi.testclient import TestClient

# Set up clean environment database
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

try:
    from app.main import app
except ImportError:
    sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))
    from app.main import app

client = TestClient(app)

def test_appointment_update_flow():
    print("=== STARTING APPOINTMENT UPDATE VERIFICATION ===")
    timestamp = int(time.time())

    # 1. Register users
    print("\n1. Registering users...")
    admin_data = {"name": "Admin Appt", "email": f"admin_appt_{timestamp}@example.com", "password": "adminpassword", "role": "admin"}
    doc_1_data = {"name": "Dr. Watson", "email": f"doc1_appt_{timestamp}@example.com", "password": "docpassword", "role": "doctor"}
    doc_2_data = {"name": "Dr. House", "email": f"doc2_appt_{timestamp}@example.com", "password": "docpassword", "role": "doctor"}
    pat_data = {"name": "Alice Green", "email": f"pat_appt_{timestamp}@example.com", "password": "patpassword", "role": "patient"}

    assert client.post("/api/auth/register", json=admin_data).status_code == 201
    assert client.post("/api/auth/register", json=doc_1_data).status_code == 201
    assert client.post("/api/auth/register", json=doc_2_data).status_code == 201
    assert client.post("/api/auth/register", json=pat_data).status_code == 201

    # 2. Authenticate
    print("\n2. Authenticating users...")
    admin_token = client.post("/api/auth/login", json={"email": admin_data["email"], "password": admin_data["password"]}).json()["access_token"]
    doc_1_token = client.post("/api/auth/login", json={"email": doc_1_data["email"], "password": doc_1_data["password"]}).json()["access_token"]
    doc_2_token = client.post("/api/auth/login", json={"email": doc_2_data["email"], "password": doc_2_data["password"]}).json()["access_token"]
    pat_token = client.post("/api/auth/login", json={"email": pat_data["email"], "password": pat_data["password"]}).json()["access_token"]

    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    doc_1_headers = {"Authorization": f"Bearer {doc_1_token}"}
    doc_2_headers = {"Authorization": f"Bearer {doc_2_token}"}
    pat_headers = {"Authorization": f"Bearer {pat_token}"}

    # 3. Find Patient & Doctor IDs
    print("\n3. Finding profiles...")
    patients_list = client.get("/api/patients", headers=admin_headers).json()["items"]
    patient_profile = next(p for p in patients_list if p["user"]["email"] == pat_data["email"])
    patient_id = patient_profile["id"]

    # Registering users returned user details, we can extract user IDs from register or login:
    me_doc_1 = client.get("/api/auth/me", headers=doc_1_headers).json()
    doc_1_user_id = me_doc_1["id"]

    me_doc_2 = client.get("/api/auth/me", headers=doc_2_headers).json()
    doc_2_user_id = me_doc_2["id"]

    # 4. Create appointment assigned to Dr. Watson (Doc 1)
    print("\n4. Creating test appointment...")
    appt_payload = {
        "patient_id": patient_id,
        "doctor_id": doc_1_user_id,
        "scheduled_at": "2026-08-01T10:00:00",
        "status": "Scheduled",
        "notes": "Initial discussion"
    }
    create_res = client.post("/api/appointments", json=appt_payload, headers=admin_headers)
    assert create_res.status_code == 201
    appt_id = create_res.json()["id"]

    # 5. Verify Unrelated Doctor (Dr. House) cannot update it
    print("\n5. Testing unrelated clinician access control...")
    update_res = client.put(f"/api/appointments/{appt_id}", json={"status": "Accepted"}, headers=doc_2_headers)
    assert update_res.status_code == 403
    print("OK Unrelated doctor is blocked.")

    # 6. Verify Patient cannot Accept/Complete their own appointment
    print("\n6. Testing patient action restrictions...")
    update_res = client.put(f"/api/appointments/{appt_id}", json={"status": "Accepted"}, headers=pat_headers)
    assert update_res.status_code == 403
    print("OK Patient is blocked from accepting.")

    # 7. Verify Assigned Doctor can Accept the appointment
    print("\n7. Testing assigned clinician accept action...")
    update_res = client.put(f"/api/appointments/{appt_id}", json={"status": "Accepted"}, headers=doc_1_headers)
    assert update_res.status_code == 200
    assert update_res.json()["status"] == "Accepted"
    print("OK Assigned doctor successfully accepted the appointment.")

    # 8. Verify Assigned Doctor can Reschedule the appointment
    print("\n8. Testing assigned clinician reschedule action...")
    new_time = "2026-08-01T15:00:00"
    update_res = client.put(f"/api/appointments/{appt_id}", json={"scheduled_at": new_time, "status": "Rescheduled"}, headers=doc_1_headers)
    assert update_res.status_code == 200
    assert update_res.json()["status"] == "Rescheduled"
    assert new_time in update_res.json()["scheduled_at"]
    print("OK Assigned doctor successfully rescheduled the appointment.")

    # 9. Verify Patient can Cancel their own appointment
    print("\n9. Testing patient cancellation...")
    update_res = client.put(f"/api/appointments/{appt_id}", json={"status": "Cancelled"}, headers=pat_headers)
    assert update_res.status_code == 200
    assert update_res.json()["status"] == "Cancelled"
    print("OK Patient successfully cancelled their own appointment.")

    # 10. Verify Admin can edit anything (reschedule and complete)
    print("\n10. Testing administrator global permissions...")
    update_res = client.put(f"/api/appointments/{appt_id}", json={"status": "Completed", "notes": "Admin completed notes"}, headers=admin_headers)
    assert update_res.status_code == 200
    assert update_res.json()["status"] == "Completed"
    assert update_res.json()["notes"] == "Admin completed notes"
    print("OK Administrator successfully completed appointment.")

    print("\n=== APPOINTMENT UPDATE VERIFICATION PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    test_appointment_update_flow()
