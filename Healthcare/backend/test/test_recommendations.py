import os
import unittest
from unittest.mock import patch, MagicMock
from sqlalchemy.orm import Session

from app.services.recommendation import get_doctor_recommendations, generate_llm_recommendation
from app.models.models import Patient, User, Prediction, HeartPrediction, MedicalHistory

class TestRecommendations(unittest.TestCase):
    def setUp(self):
        # Setup mock db session
        self.db = MagicMock(spec=Session)
        self.patient_id = 1
        
        # Setup mock patient
        self.mock_user = MagicMock(spec=User)
        self.mock_user.name = "John Doe"
        
        self.mock_patient = MagicMock(spec=Patient)
        self.mock_patient.id = self.patient_id
        self.mock_patient.user_id = 100
        self.mock_patient.age = 45
        self.mock_patient.gender = "male"
        self.mock_patient.weight = 85.0
        self.mock_patient.height = 175.0
        self.mock_patient.user = self.mock_user

    def test_fallback_without_db(self):
        # When db and patient_id are None, should fall back to deterministic rule engine
        # High glucose (> 140) -> Endocrinologist
        recs = get_doctor_recommendations(risk_score=50.0, glucose=150.0, blood_pressure=80.0, bmi=24.0)
        self.assertEqual(len(recs), 1)
        self.assertIn("Endocrinologist", recs[0])

        # High blood pressure (> 90) -> Cardiologist
        recs = get_doctor_recommendations(risk_score=30.0, glucose=100.0, blood_pressure=95.0, bmi=24.0)
        self.assertEqual(len(recs), 1)
        self.assertIn("Cardiologist", recs[0])

        # Obese BMI (>= 30) -> Nutritionist / Dietitian
        recs = get_doctor_recommendations(risk_score=30.0, glucose=100.0, blood_pressure=80.0, bmi=31.0)
        self.assertEqual(len(recs), 1)
        self.assertIn("Nutritionist", recs[0])

        # None triggered -> General Practitioner
        recs = get_doctor_recommendations(risk_score=30.0, glucose=100.0, blood_pressure=80.0, bmi=24.0)
        self.assertEqual(len(recs), 1)
        self.assertIn("General Practitioner", recs[0])

    @patch("app.services.recommendation.requests.post")
    @patch.dict(os.environ, {"GROQ_API_KEY": "test_key"})
    def test_llm_recommendation_success(self, mock_post):
        # Mock database queries
        self.db.query().filter().first.return_value = self.mock_patient
        self.db.query().filter().order_by().all.return_value = []
        self.db.query().filter().all.return_value = []
        
        # Mock API response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{
                "message": {
                    "content": "Given your consistently high BMI and rising glucose over 4 months, a structured diet intervention is recommended."
                }
            }]
        }
        mock_post.return_value = mock_response

        # Execute recommendations
        recs = get_doctor_recommendations(
            risk_score=75.0,
            glucose=145.0,
            blood_pressure=85.0,
            bmi=32.0,
            db=self.db,
            patient_id=self.patient_id
        )

        self.assertEqual(len(recs), 1)
        self.assertIn("structured diet intervention", recs[0])

    @patch("app.services.recommendation.requests.post")
    @patch.dict(os.environ, {"GROQ_API_KEY": "test_key"})
    def test_llm_recommendation_api_failure_fallback(self, mock_post):
        # Mock API failure (status 500)
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_post.return_value = mock_response

        # Execute recommendations - should fall back to rule engine
        # Glucose is 150 (> 140) -> should suggest Endocrinologist
        recs = get_doctor_recommendations(
            risk_score=75.0,
            glucose=150.0,
            blood_pressure=85.0,
            bmi=24.0,
            db=self.db,
            patient_id=self.patient_id
        )

        self.assertEqual(len(recs), 1)
        self.assertIn("Endocrinologist", recs[0])
