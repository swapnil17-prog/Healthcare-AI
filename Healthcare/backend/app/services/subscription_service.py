import datetime
import logging
from typing import Dict, Any, Tuple
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.models.models import User, SubscriptionPlan, UserSubscription, UsageTracking

logger = logging.getLogger(__name__)

DEFAULT_PLANS = [
    # --- PATIENT PLANS ---
    {
        "code": "Free",
        "name": "Free Plan",
        "target_role": "patient",
        "price_inr": 0,
        "diabetes_predictions_limit": 3,
        "heart_predictions_allowed": False,
        "chat_messages_limit": 10,
        "pdf_downloads_allowed": False,
        "forecast_allowed": False,
        "report_summarization_allowed": False,
        "doctor_assignment_allowed": False,
        "history_retention_days": 30,
        "priority_support": False
    },
    {
        "code": "Pro",
        "name": "Pro Plan",
        "target_role": "patient",
        "price_inr": 299,
        "diabetes_predictions_limit": -1,
        "heart_predictions_allowed": True,
        "chat_messages_limit": 100,
        "pdf_downloads_allowed": True,
        "forecast_allowed": True,
        "report_summarization_allowed": True,
        "doctor_assignment_allowed": True,
        "history_retention_days": 365,
        "priority_support": False
    },
    {
        "code": "Clinical",
        "name": "Clinical Plan",
        "target_role": "patient",
        "price_inr": 999,
        "diabetes_predictions_limit": -1,
        "heart_predictions_allowed": True,
        "chat_messages_limit": -1,
        "pdf_downloads_allowed": True,
        "forecast_allowed": True,
        "report_summarization_allowed": True,
        "doctor_assignment_allowed": True,
        "history_retention_days": -1,
        "priority_support": True
    },
    # --- DOCTOR / CLINIC PLANS ---
    {
        "code": "Doc_Free",
        "name": "Free Doctor",
        "target_role": "doctor",
        "price_inr": 0,
        "max_assigned_patients": 5,
        "doctor_ml_scans_limit": 10,
        "doctor_pdf_downloads_limit": 5,
        "heart_predictions_allowed": False,
        "cohort_clustering_allowed": False,
        "predictive_alerts_allowed": False,
        "custom_date_range_analytics": False,
        "forecast_allowed": False,
        "report_summarization_allowed": False,
        "upload_lab_reports_allowed": True,
        "history_retention_days": 30,
        "priority_support": False,
        "api_access_allowed": False
    },
    {
        "code": "Doc_Professional",
        "name": "Professional Doctor",
        "target_role": "doctor",
        "price_inr": 999,
        "max_assigned_patients": 50,
        "doctor_ml_scans_limit": 200,
        "doctor_pdf_downloads_limit": -1,
        "heart_predictions_allowed": True,
        "cohort_clustering_allowed": False,
        "predictive_alerts_allowed": False,
        "custom_date_range_analytics": False,
        "forecast_allowed": True,
        "report_summarization_allowed": True,
        "upload_lab_reports_allowed": True,
        "history_retention_days": 365,
        "priority_support": False,
        "api_access_allowed": False
    },
    {
        "code": "Doc_Clinical_Plus",
        "name": "Clinical Plus Doctor",
        "target_role": "doctor",
        "price_inr": 2499,
        "max_assigned_patients": -1,
        "doctor_ml_scans_limit": -1,
        "doctor_pdf_downloads_limit": -1,
        "heart_predictions_allowed": True,
        "cohort_clustering_allowed": True,
        "predictive_alerts_allowed": True,
        "custom_date_range_analytics": True,
        "forecast_allowed": True,
        "report_summarization_allowed": True,
        "upload_lab_reports_allowed": True,
        "history_retention_days": -1,
        "priority_support": True,
        "api_access_allowed": True
    }
]

def seed_subscription_plans(db: Session):
    """Seed initial subscription plans if table is empty or missing entries."""
    for plan_data in DEFAULT_PLANS:
        existing = db.query(SubscriptionPlan).filter(SubscriptionPlan.code == plan_data["code"]).first()
        if not existing:
            plan = SubscriptionPlan(**plan_data)
            db.add(plan)
        else:
            # Update fields to ensure latest definitions
            for key, val in plan_data.items():
                setattr(existing, key, val)
    db.commit()
    logger.info("Subscription plans seeded/updated successfully.")

def get_current_year_month() -> str:
    """Returns current year-month string formatted as YYYY-MM."""
    return datetime.datetime.utcnow().strftime("%Y-%m")

