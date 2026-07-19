from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.database.database import get_db
from app.models.models import User, SubscriptionPlan, UserSubscription
from app.auth.dependencies import get_current_user
from app.schemas.subscription import (
    SubscriptionPlanOut,
    UserSubscriptionOut,
    UsageStatsOut,
    UpgradeRequest,
    UpgradeResponse,
    CancelResponse
)
from app.models.models import User, SubscriptionPlan, UserSubscription, Appointment
from app.services.subscription_service import (
    seed_subscription_plans,
    get_plan_by_code,
    get_doctor_plan,
    get_or_create_monthly_usage,
    process_subscription_upgrade,
    process_subscription_cancel
)

router = APIRouter(prefix="/subscription", tags=["Subscription"])

@router.get("/plans", response_model=List[SubscriptionPlanOut])
def get_plans(role: Optional[str] = Query(None), db: Session = Depends(get_db)):
    """Retrieve list of available subscription plans, optionally filtered by role (patient vs doctor)."""
    query = db.query(SubscriptionPlan)
    if role:
        query = query.filter(SubscriptionPlan.target_role == role)
    plans = query.all()
    if not plans:
        seed_subscription_plans(db)
        query = db.query(SubscriptionPlan)
        if role:
            query = query.filter(SubscriptionPlan.target_role == role)
        plans = query.all()
    return plans

@router.get("/current", response_model=UserSubscriptionOut)
def get_current_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve active subscription tier, plan limits, and current month usage meters for the user."""
    if current_user.role == "doctor":
        plan = get_doctor_plan(current_user, db)
    else:
        tier_code = current_user.subscription_tier or "Free"
        plan = get_plan_by_code(tier_code, db)
        
    usage = get_or_create_monthly_usage(current_user.id, db)
    
    active_sub = db.query(UserSubscription)\
        .filter(UserSubscription.user_id == current_user.id, UserSubscription.status == "active")\
        .first()

    status_str = active_sub.status if active_sub else "active"
    start_date = active_sub.start_date if active_sub else current_user.created_at
    end_date = active_sub.end_date if active_sub else None

    # Calculate doctor assigned patients count if applicable
    assigned_patients_used = 0
    if current_user.role == "doctor":
        assigned_patients_used = db.query(Appointment.patient_id).filter(Appointment.doctor_id == current_user.id).distinct().count()

    usage_stats = UsageStatsOut(
        year_month=usage.year_month,
        diabetes_predictions_used=usage.diabetes_predictions_count,
        diabetes_predictions_limit=plan.diabetes_predictions_limit,
        heart_predictions_used=usage.heart_predictions_count,
        heart_predictions_allowed=plan.heart_predictions_allowed,
        chat_messages_used=usage.chat_messages_count,
        chat_messages_limit=plan.chat_messages_limit,
        pdf_downloads_used=usage.pdf_downloads_count,
        pdf_downloads_allowed=plan.pdf_downloads_allowed,
        forecast_allowed=plan.forecast_allowed,
        report_summarization_allowed=plan.report_summarization_allowed,
        assigned_patients_used=assigned_patients_used,
        assigned_patients_limit=plan.max_assigned_patients,
        doctor_ml_scans_used=usage.doctor_ml_scans_count,
        doctor_ml_scans_limit=plan.doctor_ml_scans_limit,
        doctor_pdf_downloads_used=usage.doctor_pdf_downloads_count,
        doctor_pdf_downloads_limit=plan.doctor_pdf_downloads_limit
    )

    return UserSubscriptionOut(
        user_id=current_user.id,
        subscription_tier=plan.code,
        status=status_str,
        start_date=start_date,
        end_date=end_date,
        plan_details=SubscriptionPlanOut.from_orm(plan),
        usage_stats=usage_stats
    )

@router.post("/upgrade", response_model=UpgradeResponse)
def upgrade_subscription(
    req: UpgradeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upgrades user subscription tier (supports instant mock checkout or Razorpay verification)."""
    valid_codes = ["Free", "Pro", "Clinical", "Doc_Free", "Doc_Professional", "Doc_Clinical_Plus"]
    if req.plan_code not in valid_codes:
        raise HTTPException(status_code=400, detail="Invalid subscription plan code.")
        
    target_code = req.plan_code
    if current_user.role == "doctor":
        if target_code == "Pro":
            target_code = "Doc_Professional"
        elif target_code == "Clinical":
            target_code = "Doc_Clinical_Plus"
        elif target_code == "Free":
            target_code = "Doc_Free"

    user, sub_rec = process_subscription_upgrade(
        user=current_user,
        plan_code=target_code,
        payment_method=req.payment_method or "mock",
        payment_id=req.payment_id or f"pay_mock_{target_code.lower()}",
        db=db
    )

    return UpgradeResponse(
        success=True,
        message=f"Successfully upgraded to {user.subscription_tier} plan!",
        subscription_tier=user.subscription_tier,
        start_date=sub_rec.start_date,
        end_date=sub_rec.end_date
    )

@router.post("/cancel", response_model=CancelResponse)
def cancel_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cancels current paid subscription and reverts tier to Free."""
    user = process_subscription_cancel(current_user, db)
    return CancelResponse(
        success=True,
        message="Subscription cancelled. Reverted to Free plan.",
        subscription_tier=user.subscription_tier
    )

@router.post("/reset-usage")
def reset_usage_counters(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Testing endpoint: Resets current month usage counters for testing limit enforcement."""
    usage = get_or_create_monthly_usage(current_user.id, db)
    usage.diabetes_predictions_count = 0
    usage.heart_predictions_count = 0
    usage.chat_messages_count = 0
    usage.pdf_downloads_count = 0
    db.commit()
    return {"success": True, "message": "Usage counters reset successfully."}
