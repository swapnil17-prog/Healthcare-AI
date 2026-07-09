import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON, Boolean
from sqlalchemy.orm import relationship
from app.database.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)  # admin, doctor, patient
    is_active = Column(Boolean, default=True, nullable=False)
    suspended_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    patient_profile = relationship("Patient", back_populates="user", uselist=False, cascade="all, delete-orphan")
    chat_messages = relationship("ChatMessage", back_populates="user", cascade="all, delete-orphan")
    appointments_as_doctor = relationship("Appointment", back_populates="doctor", foreign_keys="[Appointment.doctor_id]", cascade="all, delete-orphan")

class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    age = Column(Integer, nullable=True)
    gender = Column(String, nullable=True)
    height = Column(Float, nullable=True)  # in cm
    weight = Column(Float, nullable=True)  # in kg
    blood_group = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(String, nullable=True)

    # Relationships
    user = relationship("User", back_populates="patient_profile")
    medical_histories = relationship("MedicalHistory", back_populates="patient", cascade="all, delete-orphan")
    lab_reports = relationship("LabReport", back_populates="patient", cascade="all, delete-orphan")
    predictions = relationship("Prediction", back_populates="patient", cascade="all, delete-orphan")
    appointments = relationship("Appointment", back_populates="patient", foreign_keys="[Appointment.patient_id]", cascade="all, delete-orphan")
    health_nudges = relationship("HealthNudge", back_populates="patient", cascade="all, delete-orphan")

class MedicalHistory(Base):
    __tablename__ = "medical_histories"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    disease = Column(String, nullable=False)
    diagnosis_date = Column(DateTime, nullable=False)
    medications = Column(String, nullable=True)
    notes = Column(String, nullable=True)

    # Relationships
    patient = relationship("Patient", back_populates="medical_histories")

class LabReport(Base):
    __tablename__ = "lab_reports"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    file_path = Column(String, nullable=False)
    upload_date = Column(DateTime, default=datetime.datetime.utcnow)
    report_type = Column(String, nullable=False)  # e.g., Blood Test, Urine Test, etc.

    # Relationships
    patient = relationship("Patient", back_populates="lab_reports")

class Prediction(Base):
    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    model_name = Column(String, nullable=False)  # e.g. "Pima Indians Diabetes"
    input_features = Column(JSON, nullable=False)  # Store JSON dictionary of features
    feature_contributions = Column(JSON, nullable=True)  # Store JSON dictionary of XAI logs
    risk_score = Column(Float, nullable=False)  # Percentage score (0 - 100)
    prediction = Column(String, nullable=False)  # Label, e.g., "High Risk" or "Low Risk"
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    patient = relationship("Patient", back_populates="predictions")

class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    scheduled_at = Column(DateTime, nullable=False)
    status = Column(String, default="Scheduled")  # Scheduled, Completed, Cancelled
    notes = Column(String, nullable=True)

    # Relationships
    patient = relationship("Patient", back_populates="appointments", foreign_keys=[patient_id])
    doctor = relationship("User", back_populates="appointments_as_doctor", foreign_keys=[doctor_id])

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String, nullable=False)  # user, assistant
    content = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="chat_messages")

class RevokedToken(Base):
    __tablename__ = "revoked_tokens"
    
    id = Column(Integer, primary_key=True, index=True)
    token_jti = Column(String, unique=True, index=True, nullable=False)
    revoked_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)

class HealthNudge(Base):
    __tablename__ = "health_nudges"
    
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    type = Column(String, index=True, nullable=False)
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    priority = Column(String, default="low", nullable=False)
    status = Column(String, default="unread", nullable=False)
    scheduled_for = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    read_at = Column(DateTime, nullable=True)
    dismissed_at = Column(DateTime, nullable=True)
    metadata_json = Column(String, nullable=True)

    # Relationships
    patient = relationship("Patient", back_populates="health_nudges")
