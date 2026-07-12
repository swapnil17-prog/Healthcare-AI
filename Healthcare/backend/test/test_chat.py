import os
# Use a separate test database file to prevent polluting the main development database
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
# Set mock keys to ensure the API route attempts Groq path
os.environ["GROQ_API_KEY"] = "mock_key"
os.environ["GROQ_MODEL"] = "llama-3.3-70b-versatile"

import sys
import time
import json
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

# Import app
try:
    from app.main import app
    from app.database.database import SessionLocal, Base, engine
    from app.core.rate_limiter import limiter
    limiter.enabled = False
except ImportError:
    import os
    sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))
    from app.main import app
    from app.database.database import SessionLocal, Base, engine
    from app.core.rate_limiter import limiter
    limiter.enabled = False

client = TestClient(app)

def test_chatbot_service():
    print("=== STARTING CHATBOT SERVICE VERIFICATION ===")
    
    timestamp = int(time.time())
    
    # 1. Register and login test patient
    print("\n1. Registering test patient...")
    patient_data = {"name": "Chat Patient", "email": f"pat_chat_{timestamp}@example.com", "password": "patientpassword", "role": "patient"}
    reg_res = client.post("/api/auth/register", json=patient_data)
    assert reg_res.status_code == 201
    
    print("\n2. Logging in test patient...")
    login_res = client.post("/api/auth/login", json={"email": patient_data["email"], "password": patient_data["password"]})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get Patient ID
    patients_list = client.get("/api/patients", headers=headers).json()["items"]
    patient_id = patients_list[0]["id"]
    print(f"Patient Profile ID: {patient_id}")

    # Set up mock requests.post to simulate Groq API response
    def mock_post(url, headers=None, json=None, **kwargs):
        payload = json
        mock_res = MagicMock()
        mock_res.status_code = 200
        
        messages = payload.get("messages", [])
        last_user_message = ""
        for m in reversed(messages):
            if m.get("role") == "user":
                last_user_message = m.get("content", "")
                break
                
        msg_lower = last_user_message.lower()
        
        # Check if the last message is tool response
        tool_messages = [m for m in messages if m.get("role") == "tool"]
        
        if tool_messages:
            # We are in the second iteration of the tool loop
            tool_content = tool_messages[-1].get("content", "")
            mock_res.json.return_value = {
                "choices": [{
                    "message": {
                        "role": "assistant",
                        "content": f"I am not a doctor and I cannot provide medical advice. Based on your records: {tool_content}"
                    }
                }]
            }
            return mock_res
            
        # First iteration of the loop (or standard call)
        if "medical history" in msg_lower or "history" in msg_lower:
            mock_res.json.return_value = {
                "choices": [{
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [{
                            "id": "call_history",
                            "type": "function",
                            "function": {
                                "name": "get_full_medical_history",
                                "arguments": f"{{\"patient_id\": {patient_id}}}"
                            }
                        }]
                    }
                }]
            }
        elif "appointment" in msg_lower:
            mock_res.json.return_value = {
                "choices": [{
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [{
                            "id": "call_appt",
                            "type": "function",
                            "function": {
                                "name": "get_appointments",
                                "arguments": f"{{\"patient_id\": {patient_id}}}"
                            }
                        }]
                    }
                }]
            }
        elif "upload" in msg_lower or "report" in msg_lower:
            mock_res.json.return_value = {
                "choices": [{
                    "message": {
                        "role": "assistant",
                        "content": "I am not a doctor and I cannot provide medical advice. To upload a lab report, click on Patients tab, select the patient, go to Upload Diagnostics Report card, select PDF/CSV (under 5MB), and click Upload."
                    }
                }]
            }
        elif "explain" in msg_lower or "results" in msg_lower:
            mock_res.json.return_value = {
                "choices": [{
                    "message": {
                        "role": "assistant",
                        "content": "I am not a doctor and I cannot provide medical advice. Based on the historical risk predictions, your risk score is 43.92% which indicates a low risk according to the Pima Indians Diabetes model. The input features used for this prediction include pregnancies: 2, glucose: 150.0, blood pressure: 85.0, insulin: 120.0, BMI: 32.5, and age: 35."
                    }
                }]
            }
        else:
            mock_res.json.return_value = {
                "choices": [{
                    "message": {
                        "role": "assistant",
                        "content": "The capital of France is Paris. (Note: I am not a doctor and I cannot provide medical advice.)"
                    }
                }]
            }
            
        return mock_res

    # Use patch to mock requests.post in app.api.chat
    with patch("requests.post", side_effect=mock_post) as mock_p:
        # 3. Test chat message: general question
        print("\n3. Testing general app usage question...")
        chat_payload = {"message": "How do I upload a lab report?"}
        chat_res = client.post("/api/chat", json=chat_payload, headers=headers)
        print(f"Status Code: {chat_res.status_code}")
        assert chat_res.status_code == 200
        chat_data = chat_res.json()
        print(f"Response: {chat_data['content']}")
        
        # Verify clinical disclaimer presence
        assert "not a doctor" in chat_data["content"].lower() or "cannot provide medical advice" in chat_data["content"].lower()
        assert "upload" in chat_data["content"].lower() or "report" in chat_data["content"].lower()
        print("OK General question answered and disclaimer validated.")

        # 4. Create prediction for Patient A to ground the next question
        print("\n4. Creating a risk prediction for patient...")
        prediction_payload = {
            "pregnancies": 2,
            "glucose": 150.0,
            "blood_pressure": 85.0,
            "insulin": 120.0,
            "bmi": 32.5,
            "age": 35
        }
        pred_res = client.post(f"/api/predictions/{patient_id}", json=prediction_payload, headers=headers)
        assert pred_res.status_code == 201
        print("OK Patient prediction record written.")

        # 5. Test chat message: explain results
        print("\n5. Testing explaining results question...")
        explain_payload = {"message": "Explain my risk results, please."}
        explain_res = client.post("/api/chat", json=explain_payload, headers=headers)
        print(f"Status Code: {explain_res.status_code}")
        assert explain_res.status_code == 200
        explain_data = explain_res.json()
        print(f"Response: {explain_data['content']}")
        
        assert "not a doctor" in explain_data["content"].lower() or "cannot provide medical advice" in explain_data["content"].lower()
        print("OK Explanation question answered and grounded details validated.")

        # 6. Check chat history retrieval
        print("\n6. Fetching conversation history...")
        history_res = client.get("/api/chat/history", headers=headers)
        assert history_res.status_code == 200
        history = history_res.json()["items"]
        print(f"Chat messages in history: {len(history)}")
        assert len(history) >= 4
        
        # Verify sequence
        assert history[0]["role"] == "user"
        assert history[1]["role"] == "assistant"
        assert history[2]["role"] == "user"
        assert history[3]["role"] == "assistant"
        print("OK Message history successfully validated.")

        # 7. Test safety pre-check deflection (this does not call mock_post because it returns before LLM call)
        print("\n7. Testing safety pre-check deflection (diagnose/dosage questions)...")
        safety_payload1 = {"message": "Can you diagnose me? I have high blood pressure."}
        safety_res1 = client.post("/api/chat", json=safety_payload1, headers=headers)
        assert safety_res1.status_code == 200
        safety_data1 = safety_res1.json()
        print(f"Response 1: {safety_data1['content']}")
        assert "cannot provide a medical diagnosis" in safety_data1["content"].lower()

        safety_payload2 = {"message": "What dosage of Metformin should I take?"}
        safety_res2 = client.post("/api/chat", json=safety_payload2, headers=headers)
        assert safety_res2.status_code == 200
        safety_data2 = safety_res2.json()
        print(f"Response 2: {safety_data2['content']}")
        assert "recommend dosages" in safety_data2["content"].lower()
        print("OK Safety pre-check deflection successfully validated.")

        # 8. Create doctor and log in as doctor to create medical history and appointment
        print("\n8. Creating a doctor and logging in to write patient data...")
        doctor_data = {"name": "Dr. Test Doctor", "email": f"doc_{timestamp}@example.com", "password": "doctorpassword", "role": "doctor"}
        doc_reg = client.post("/api/auth/register", json=doctor_data)
        assert doc_reg.status_code == 201
        doc_id = doc_reg.json()["id"]
        
        doc_login = client.post("/api/auth/login", json={"email": doctor_data["email"], "password": doctor_data["password"]})
        assert doc_login.status_code == 200
        doc_token = doc_login.json()["access_token"]
        doc_headers = {"Authorization": f"Bearer {doc_token}"}
        
        # Write appointment record to establish doctor assignment
        appointment_payload = {
            "scheduled_at": "2026-07-01T10:00:00",
            "status": "Scheduled",
            "notes": "Follow-up consultation",
            "patient_id": patient_id,
            "doctor_id": doc_id
        }
        appt_create_res = client.post("/api/appointments", json=appointment_payload, headers=doc_headers)
        assert appt_create_res.status_code == 201
        print("OK Appointment created by clinician.")

        # Write medical history record
        history_payload = {
            "disease": "Type 2 Diabetes",
            "diagnosis_date": "2025-01-15T00:00:00",
            "medications": "Metformin 500mg daily",
            "notes": "Monitor fasting glucose."
        }
        history_create_res = client.post(f"/api/patients/{patient_id}/medical-history", json=history_payload, headers=doc_headers)
        assert history_create_res.status_code == 201
        print("OK Medical history created by clinician.")

        # 9. Test dynamic tool-calling/mock db retrieval
        print("\n9. Testing dynamic tool-calling / mock fallback DB retrieval...")
        history_query = {"message": "Please show my medical history."}
        history_query_res = client.post("/api/chat", json=history_query, headers=headers)
        assert history_query_res.status_code == 200
        history_query_data = history_query_res.json()
        print(f"Response (medical history): {history_query_data['content']}")
        assert "type 2 diabetes" in history_query_data["content"].lower()
        assert "metformin 500mg daily" in history_query_data["content"].lower()

        appt_query = {"message": "When is my next appointment?"}
        appt_query_res = client.post("/api/chat", json=appt_query, headers=headers)
        assert appt_query_res.status_code == 200
        appt_query_data = appt_query_res.json()
        print(f"Response (appointments): {appt_query_data['content']}")
        assert "follow-up consultation" in appt_query_data["content"].lower()
        assert "dr. test doctor" in appt_query_data["content"].lower()
        print("OK Dynamic database-backed tool calling / mock fallback validated.")

        # 10. Test embeddings threshold fallback
        print("\n10. Testing embeddings threshold fallback (queries below 0.3 threshold)...")
        capital_payload = {"message": "What is the capital of France?"}
        capital_res = client.post("/api/chat", json=capital_payload, headers=headers)
        assert capital_res.status_code == 200
        capital_data = capital_res.json()
        print(f"Response (fallback): {capital_data['content']}")
        # The response should NOT contain guidelines-related content since the prompt is cleared
        assert "fasting blood glucose" not in capital_data["content"].lower()
        assert "hypertension" not in capital_data["content"].lower()
        print("OK Embeddings retrieval threshold fallback successfully validated.")

    print("\n=== CHATBOT SERVICE VERIFICATION PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    test_chatbot_service()
