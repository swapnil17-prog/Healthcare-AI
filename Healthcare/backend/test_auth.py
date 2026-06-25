import os
# Use a separate test database file to prevent polluting the main development database
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import sys
import time
import subprocess
from fastapi.testclient import TestClient

# Import app
try:
    from app.main import app
    from app.database.database import SessionLocal, Base, engine
except ImportError:
    # Adjust path if running directly
    import os
    sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))
    from app.main import app
    from app.database.database import SessionLocal, Base, engine

client = TestClient(app)

def test_auth_flow():
    print("=== STARTING AUTH VERIFICATION ===")
    
    # 1. Test registration
    print("\n1. Testing User Registration...")
    reg_data = {
        "name": "Dr. Alice Smith",
        "email": f"alice.smith_{int(time.time())}@example.com",
        "password": "securepassword123",
        "role": "doctor"
    }
    
    response = client.post("/api/auth/register", json=reg_data)
    print(f"Status Code: {response.status_code}")
    print(f"Response Body: {response.json()}")
    assert response.status_code == 201, "Registration failed"
    assert response.json()["email"] == reg_data["email"]
    assert response.json()["role"] == "doctor"
    print("OK Registration successful!")

    # 2. Test duplicate registration
    print("\n2. Testing Duplicate Registration...")
    response_dup = client.post("/api/auth/register", json=reg_data)
    print(f"Status Code: {response_dup.status_code}")
    print(f"Response Body: {response_dup.json()}")
    assert response_dup.status_code == 400, "Duplicate registration allowed"
    print("OK Duplicate registration rejected correctly!")

    # 3. Test login
    print("\n3. Testing User Login...")
    login_data = {
        "email": reg_data["email"],
        "password": reg_data["password"]
    }
    response_login = client.post("/api/auth/login", json=login_data)
    print(f"Status Code: {response_login.status_code}")
    login_json = response_login.json()
    print(f"Response Body: {login_json}")
    assert response_login.status_code == 200, "Login failed"
    assert "access_token" in login_json
    assert "refresh_token" in response_login.cookies
    assert login_json["role"] == "doctor"
    print("OK Login successful, JWT issued!")

    access_token = login_json["access_token"]

    # 4. Test protected /me endpoint with valid token
    print("\n4. Testing /me endpoint with valid token...")
    headers = {"Authorization": f"Bearer {access_token}"}
    response_me = client.get("/api/auth/me", headers=headers)
    print(f"Status Code: {response_me.status_code}")
    print(f"Response Body: {response_me.json()}")
    assert response_me.status_code == 200, "Accessing /me failed"
    assert response_me.json()["email"] == reg_data["email"]
    print("OK Accessing protected /me endpoint successful!")

    # 5. Test protected /me endpoint with invalid token
    print("\n5. Testing /me endpoint with invalid token...")
    headers_invalid = {"Authorization": "Bearer invalid_token_value"}
    response_me_inv = client.get("/api/auth/me", headers=headers_invalid)
    print(f"Status Code: {response_me_inv.status_code}")
    print(f"Response Body: {response_me_inv.json()}")
    assert response_me_inv.status_code == 401, "Invalid token allowed"
    print("OK Invalid token rejected correctly!")

    # 6. Test token refresh
    print("\n6. Testing token refresh via cookies...")
    response_refresh = client.post("/api/auth/refresh")
    print(f"Status Code: {response_refresh.status_code}")
    print(f"Response Body: {response_refresh.json()}")
    assert response_refresh.status_code == 200, "Token refresh failed"
    assert "access_token" in response_refresh.json()
    assert "refresh_token" in response_refresh.cookies
    print("OK Token refresh successful via secure cookies!")

    # 7. Test logout
    print("\n7. Testing user logout...")
    response_logout = client.post("/api/auth/logout")
    print(f"Status Code: {response_logout.status_code}")
    assert response_logout.status_code == 204, "Logout failed"
    assert response_logout.cookies.get("refresh_token") == "" or "refresh_token" not in response_logout.cookies
    print("OK Logout successful, refresh token cookie cleared!")

    print("\n=== AUTH VERIFICATION PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    test_auth_flow()
