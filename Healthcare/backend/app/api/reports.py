import os
import uuid
import logging
import requests
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query

logger = logging.getLogger(__name__)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.database.database import get_db
from app.models.models import LabReport, Patient, Appointment, User
from app.schemas.reports import LabReportOut
from app.schemas.schemas import PaginatedEnvelope
from app.auth.dependencies import get_current_user, check_ownership_or_403
from app.models.models import Prediction
from app.ml.ml_service import ml_service
from app.services.recommendation import get_doctor_recommendations
import csv
import io
import re
import pypdf

# Key mapping helper for parsing vitals from reports
def map_key(k: str) -> str:
    k = k.lower().replace("_", "").replace(" ", "").strip()
    if "pregnancy" in k or "pregnancies" in k:
        return "pregnancies"
    if "glucose" in k or "sugar" in k:
        return "glucose"
    if "pressure" in k or "bp" in k or "diastolic" in k:
        return "blood_pressure"
    if "insulin" in k:
        return "insulin"
    if "bmi" in k:
        return "bmi"
    if "age" in k:
        return "age"
    return None

def parse_float(v: str) -> float:
    try:
        # Strip everything except digits, decimal point, and sign
        v_clean = re.sub(r"[^\d\.-]", "", v)
        return float(v_clean)
    except ValueError:
        return None

def parse_csv_content(csv_text: str) -> dict:
    vitals = {}
    f = io.StringIO(csv_text.strip())
    reader = csv.reader(f)
    rows = [r for r in reader if r]
    if not rows:
        return vitals
        
    # Tabular parsing (headers in row 0, values in row 1)
    if len(rows) >= 2:
        headers = [h.strip().lower() for h in rows[0]]
        mapped_headers = [map_key(h) for h in headers]
        if any(mh is not None for mh in mapped_headers):
            # Check if second row contains numbers/convertibles to prevent matching key-value pairs
            second_row_vals = [parse_float(v) for v in rows[1]]
            non_none_vals = [v for v in second_row_vals if v is not None]
            if len(non_none_vals) > 0:
                for mh, val_str in zip(mapped_headers, rows[1]):
                    if mh:
                        val = parse_float(val_str)
                        if val is not None:
                            vitals[mh] = val
                            
    # Key-value rows parsing fallback (e.g. glucose, 110 on each line)
    if not vitals:
        for row in rows:
            if len(row) >= 2:
                k = row[0].strip()
                v = row[1].strip()
                mh = map_key(k)
                if mh:
                    val = parse_float(v)
                    if val is not None:
                        vitals[mh] = val
                        
    return vitals

def parse_vitals_from_text(text: str) -> dict:
    vitals = {}
    
    patterns = {
        "glucose": [
            r"(?:glucose|blood\s*sugar)(?:\s*\([^)]*\))?\s*[:=,\s]?\s*([0-9]+(?:\.[0-9]+)?)",
        ],
        "insulin": [
            r"insulin\s*[:=,\s]?\s*([0-9]+(?:\.[0-9]+)?)",
        ],
        "blood_pressure": [
            r"(?:diastolic)(?:\s*bp)?\s*[:=,\s]?\s*([0-9]+(?:\.[0-9]+)?)",
            r"(?:blood\s*pressure|bp)\s*[:=,\s]?\s*[0-9]+\s*/\s*([0-9]+)",
            r"(?:blood\s*pressure|bp)\s*[:=,\s]?\s*([0-9]+(?:\.[0-9]+)?)",
        ],
        "bmi": [
            r"bmi\s*[:=,\s]?\s*([0-9]+(?:\.[0-9]+)?)",
        ],
        "pregnancies": [
            r"(?:pregnancies|pregnancy)\s*[:=,\s]?\s*([0-9]+(?:\.[0-9]+)?)",
        ],
        "age": [
            r"age\s*[:=,\s]?\s*([0-9]+(?:\.[0-9]+)?)",
        ]
    }
    
    for key, regexes in patterns.items():
        for pattern in regexes:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                val = parse_float(match.group(1))
                if val is not None:
                    vitals[key] = val
                    break
    return vitals

