"""
DOCTOR REFERRAL RECOMMENDATION ENGINE
-------------------------------------
Upgraded to use LLM personalization based on the patient's full screening history,
longitudinal risk trends, and medical history. Falls back to deterministic rule engine
if LLM API calls are unavailable or fail.
"""

import os
import json
import logging
import requests
from typing import List, Optional
from sqlalchemy.orm import Session

# Import models dynamically/locally to avoid any potential circular imports
from app.models.models import Patient, Prediction, HeartPrediction, MedicalHistory

logger = logging.getLogger(__name__)

def generate_llm_recommendation(
    risk_score: float,
    glucose: float,
    blood_pressure: float,
    bmi: float,
    db: Session,
    patient_id: int
) -> Optional[str]:
    try:
        # 1. Fetch Patient profile details
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return None
        
        # 2. Fetch historical diabetes prediction records
        diab_preds = db.query(Prediction).filter(Prediction.patient_id == patient_id).order_by(Prediction.created_at.desc()).all()
        # 3. Fetch historical cardiovascular prediction records
        heart_preds = db.query(HeartPrediction).filter(HeartPrediction.patient_id == patient.user_id).order_by(HeartPrediction.created_at.desc()).all()
        # 4. Fetch medical history
        med_history = db.query(MedicalHistory).filter(MedicalHistory.patient_id == patient_id).all()

        # 5. Build demographic summary
        demographics = (
            f"- Age: {patient.age or 'N/A'} years\n"
            f"- Gender: {patient.gender or 'N/A'}\n"
            f"- Current BMI: {bmi}\n"
            f"- Current Glucose Level: {glucose} mg/dL\n"
            f"- Current Blood Pressure: {blood_pressure} mm Hg\n"
        )

        # 6. Build longitudinal records and trends context
        history_text = "Diabetes Screening History:\n"
        if not diab_preds:
            history_text += "No prior diabetes risk screenings.\n"
        else:
            for p in diab_preds[:5]: # latest 5
                gl_val = p.input_features.get('glucose', 'N/A') if p.input_features else 'N/A'
                bmi_val = p.input_features.get('bmi', 'N/A') if p.input_features else 'N/A'
                history_text += f"- Date: {p.created_at.strftime('%Y-%m-%d') if p.created_at else 'N/A'}, Risk: {p.risk_score}%, Glucose: {gl_val}, BMI: {bmi_val}\n"

        history_text += "\nHeart Disease Screening History:\n"
        if not heart_preds:
            history_text += "No prior cardiovascular risk screenings.\n"
        else:
            for hp in heart_preds[:5]: # latest 5
                history_text += f"- Date: {hp.created_at.strftime('%Y-%m-%d') if hp.created_at else 'N/A'}, Risk: {hp.risk_score}%, BP: {hp.ap_hi}/{hp.ap_lo}, BMI: {hp.bmi_calculated:.1f}\n"

        history_text += "\nKnown Medical History & Conditions:\n"
        if not med_history:
            history_text += "No chronic conditions or past diagnoses recorded.\n"
        else:
            for mh in med_history:
                history_text += f"- Condition: {mh.disease}, Diagnosed: {mh.diagnosis_date.strftime('%Y-%m-%d') if mh.diagnosis_date else 'N/A'}, Medications: {mh.medications or 'None'}\n"

        # Build prompt
        user_prompt = (
            f"You are a clinical AI health assistant. Analyze this patient's current vitals, demographic data, and historical screening trends to provide a personalized, highly contextual health recommendation.\n\n"
            f"PATIENT DEMOGRAPHICS:\n{demographics}\n"
            f"LONGITUDINAL RISK & SCREENING HISTORY:\n{history_text}\n"
            f"CURRENT DIAGNOSTIC RESULTS:\n"
            f"- Current calculated diabetes risk score: {risk_score}%\n"
            f"- Current fasting glucose level: {glucose} mg/dL\n"
            f"- Current diastolic BP: {blood_pressure} mm Hg\n"
            f"- Current BMI: {bmi}\n\n"
            f"INSTRUCTIONS:\n"
            f"1. Generate a single, coherent, personalized recommendation statement (2-3 sentences max) targeted directly to the patient (using 'you' / 'your').\n"
            f"2. Reference longitudinal trends if visible (e.g. rising glucose over several screenings, consistently elevated BMI, age factor).\n"
            f"3. Recommend dietary, lifestyle, or clinical next-steps (e.g. specific dietary interventions, structured physical activity, or consultation with a specialist like an endocrinologist or general practitioner).\n"
            f"4. Frame it as suggestions to discuss with their doctor, not as absolute medical commands. Never diagnose or prescribe dosages.\n"
            f"5. Start directly with the recommendation. Do not include any greeting, intro, or JSON formatting. Output only the plain-text recommendation string.\n"
        )

        anthropic_key = os.getenv("ANTHROPIC_API_KEY")
        groq_key = os.getenv("GROQ_API_KEY")
        
        if groq_key:
            model_name = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
            headers = {
                "Authorization": f"Bearer {groq_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": model_name,
                "messages": [
                    {"role": "system", "content": "You are a clinical AI health assistant generating patient recommendations. Do not add conversational intro/outro. Output only the plain recommendation text."},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": 0.2,
                "max_tokens": 300
            }
            res = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload, timeout=8.0)
            if res.status_code == 200:
                rec_text = res.json()["choices"][0]["message"]["content"].strip()
                if rec_text:
                    return rec_text
            else:
                logger.warning(f"Groq API returned status {res.status_code}: {res.text}")

        elif anthropic_key:
            import anthropic
            client = anthropic.Anthropic(api_key=anthropic_key)
            model_name = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20240620")
            response = client.messages.create(
                model=model_name,
                system="You are a clinical AI health assistant generating patient recommendations. Output only the plain recommendation text.",
                messages=[{"role": "user", "content": user_prompt}],
                max_tokens=300
            )
            rec_text = response.content[0].text.strip()
            if rec_text:
                return rec_text

    except Exception as e:
        logger.warning(f"Failed to generate LLM recommendation: {e}")
        
    return None

def get_doctor_recommendations(
    risk_score: float,
    glucose: float,
    blood_pressure: float,
    bmi: float,
    db: Optional[Session] = None,
    patient_id: Optional[int] = None
) -> List[str]:
    # 1. Try to generate personalized LLM recommendation using patient history
    if db is not None and patient_id is not None:
        llm_rec = generate_llm_recommendation(risk_score, glucose, blood_pressure, bmi, db, patient_id)
        if llm_rec:
            return [llm_rec]

    # 2. Rule engine fallback
    recommendations = []
    
    # Rule 1: High risk or high glucose levels suggest endocrine/diabetes follow-up
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
