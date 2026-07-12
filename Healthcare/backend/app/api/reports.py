import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
from app.database.database import get_db
from app.models.models import LabReport, Patient, Appointment, User
from app.schemas.reports import LabReportOut
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
        
    # 3. Save metadata to DB
    db_report = LabReport(
        patient_id=patient_id,
        file_path=relative_path,
        report_type=report_type
    )
    db.add(db_report)
    db.commit()
    db.refresh(db_report)
    
    # 4. Extract vitals from content to automatically trigger/update risk prediction
    vitals = {}
    if file_ext == ".csv":
        try:
            csv_text = content.decode("utf-8")
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
            vitals = parse_vitals_from_text(pdf_text)
        except Exception:
            pass

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
                bmi=final_bmi
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

@router.get("/patients/{patient_id}/reports", response_model=List[LabReportOut])
def read_patient_reports(
    patient_id: int,
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
    
    return db.query(LabReport).filter(LabReport.patient_id == patient_id).all()

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
