"""
DOCTOR REFERRAL RECOMMENDATION ENGINE
-------------------------------------
Note: This recommendation engine uses an explicit, deterministic rule engine (if-else logic) 
based on standard clinical thresholds. This is NOT an AI-driven referral model.

FUTURE ENHANCEMENT: An AI-based collaborative-filtering or deep-learning model could be trained 
on historical doctor outcomes to predict the optimal specialist, currently marked as TODO.
"""

from typing import List

def get_doctor_recommendations(
    risk_score: float,
    glucose: float,
    blood_pressure: float,
    bmi: float
) -> List[str]:
    recommendations = []
    
    # Rule 1: High risk or high glucose levels suggest endocrine/diabetes follow-up
    # Threshold for elevated fasting or oral glucose post-test is typically around 140 mg/dL
    if risk_score > 80.0 or glucose > 140.0:
        recommendations.append("Refer to Endocrinologist (for advanced diabetes evaluation and management)")
        
    # Rule 2: High blood pressure (stage 2 hypertension threshold is 90 mm Hg diastolic)
    if blood_pressure > 90.0:
        recommendations.append("Refer to Cardiologist (for hypertension and cardiovascular risk monitoring)")
        
    # Rule 3: Obese BMI (BMI >= 30 is classified as obesity)
    if bmi >= 30.0:
        recommendations.append("Refer to Nutritionist / Dietitian (for weight management and lifestyle coaching)")
        
    # Default Rule: If no specialized flags are triggered, recommend a standard checkup
    if not recommendations:
        recommendations.append("Refer to General Practitioner (for routine annual screening and wellness support)")
        
    return recommendations