def get_or_create_monthly_usage(user_id: int, db: Session) -> UsageTracking:
    """Fetch or create the usage tracking row for the current calendar month."""
    ym = get_current_year_month()
    usage = db.query(UsageTracking)\
        .filter(UsageTracking.user_id == user_id, UsageTracking.year_month == ym)\
        .first()
    
    if not usage:
        usage = UsageTracking(
            user_id=user_id,
            year_month=ym,
            diabetes_predictions_count=0,
            heart_predictions_count=0,
            chat_messages_count=0,
            pdf_downloads_count=0
        )
        db.add(usage)
        db.commit()
        db.refresh(usage)
        
    return usage

def get_plan_by_code(code: str, db: Session) -> SubscriptionPlan:
    """Fetch plan object by code (e.g. Free, Pro, Clinical), defaulting to Free if missing."""
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.code == code).first()
    if not plan:
        seed_subscription_plans(db)
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.code == code).first()
        if not plan:
            plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.code == "Free").first()
    return plan

def check_and_increment_feature_usage(user: User, feature_name: str, db: Session):
    """
    Enforces feature limits based on the user's active subscription tier.
    Increments counter if permitted; raises HTTP 429 / 402 if locked or exceeded.
    Doctors and Admins are medical staff and bypass patient self-serve tier locks.
    """
    if user.role in ["doctor", "admin"]:
        return

    tier_code = user.subscription_tier or "Free"
    plan = get_plan_by_code(tier_code, db)
    usage = get_or_create_monthly_usage(user.id, db)

    if feature_name == "diabetes_prediction":
        limit = plan.diabetes_predictions_limit
        if limit != -1 and usage.diabetes_predictions_count >= limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "error": "limit_reached",
                    "feature": "diabetes_predictions",
                    "message": f"You have reached your monthly limit of {limit} diabetes risk predictions on the {plan.name}.",
                    "limit": limit,
                    "used": usage.diabetes_predictions_count,
                    "current_tier": tier_code,
                    "upgrade_url": "/pricing"
                }
            )
        usage.diabetes_predictions_count += 1

    elif feature_name == "heart_prediction":
        if not plan.heart_predictions_allowed:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "error": "feature_locked",
                    "feature": "heart_predictions",
                    "message": f"Heart Disease Risk Screening is locked on the {plan.name}. Upgrade to Pro or Clinical to unlock.",
                    "current_tier": tier_code,
                    "upgrade_url": "/pricing"
                }
            )
        usage.heart_predictions_count += 1

    elif feature_name == "chat_message":
        limit = plan.chat_messages_limit
        if limit != -1 and usage.chat_messages_count >= limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "error": "limit_reached",
                    "feature": "chat_messages",
                    "message": f"You have reached your monthly limit of {limit} AI Chat messages on the {plan.name}.",
                    "limit": limit,
                    "used": usage.chat_messages_count,
                    "current_tier": tier_code,
                    "upgrade_url": "/pricing"
                }
            )
        usage.chat_messages_count += 1

    elif feature_name == "pdf_download":
        if not plan.pdf_downloads_allowed:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "error": "feature_locked",
                    "feature": "pdf_downloads",
                    "message": f"PDF Clinical Report Downloading is locked on the {plan.name}. Upgrade to Pro to download PDF reports.",
                    "current_tier": tier_code,
                    "upgrade_url": "/pricing"
                }
            )
        usage.pdf_downloads_count += 1

    elif feature_name == "forecast":
        if not plan.forecast_allowed:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "error": "feature_locked",
                    "feature": "risk_forecast",
                    "message": f"Longitudinal Trend Forecasting is locked on the {plan.name}. Upgrade to Pro to unlock 6-month forecasting.",
                    "current_tier": tier_code,
                    "upgrade_url": "/pricing"
                }
            )

    db.commit()
    db.refresh(usage)

def process_subscription_upgrade(user: User, plan_code: str, payment_method: str, payment_id: str, db: Session) -> Tuple[User, UserSubscription]:
    """Upgrades user subscription tier and registers active UserSubscription record."""
    target_plan = get_plan_by_code(plan_code, db)
    
    user.subscription_tier = target_plan.code
    
    # Deactivate existing active subscriptions
    db.query(UserSubscription)\
        .filter(UserSubscription.user_id == user.id, UserSubscription.status == "active")\
        .update({"status": "superceded"})
    
    now = datetime.datetime.utcnow()
    end_date = now + datetime.timedelta(days=30) if target_plan.code != "Free" else None
    
    subscription_rec = UserSubscription(
        user_id=user.id,
        plan_code=target_plan.code,
        status="active",
        start_date=now,
        end_date=end_date,
        payment_method=payment_method or "mock",
        payment_id=payment_id or f"mock_tx_{int(now.timestamp())}"
    )
    
    db.add(subscription_rec)
    db.commit()
    db.refresh(user)
    db.refresh(subscription_rec)
    
    return user, subscription_rec

