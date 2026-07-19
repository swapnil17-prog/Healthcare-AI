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

def test_admin_subscription_management():
    print("=== STARTING ADMIN SUBSCRIPTION MANAGEMENT TEST SUITE ===")
    
    timestamp = int(time.time())

    # 1. Register & Login Admin
    print("\n1. Registering and logging in Admin user...")
    admin_data = {
        "name": "Super Admin Sub",
        "email": f"admin_sub_{timestamp}@example.com",
        "password": "adminpassword123",
        "role": "admin"
    }
    r_admin = client.post("/api/auth/register", json=admin_data)
    assert r_admin.status_code == 201
    
    login_admin = client.post("/api/auth/login", json={"email": admin_data["email"], "password": admin_data["password"]}).json()
    admin_headers = {"Authorization": f"Bearer {login_admin['access_token']}"}

    # 2. Register Test Patient & Test Doctor
    print("\n2. Registering test Patient and Doctor...")
    pat_data = {
        "name": "Sub Patient One",
        "email": f"sub_pat_{timestamp}@example.com",
        "password": "patientpassword",
        "role": "patient"
    }
    r_pat = client.post("/api/auth/register", json=pat_data)
    assert r_pat.status_code == 201
    pat_id = r_pat.json()["id"]

    doc_data = {
        "name": "Sub Doctor One",
        "email": f"sub_doc_{timestamp}@example.com",
        "password": "doctorpassword",
        "role": "doctor"
    }
    r_doc = client.post("/api/auth/register", json=doc_data)
    assert r_doc.status_code == 201
    doc_id = r_doc.json()["id"]

    # 3. Admin fetches GET /api/admin/subscriptions
    print("\n3. Fetching all user subscriptions as Admin...")
    subs_res = client.get("/api/admin/subscriptions", headers=admin_headers)
    assert subs_res.status_code == 200
    subs_data = subs_res.json()
    items = subs_data["items"]
    user_ids = [u["id"] for u in items]
    assert pat_id in user_ids
    assert doc_id in user_ids
    print("OK Admin successfully retrieved user subscriptions list.")

    # 4. Admin upgrades Patient to Pro tier
    print("\n4. Admin upgrading Patient to Pro tier...")
    upg_pat_res = client.post(
        f"/api/admin/subscriptions/{pat_id}/upgrade",
        json={"plan_code": "Pro"},
        headers=admin_headers
    )
    assert upg_pat_res.status_code == 200
    assert upg_pat_res.json()["subscription_tier"] == "Pro"
    print("OK Patient upgraded to Pro by Admin.")

    # 5. Admin upgrades Doctor to Clinical Plus tier
    print("\n5. Admin upgrading Doctor to Doc_Clinical_Plus tier...")
    upg_doc_res = client.post(
        f"/api/admin/subscriptions/{doc_id}/upgrade",
        json={"plan_code": "Doc_Clinical_Plus"},
        headers=admin_headers
    )
    assert upg_doc_res.status_code == 200
    assert upg_doc_res.json()["subscription_tier"] == "Doc_Clinical_Plus"
    print("OK Doctor upgraded to Doc_Clinical_Plus by Admin.")

    # 6. Admin cancels Patient subscription
    print("\n6. Admin cancelling Patient subscription...")
    cancel_pat_res = client.post(
        f"/api/admin/subscriptions/{pat_id}/cancel",
        headers=admin_headers
    )
    assert cancel_pat_res.status_code == 200
    assert cancel_pat_res.json()["subscription_tier"] == "Free"
    print("OK Patient subscription cancelled back to Free by Admin.")

    # 7. Test Authorization: Non-admin calling /api/admin/subscriptions
    print("\n7. Verifying non-admin access controls (HTTP 403 Forbidden)...")
    pat_login = client.post("/api/auth/login", json={"email": pat_data["email"], "password": pat_data["password"]}).json()
    pat_headers = {"Authorization": f"Bearer {pat_login['access_token']}"}

    forbidden_res = client.get("/api/admin/subscriptions", headers=pat_headers)
    assert forbidden_res.status_code == 403
    print("OK Non-admin request correctly rejected with HTTP 403 Forbidden.")

    print("\n=== ALL ADMIN SUBSCRIPTION MANAGEMENT TESTS PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    test_admin_subscription_management()