def generate_fallback_summary(text: str) -> str:
    # Attempt to extract known vitals to make it somewhat personalized even without API keys
    vitals = parse_vitals_from_text(text)
    if not vitals:
        # Check if it was parsed as CSV
        try:
            vitals = parse_csv_content(text)
        except Exception:
            pass
            
    if not vitals:
        return "Lab report uploaded successfully. (Plain-language AI summary is unavailable because the Groq API key is missing or failed)."
        
    parts = []
    if "glucose" in vitals:
        g = vitals["glucose"]
        if g >= 126:
            parts.append(f"Glucose is {g} mg/dL (above normal fasting range of 70-99 mg/dL, indicating high risk)")
        elif g >= 100:
            parts.append(f"Glucose is {g} mg/dL (borderline pre-diabetic range of 100-125 mg/dL)")
        else:
            parts.append(f"Glucose is {g} mg/dL (within normal fasting range)")
            
    if "blood_pressure" in vitals:
        bp = vitals["blood_pressure"]
        if bp >= 90:
            parts.append(f"Diastolic Blood Pressure is {bp} mmHg (high, indicating stage 2 hypertension)")
        elif bp >= 80:
            parts.append(f"Diastolic Blood Pressure is {bp} mmHg (elevated, indicating stage 1 hypertension)")
        else:
            parts.append(f"Diastolic Blood Pressure is {bp} mmHg (within normal range of less than 80 mmHg)")
            
    if "bmi" in vitals:
        bmi = vitals["bmi"]
        if bmi >= 30:
            parts.append(f"BMI is {bmi} (classifying as obese, which increases health risk factors)")
        elif bmi >= 25:
            parts.append(f"BMI is {bmi} (classifying as overweight)")
        else:
            parts.append(f"BMI is {bmi} (within normal weight range of 18.5-24.9)")
            
    if "insulin" in vitals:
        ins = vitals["insulin"]
        parts.append(f"Insulin level is {ins} mIU/L")
        
    if "age" in vitals:
        parts.append(f"Age listed is {vitals['age']}")
        
    summary_text = "Your uploaded report shows: " + ", ".join(parts) + "."
    if not parts:
        summary_text = "Lab report uploaded. No standard physiological markers (Glucose, BP, BMI) could be extracted for fallback summary."
    return summary_text

def generate_report_summary(text: str) -> str:
    # 1. Get Groq API Key
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        return generate_fallback_summary(text)
    
    # Import validate_outbound_url here to prevent any circular dependency potential
    from app.api.chat import validate_outbound_url
    
    # Validate outbound Groq API URL (SSRF Protection)
    if not validate_outbound_url("https://api.groq.com/openai/v1/chat/completions"):
        return generate_fallback_summary(text)
        
    try:
        model_name = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        headers = {
            "Authorization": f"Bearer {groq_key}",
            "Content-Type": "application/json"
        }
        
        prompt = (
            "You are a helpful clinical assistant. Summarize the following lab report text in plain language for the patient. "
            "Highlight any abnormal values (e.g. glucose, HbA1c, cholesterol, blood pressure, BMI, etc.) and explain what they mean simply. "
            "Do not give a formal diagnosis. Keep it brief (2-4 sentences max).\n\n"
            f"Lab Report Text:\n{text[:4000]}"
        )
        
        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": "You are a clinical assistant who provides short, clear summaries of medical lab results in simple terms."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.3,
            "max_tokens": 300
        }
        
        res = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload, timeout=8.0)
        if res.status_code == 200:
            summary = res.json()["choices"][0]["message"]["content"].strip()
            return summary
        else:
            logger.warning(f"Groq API returned status {res.status_code}: {res.text} during report summarization.")
            return generate_fallback_summary(text)
    except Exception as e:
        logger.error(f"Error during report summarization with Groq: {e}")
        return generate_fallback_summary(text)

router = APIRouter(tags=["reports"])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads", "reports")

# Helper function to check if a doctor is assigned to a patient
def is_doctor_assigned(db: Session, doctor_id: int, patient_id: int) -> bool:
    appointment = db.query(Appointment).filter(
        Appointment.patient_id == patient_id,
        Appointment.doctor_id == doctor_id
    ).first()
    return appointment is not None

# Helper to validate access to a patient's reports
def validate_patient_access(current_user: User, patient: Patient, db: Session):
    if current_user.role == "admin":
        return True
    elif current_user.role == "doctor":
        return True
    elif current_user.role == "patient":
        if patient.user_id == current_user.id:
            return True
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You can only access your own records."
        )
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Unauthorized role"
    )