def process_subscription_cancel(user: User, db: Session) -> User:
    """Cancels active paid subscription and resets user tier to Free."""
    db.query(UserSubscription)\
        .filter(UserSubscription.user_id == user.id, UserSubscription.status == "active")\
        .update({"status": "cancelled"})
    
    user.subscription_tier = "Free" if user.role != "doctor" else "Doc_Free"
    db.commit()
    db.refresh(user)
    return user

def get_doctor_plan(user: User, db: Session) -> SubscriptionPlan:
    """Helper to resolve active SubscriptionPlan for a doctor user."""
    tier = user.subscription_tier or "Doc_Free"
    if tier == "Free":
        tier = "Doc_Free"
    elif tier == "Pro":
        tier = "Doc_Professional"
    elif tier == "Clinical":
        tier = "Doc_Clinical_Plus"
    return get_plan_by_code(tier, db)

def check_doctor_patient_assignment_slot(doctor_user: User, assigned_count: int, db: Session):
    """Enforces doctor assigned patient limits (5 / 50 / Unlimited)."""
    if doctor_user.role != "doctor":
        return
    plan = get_doctor_plan(doctor_user, db)
    limit = plan.max_assigned_patients
    if limit != -1 and assigned_count >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "limit_reached",
                "feature": "max_assigned_patients",
                "message": f"You have reached your limit of {limit} assigned patients on the {plan.name}. Upgrade to Professional or Clinical Plus to add more patients.",
                "limit": limit,
                "used": assigned_count,
                "current_tier": plan.code,
                "upgrade_url": "/pricing"
            }
        )

def check_doctor_ml_scan_slot(doctor_user: User, db: Session):
    """Enforces doctor monthly ML scan limits (10 / 200 / Unlimited)."""
    if doctor_user.role != "doctor":
        return
    plan = get_doctor_plan(doctor_user, db)
    limit = plan.doctor_ml_scans_limit
    usage = get_or_create_monthly_usage(doctor_user.id, db)
    if limit != -1 and usage.doctor_ml_scans_count >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "limit_reached",
                "feature": "doctor_ml_scans",
                "message": f"You have reached your monthly limit of {limit} ML scans on the {plan.name}. Upgrade to Professional or Clinical Plus for more scans.",
                "limit": limit,
                "used": usage.doctor_ml_scans_count,
                "current_tier": plan.code,
                "upgrade_url": "/pricing"
            }
        )
    usage.doctor_ml_scans_count += 1
    db.commit()

def check_doctor_pdf_download_slot(doctor_user: User, db: Session):
    """Enforces doctor monthly PDF download limits (5 / Unlimited / Unlimited)."""
    if doctor_user.role != "doctor":
        return
    plan = get_doctor_plan(doctor_user, db)
    limit = plan.doctor_pdf_downloads_limit
    usage = get_or_create_monthly_usage(doctor_user.id, db)
    if limit != -1 and usage.doctor_pdf_downloads_count >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "limit_reached",
                "feature": "doctor_pdf_downloads",
                "message": f"You have reached your monthly limit of {limit} PDF report downloads on the {plan.name}. Upgrade to Professional or Clinical Plus for unlimited downloads.",
                "limit": limit,
                "used": usage.doctor_pdf_downloads_count,
                "current_tier": plan.code,
                "upgrade_url": "/pricing"
            }
        )
    usage.doctor_pdf_downloads_count += 1
    db.commit()

def require_doctor_cohort_clustering_access(doctor_user: User, db: Session):
    """Enforces cohort clustering permission (exclusive to Clinical Plus plan)."""
    if doctor_user.role != "doctor":
        return
    plan = get_doctor_plan(doctor_user, db)
    if not plan.cohort_clustering_allowed:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "error": "feature_locked",
                "feature": "cohort_clustering",
                "message": f"Patient cohort clustering is an advanced analytics feature exclusive to the Clinical Plus plan. Upgrade to Clinical Plus to unlock.",
                "current_tier": plan.code,
                "upgrade_url": "/pricing"
            }
        )

