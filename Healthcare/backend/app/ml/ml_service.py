import os
import sys
import pickle
import logging

logger = logging.getLogger(__name__)

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
                logger.info(f"ML Model loaded successfully from {MODEL_PATH}")
            except Exception as e:
                logger.error(f"Error loading ML Model from {MODEL_PATH}: {e}")
        else:
            logger.warning(f"ML Model file not found at {MODEL_PATH}")

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
        input_row = [
            float(pregnancies),
            float(glucose),
            float(blood_pressure),
            float(insulin),
            float(bmi),
            float(age)
        ]
        input_data = [input_row]
        
        # Run inference
        probabilities = self.model.predict_proba(input_data)[0]
        risk_score = probabilities[1] * 100.0  # Percentage chance (P(Outcome=1))
        
        prediction_label = "High Risk" if risk_score >= 50.0 else "Low Risk"
        
        # Explain prediction
        try:
            contributions = self.model.explain_prediction(input_row)
        except Exception as e:
            logger.error(f"Error computing explain_prediction: {e}")
            contributions = {
                "pregnancies": 0.0,
                "glucose": 0.0,
                "blood_pressure": 0.0,
                "insulin": 0.0,
                "bmi": 0.0,
                "age": 0.0
            }
        
        return {
            "risk_score": round(risk_score, 2),
            "prediction": prediction_label,
            "feature_contributions": contributions
        }

# Global singleton service
ml_service = MLService()

class HeartDiseaseMLService:
    def __init__(self):
        self.model_package = None
        self.available = False
        self._load_model()
    
    def _load_model(self):
        try:
            import pickle
            model_path = os.path.join(BASE_DIR, "models", "heart_disease_model.pkl")
            if os.path.exists(model_path):
                with open(model_path, "rb") as f:
                    self.model_package = pickle.load(f)
                self.available = True
                acc = self.model_package.get("training_accuracy", 0)
                logger.info(f"Heart Disease Model loaded. Accuracy: {acc:.4f}")
            else:
                logger.warning(
                    f"WARNING: heart_disease_model.pkl not found at {model_path}. "
                    "Run train_model.py first. Heart disease endpoint will be disabled."
                )
                self.available = False
        except Exception as e:
            logger.error(f"Error loading Heart Disease Model: {e}")
            self.available = False
    
    def predict(self, features: list) -> dict:
        if not self.available:
            self._load_model()
            if not self.available:
                raise RuntimeError("Heart disease model not loaded")
        
        model = self.model_package["model"]
        bootstrap_weights = self.model_package["bootstrap_weights"]
        feature_names = self.model_package["feature_names"]
        
        # Main prediction
        import numpy as np
        X = np.array(features)
        probabilities = model.predict_proba([features])[0]
        risk_score = float(probabilities[1]) * 100
        
        # Confidence interval from bootstrap
        bootstrap_probs = []
        for weights in bootstrap_weights:
            boot_model = type(model)()
            boot_model.weights = np.array(weights)
            boot_model.bias = model.bias
            boot_model.x_min = model.x_min
            boot_model.x_max = model.x_max
            prob = float(boot_model.predict_proba([features])[0][1]) * 100
            bootstrap_probs.append(prob)
        
        lower = float(np.percentile(bootstrap_probs, 2.5))
        upper = float(np.percentile(bootstrap_probs, 97.5))
        
        # Feature contributions (XAI)
        scaled = (X - model.x_min) / (
            model.x_max - model.x_min + 1e-9
        )
        contributions = {
            feature_names[i]: round(
                float(scaled[i] * model.weights[i]), 4
            )
            for i in range(len(feature_names))
        }
        
        # Risk level
        if risk_score >= 70:
            risk_level = "High"
        elif risk_score >= 40:
            risk_level = "Medium"
        else:
            risk_level = "Low"
        
        return {
            "risk_score": round(risk_score, 2),
            "risk_level": risk_level,
            "confidence_lower": round(lower, 2),
            "confidence_upper": round(upper, 2),
            "feature_contributions": contributions
        }

heart_ml_service = HeartDiseaseMLService()
