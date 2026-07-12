import pytest
from app.services.sanitizer import sanitize_text, sanitize_chat_message, sanitize_name, sanitize_notes
from app.schemas.schemas import UserCreate
from app.schemas.patients import PatientBase
from app.schemas.medical_history import MedicalHistoryBase
from app.schemas.appointments import AppointmentBase

def test_sanitizers():
    # Strip tags check
    bad_html = "Hello <script>alert('XSS')</script> world <iframe src='javascript:void(0)'></iframe>"
    assert sanitize_text(bad_html) == "Hello alert('XSS') world"
    
    # Null bytes check
    bad_null = "Hello\x00world"
    assert sanitize_text(bad_null) == "Helloworld"
    
    # Whitespace normalization check
    bad_spaces = "  Hello   world  "
    assert sanitize_text(bad_spaces) == "Hello world"
    
    # Max length check
    assert sanitize_text("abcdef", max_length=3) == "abc"

def test_schemas_sanitization():
    # UserCreate
    data = {
        "name": "<script>alert('xss')</script> John Doe",
        "email": "test@example.com",
        "password": "securepassword",
        "role": "patient"
    }
    user = UserCreate(**data)
    assert user.name == "alert('xss') John Doe"
    
    # PatientBase (address)
    patient_data = {
        "address": "123 <iframe></iframe> Main St"
    }
    p = PatientBase(**patient_data)
    assert p.address == "123 Main St"
    
    # MedicalHistoryBase
    history_data = {
        "disease": "Type 2 <script></script>Diabetes",
        "diagnosis_date": "2026-07-12T10:00:00",
        "medications": "Metformin <b>500mg</b>",
        "notes": "Patient feels <iframe src='...'></iframe> fine"
    }
    h = MedicalHistoryBase(**history_data)
    assert h.disease == "Type 2 Diabetes"
    assert h.medications == "Metformin 500mg"
    assert h.notes == "Patient feels fine"
    
    # AppointmentBase
    appt_data = {
        "scheduled_at": "2026-07-12T10:00:00",
        "notes": "Review <a>glucose</a> levels"
    }
    appt = AppointmentBase(**appt_data)
    assert appt.notes == "Review glucose levels"