@router.post("/patients/{patient_id}/reports", response_model=LabReportOut, status_code=status.HTTP_201_CREATED)
async def upload_lab_report(
    patient_id: int,
    file: UploadFile = File(...),
    report_type: str = Form("Blood Test"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Ensure patient exists
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found"
        )
        
    # Check access permission via helper
    check_ownership_or_403(patient_id, current_user, db)
    
    # 1. Validate file extension (only PDF or CSV)
    filename = file.filename or ""
    file_ext = os.path.splitext(filename)[1].lower()
    if file_ext not in [".pdf", ".csv"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only PDF and CSV files are allowed."
        )
        
    # 2. Validate file size (limit to 5MB)
    # Read content to check length
    content = await file.read()
    max_size = 5 * 1024 * 1024  # 5 MB
    if len(content) > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is too large. Maximum size allowed is 5MB."
        )

    # Validate Magic Bytes (File Content Verification)
    if file_ext == ".pdf":
        if not content.startswith(b"%PDF-"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid PDF file. Content does not match PDF signature."
            )
    elif file_ext == ".csv":
        if content.startswith(b"MZ") or content.startswith(b"\x7fELF"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid CSV file. Executables are not allowed."
            )
        try:
            content.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid CSV file. Content is not valid text."
            )
        
    # Ensure upload directory exists
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    
    # Generate unique filename on disk
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    relative_path = f"uploads/reports/{unique_filename}"
    absolute_path = os.path.join(BASE_DIR, "uploads", "reports", unique_filename)
    
    # Write file to disk
    with open(absolute_path, "wb") as out_file:
        out_file.write(content)
        
    # 3. Extract text content from file to generate summary and vitals
    report_text = ""
    vitals = {}
    if file_ext == ".csv":
        try:
            csv_text = content.decode("utf-8")
            report_text = csv_text
            vitals = parse_csv_content(csv_text)
            if not vitals:
                vitals = parse_vitals_from_text(csv_text)
        except Exception:
            pass
    elif file_ext == ".pdf":
        try:
            pdf_text = ""
            reader = pypdf.PdfReader(io.BytesIO(content))
            for page in reader.pages:
                pdf_text += page.extract_text() or ""
            report_text = pdf_text
            vitals = parse_vitals_from_text(pdf_text)
        except Exception:
            pass

    # Generate plain-language summary
    summary_text = None
    if report_text:
        summary_text = generate_report_summary(report_text)

    # 4. Save metadata to DB
    db_report = LabReport(
        patient_id=patient_id,
        file_path=relative_path,
        report_type=report_type,
        summary=summary_text
    )
    db.add(db_report)
    db.commit()
    db.refresh(db_report)

    if vitals:
        # Fallback hierarchy for missing vitals
        age = patient.age
        bmi = None
        if patient.weight and patient.height:
            bmi = patient.weight / ((patient.height / 100) ** 2)
            
        latest_pred = db.query(Prediction).filter(Prediction.patient_id == patient_id).order_by(Prediction.created_at.desc()).first()
        latest_feat = latest_pred.input_features if latest_pred else {}
        
        final_pregnancies = vitals.get("pregnancies")
        if final_pregnancies is None:
            final_pregnancies = latest_feat.get("pregnancies", 0)
            
        final_glucose = vitals.get("glucose")
        if final_glucose is None:
            final_glucose = latest_feat.get("glucose", 100.0)
            
        final_blood_pressure = vitals.get("blood_pressure")
        if final_blood_pressure is None:
            final_blood_pressure = latest_feat.get("blood_pressure", 70.0)
            
        final_insulin = vitals.get("insulin")
        if final_insulin is None:
            final_insulin = latest_feat.get("insulin", 80.0)
            
        final_bmi = vitals.get("bmi")
        if final_bmi is None:
            final_bmi = bmi if bmi is not None else latest_feat.get("bmi", 25.0)
            
        final_age = vitals.get("age")
        if final_age is None:
            final_age = age if age is not None else latest_feat.get("age", 30)
            
        final_pregnancies = int(final_pregnancies)
        final_glucose = float(final_glucose)
        final_blood_pressure = float(final_blood_pressure)
        final_insulin = float(final_insulin)
        final_bmi = float(final_bmi)
        final_age = int(final_age)
        
        # Run model prediction
        try:
            inference_result = ml_service.predict(
                pregnancies=final_pregnancies,
                glucose=final_glucose,
                blood_pressure=final_blood_pressure,
                insulin=final_insulin,
                bmi=final_bmi,
                age=final_age
            )
            risk_score = inference_result["risk_score"]
            prediction_label = inference_result["prediction"]
            
            recommendations = get_doctor_recommendations(
                risk_score=risk_score,
                glucose=final_glucose,
                blood_pressure=final_blood_pressure,
                bmi=final_bmi,
                db=db,
                patient_id=patient_id
            )
            
            input_features_dict = {
                "pregnancies": final_pregnancies,
                "glucose": final_glucose,
                "blood_pressure": final_blood_pressure,
                "insulin": final_insulin,
                "bmi": final_bmi,
                "age": final_age
            }
            
            db_prediction = Prediction(
                patient_id=patient_id,
                model_name="Pima Indians Diabetes (via Lab Report)",
                input_features=input_features_dict,
                risk_score=risk_score,
                prediction=prediction_label
            )
            db.add(db_prediction)
            db.commit()
        except Exception:
            pass  # Ensure prediction failure does not crash report upload completion
            
    return db_report

@router.get("/patients/{patient_id}/reports", response_model=PaginatedEnvelope[LabReportOut])
def read_patient_reports(
    patient_id: int,
    limit: int = Query(default=50, ge=1, le=100),
    skip: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found"
        )
        
    # Check access permission
    check_ownership_or_403(patient_id, current_user, db)
    
    query = db.query(LabReport).filter(LabReport.patient_id == patient_id)
    total = query.count()
    items = query.offset(skip).limit(limit).all()
    
    return {
        "items": items,
        "total": total,
        "limit": limit,
        "skip": skip
    }

@router.get("/reports/{public_id}/download")
def download_lab_report(
    public_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    report = db.query(LabReport).filter(LabReport.public_id == public_id).first()
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lab report not found"
        )
        
    # Check access permission via helper
    check_ownership_or_403(report.patient_id, current_user, db)
    
    # Resolve absolute path
    absolute_path = os.path.join(BASE_DIR, report.file_path)
    
    if not os.path.exists(absolute_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Physical file not found on disk"
        )
        
    return FileResponse(
        path=absolute_path,
        filename=os.path.basename(report.file_path),
        media_type="application/octet-stream"
    )
