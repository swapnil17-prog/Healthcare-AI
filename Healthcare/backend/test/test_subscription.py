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

def test_subscription_and_usage_enforcement():
    print("=== STARTING SUBSCRIPTION & USAGE ENFORCEMENT VERIFICATION ===")
    
    timestamp = int(time.time())
    
    # 1. Register test patient
    print("\n1. Registering test patient...")
    patient_data = {
        "name": "Sub Test Patient",
        "email": f"sub_patient_{timestamp}@example.com",
        "password": "subpassword123",
        "role": "patient"
    }
    reg_res = client.post("/api/auth/register", json=patient_data)
    assert reg_res.status_code == 201
    patient_user_id = reg_res.json()["id"]
    
    # 2. Login to get token
    login_res = client.post("/api/auth/login", json={"email": patient_data["email"], "password": patient_data["password"]})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # 3. Retrieve Patient profile ID
    patients_list = client.get("/api/patients", headers=headers).json()
    items = patients_list.get("items", patients_list) if isinstance(patients_list, dict) else patients_list
    patient_profile = next(p for p in items if p["user"]["email"] == patient_data["email"])
    patient_id = patient_profile["id"]
    print(f"OK Patient registered with Profile ID: {patient_id}")
    
    # 4. Fetch available plans
    print("\n2. Testing /api/subscription/plans...")
    plans_res = client.get("/api/subscription/plans")
    assert plans_res.status_code == 200
    plans = plans_res.json()
    assert len(plans) >= 3
    plan_codes = [p["code"] for p in plans]
    assert "Free" in plan_codes
    assert "Pro" in plan_codes
    assert "Clinical" in plan_codes
    print("OK Subscription plans retrieved successfully.")
    
    # 5. Fetch current subscription (should default to Free)
    print("\n3. Testing /api/subscription/current (Default Free Tier)...")
    curr_res = client.get("/api/subscription/current", headers=headers)
    assert curr_res.status_code == 200
    curr_data = curr_res.json()
    assert curr_data["subscription_tier"] == "Free"
    assert curr_data["usage_stats"]["diabetes_predictions_used"] == 0
    assert curr_data["usage_stats"]["diabetes_predictions_limit"] == 3
    assert curr_data["usage_stats"]["heart_predictions_allowed"] == False
    print("OK Default Free tier and initial usage stats verified.")
    
    # 6. Test Heart Prediction Block on Free Tier (402 Payment Required)
    print("\n4. Testing Heart Disease screening lock on Free tier...")
    heart_payload = {
        "age_years": 45,
        "gender": 1,
        "height": 165,
        "weight": 70,
        "ap_hi": 120,
        "ap_lo": 80,
        "cholesterol": 1,
        "gluc": 1,
        "smoke": 0,
        "alco": 0,
        "active": 1
    }
    heart_res = client.post("/api/heart/predict", json=heart_payload, headers=headers)
    assert heart_res.status_code in [402, 429]
    print("OK Heart Disease screening blocked on Free tier as expected.")
    
    # 7. Test Diabetes Prediction Limit (3 allowed on Free)
    print("\n5. Testing Diabetes Risk prediction limits (Free tier)...")
    pred_payload = {
        "pregnancies": 1,
        "glucose": 110,
        "blood_pressure": 75,
        "insulin": 80,
        "bmi": 24.5,
        "age": 30
    }
    
    # Run 3 predictions (should all succeed)
    for i in range(1, 4):
        p_res = client.post(f"/api/predictions/{patient_id}", json=pred_payload, headers=headers)
        assert p_res.status_code == 201, f"Prediction {i} failed: {p_res.text}"
        print(f"OK Prediction {i}/3 succeeded.")
        
    # Attempt 4th prediction (should be blocked with 429)
    blocked_res = client.post(f"/api/predictions/{patient_id}", json=pred_payload, headers=headers)
    assert blocked_res.status_code == 429
    assert blocked_res.json()["detail"]["error"] == "limit_reached"
    print("OK 4th Diabetes prediction blocked with HTTP 429 Limit Reached as expected.")
    
    # 8. Test Mock Subscription Upgrade to Pro
    print("\n6. Testing Mock Upgrade to Pro Plan...")
    upgrade_res = client.post("/api/subscription/upgrade", json={"plan_code": "Pro", "payment_method": "mock"}, headers=headers)
    assert upgrade_res.status_code == 200
    assert upgrade_res.json()["subscription_tier"] == "Pro"
    print("OK Successfully upgraded to Pro plan via Mock payment.")
    
    # 9. Verify upgraded status and unlocked features
    print("\n7. Verifying feature unlocks on Pro tier...")
    updated_curr = client.get("/api/subscription/current", headers=headers).json()
    assert updated_curr["subscription_tier"] == "Pro"
    assert updated_curr["usage_stats"]["heart_predictions_allowed"] == True
    assert updated_curr["usage_stats"]["pdf_downloads_allowed"] == True
    
    # Heart prediction should now succeed!
    heart_pro_res = client.post("/api/heart/predict", json=heart_payload, headers=headers)
    assert heart_pro_res.status_code == 200
    assert heart_pro_res.json()["risk_level"] in ["Low", "Medium", "High"]
    print("OK Heart Disease screening now succeeded on Pro plan!")
    
    # 5th Diabetes prediction should now succeed (unlimited on Pro)!
    pred_pro_res = client.post(f"/api/predictions/{patient_id}", json=pred_payload, headers=headers)
    assert pred_pro_res.status_code == 201
    print("OK 5th Diabetes prediction succeeded on Pro plan (Unlimited)!")
    
    print("\n=== ALL SUBSCRIPTION & USAGE TESTS PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    test_subscription_and_usage_enforcement()
