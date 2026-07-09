import json
import logging
from datetime import datetime, date, time, timedelta
from sqlalchemy.orm import Session
from app.models.models import HealthNudge, Patient, Prediction, Appointment, User

logger = logging.getLogger(__name__)

def create_nudge_if_not_exists(
    db: Session,
    patient_id: int,
    nudge_type: str,
    title: str,
    message: str,
    priority: str = "low",
    scheduled_for: datetime = None,
    metadata: dict = None,
    dedupe_key: str = None
) -> HealthNudge:
    """
    Prevents duplicate nudges.
    Checks whether an unread nudge already exists for the same patient_id, type, and dedupe_key.
    """
    query = db.query(HealthNudge).filter(
        HealthNudge.patient_id == patient_id,
        HealthNudge.type == nudge_type,
        HealthNudge.status == "unread"
    )
    
    # Check if duplicate exists with the same dedupe_key inside metadata_json
    if dedupe_key:
        candidates = query.all()
        for cand in candidates:
            if cand.metadata_json:
                try:
                    meta_dict = json.loads(cand.metadata_json)
                    if meta_dict.get("dedupe_key") == dedupe_key:
                        logger.info(f"Duplicate unread nudge found for patient {patient_id} type {nudge_type} with dedupe_key {dedupe_key}. Skipping creation.")
                        return None
                except Exception:
                    pass
    else:
        # If no dedupe_key, we check if any unread nudge of this type exists
        existing = query.first()
        if existing:
            logger.info(f"Duplicate unread nudge found for patient {patient_id} type {nudge_type}. Skipping creation.")
            return None

    # Merge metadata with dedupe_key
    meta_payload = metadata or {}
    if dedupe_key:
        meta_payload["dedupe_key"] = dedupe_key
    meta_str = json.dumps(meta_payload) if meta_payload else None

    db_nudge = HealthNudge(
        patient_id=patient_id,
        type=nudge_type,
        title=title,
        message=message,
        priority=priority,
        status="unread",
        scheduled_for=scheduled_for,
        metadata_json=meta_str
    )
    
    db.add(db_nudge)
    db.commit()
    db.refresh(db_nudge)
    return db_nudge

def generate_vitals_missing_nudges(db: Session) -> int:
    """
    Encourages patients who haven't logged vitals in 30 days to update them.
    """
    created_count = 0
    patients = db.query(Patient).all()
    for patient in patients:
        latest_pred = db.query(Prediction).filter(
            Prediction.patient_id == patient.id
        ).order_by(Prediction.created_at.desc()).first()
        
        needs_nudge = False
        if not latest_pred:
            needs_nudge = True
        else:
            diff = datetime.utcnow() - latest_pred.created_at
            if diff.days >= 30:
                needs_nudge = True
                
        if needs_nudge:
            nudge = create_nudge_if_not_exists(
                db,
                patient_id=patient.id,
                nudge_type="vitals_missing",
                title="Update your vitals",
                message="You have not logged your vitals recently. Updating them can help your doctor track your progress.",
                priority="medium",
                dedupe_key="vitals_missing"
            )
            if nudge:
                created_count += 1
                
    return created_count

def generate_appointment_reminder_nudges(db: Session) -> int:
    """
    Creates reminders for appointments scheduled for tomorrow.
    """
    created_count = 0
    tomorrow = date.today() + timedelta(days=1)
    start_of_tomorrow = datetime.combine(tomorrow, time.min)
    end_of_tomorrow = datetime.combine(tomorrow, time.max)
    
    appointments = db.query(Appointment).filter(
        Appointment.scheduled_at >= start_of_tomorrow,
        Appointment.scheduled_at <= end_of_tomorrow,
        Appointment.status != "Cancelled"
    ).all()
    
    for appt in appointments:
        doctor = db.query(User).filter(User.id == appt.doctor_id).first()
        doc_name = doctor.name if doctor else "Doctor"
        appt_time = appt.scheduled_at.strftime("%I:%M %p")
        message = f"You have an appointment with Dr. {doc_name} tomorrow at {appt_time}."
        
        nudge = create_nudge_if_not_exists(
            db,
            patient_id=appt.patient_id,
            nudge_type="appointment_reminder",
            title="Appointment reminder",
            message=message,
            priority="medium",
            dedupe_key=f"appointment_{appt.id}"
        )
        if nudge:
            created_count += 1
            
    return created_count

def generate_risk_score_changed_nudges(db: Session) -> int:
    """
    Raises nudge if risk score increased by at least 10 percentage points.
    """
    created_count = 0
    patients = db.query(Patient).all()
    for patient in patients:
        preds = db.query(Prediction).filter(
            Prediction.patient_id == patient.id
        ).order_by(Prediction.created_at.desc()).limit(2).all()
        
        if len(preds) >= 2:
            latest = preds[0]
            previous = preds[1]
            if latest.risk_score - previous.risk_score >= 10:
                nudge = create_nudge_if_not_exists(
                    db,
                    patient_id=patient.id,
                    nudge_type="risk_score_changed",
                    title="Risk score update",
                    message="Your latest risk score changed compared with your previous result. Please review it with your doctor.",
                    priority="high",
                    dedupe_key=f"risk_changed_{latest.id}"
                )
                if nudge:
                    created_count += 1
                    
    return created_count

def generate_followup_due_nudges(db: Session) -> int:
    """
    Suggests followup appointments for high-risk patients who have no upcoming appointments scheduled.
    """
    created_count = 0
    patients = db.query(Patient).all()
    for patient in patients:
        latest_pred = db.query(Prediction).filter(
            Prediction.patient_id == patient.id
        ).order_by(Prediction.created_at.desc()).first()
        
        if latest_pred and latest_pred.risk_score >= 70:
            now = datetime.utcnow()
            upcoming = db.query(Appointment).filter(
                Appointment.patient_id == patient.id,
                Appointment.scheduled_at > now,
                Appointment.status != "Cancelled"
            ).first()
            
            if not upcoming:
                nudge = create_nudge_if_not_exists(
                    db,
                    patient_id=patient.id,
                    nudge_type="followup_due",
                    title="Follow-up suggested",
                    message="Your latest screening result may be worth reviewing with your doctor. You can book a follow-up appointment from your dashboard.",
                    priority="high",
                    dedupe_key="followup_due"
                )
                if nudge:
                    created_count += 1
                    
    return created_count

def run_all_health_nudge_checks(db: Session) -> int:
    """
    Runs all proactive nudge generation rules.
    """
    total = 0
    total += generate_vitals_missing_nudges(db)
    total += generate_appointment_reminder_nudges(db)
    total += generate_risk_score_changed_nudges(db)
    total += generate_followup_due_nudges(db)
    logger.info(f"Proactive nudge engine run completed. Created {total} new notifications.")
    return total
