import datetime
from typing import Optional, List
from pydantic import BaseModel

class SubscriptionPlanOut(BaseModel):
    id: int
    code: str
    name: str
    target_role: str = "patient"
    price_inr: int
    diabetes_predictions_limit: int
    heart_predictions_allowed: bool
    chat_messages_limit: int
    pdf_downloads_allowed: bool
    forecast_allowed: bool
    report_summarization_allowed: bool
    doctor_assignment_allowed: bool
    history_retention_days: int
    priority_support: bool

    # Doctor specific plan fields
    max_assigned_patients: int = 5
    doctor_ml_scans_limit: int = 10
    doctor_pdf_downloads_limit: int = 5
    cohort_clustering_allowed: bool = False
    predictive_alerts_allowed: bool = False
    custom_date_range_analytics: bool = False
    upload_lab_reports_allowed: bool = True
    api_access_allowed: bool = False

    class Config:
        from_attributes = True

class UsageStatsOut(BaseModel):
    year_month: str
    diabetes_predictions_used: int
    diabetes_predictions_limit: int
    heart_predictions_used: int
    heart_predictions_allowed: bool
    chat_messages_used: int
    chat_messages_limit: int
    pdf_downloads_used: int
    pdf_downloads_allowed: bool
    forecast_allowed: bool
    report_summarization_allowed: bool

    # Doctor specific usage fields
    assigned_patients_used: int = 0
    assigned_patients_limit: int = 5
    doctor_ml_scans_used: int = 0
    doctor_ml_scans_limit: int = 10
    doctor_pdf_downloads_used: int = 0
    doctor_pdf_downloads_limit: int = 5

class UserSubscriptionOut(BaseModel):
    user_id: int
    subscription_tier: str
    status: str
    start_date: Optional[datetime.datetime] = None
    end_date: Optional[datetime.datetime] = None
    plan_details: SubscriptionPlanOut
    usage_stats: UsageStatsOut

class UpgradeRequest(BaseModel):
    plan_code: str  # Free, Pro, Clinical
    payment_method: Optional[str] = "mock"  # mock, razorpay
    payment_id: Optional[str] = None
    razorpay_order_id: Optional[str] = None
    razorpay_signature: Optional[str] = None

class UpgradeResponse(BaseModel):
    success: bool
    message: str
    subscription_tier: str
    start_date: datetime.datetime
    end_date: Optional[datetime.datetime] = None

class CancelResponse(BaseModel):
    success: bool
    message: str
    subscription_tier: str
