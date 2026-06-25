import os
import sys
import pickle

# Ensure the parent folders are importable if needed
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from app.ml.model_definition import SimpleLogisticRegression

# Path to the pickled model (backend/models/diabetes_model.pkl)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODEL_PATH = os.path.join(BASE_DIR, "models", "diabetes_model.pkl")

class MLService:
    def __init__(self):
        self.model = None
        self.load_model()

    def load_model(self):
        if os.path.exists(MODEL_PATH):
            try:
                # Ensure app.ml.model_definition is importable
                # Python pickle needs the exact same module structure to load classes
                with open(MODEL_PATH, "rb") as f:
                    self.model = pickle.load(f)
                print(f"ML Model loaded successfully from {MODEL_PATH}")
            except Exception as e:
                print(f"Error loading ML Model from {MODEL_PATH}: {e}")
        else:
            print(f"ML Model file not found at {MODEL_PATH}")

    def predict(
        self,
        pregnancies: float,
        glucose: float,
        blood_pressure: float,
        insulin: float,
        bmi: float,
        age: float
    ) -> dict:
        if self.model is None:
            # Attempt to reload once
            self.load_model()
            if self.model is None:
                raise ValueError("ML model not loaded or initialized on this system.")
                
        # Input matching Pima features selection:
        # [Pregnancies, Glucose, BloodPressure, Insulin, BMI, Age]
        input_data = [[
            float(pregnancies),
            float(glucose),
            float(blood_pressure),
            float(insulin),
            float(bmi),
            float(age)
        ]]
        
        # Run inference
        probabilities = self.model.predict_proba(input_data)[0]
        risk_score = probabilities[1] * 100.0  # Percentage chance (P(Outcome=1))
        
        prediction_label = "High Risk" if risk_score >= 50.0 else "Low Risk"
        
        return {
            "risk_score": round(risk_score, 2),
            "prediction": prediction_label
        }

# Global singleton service
ml_service = MLService()
