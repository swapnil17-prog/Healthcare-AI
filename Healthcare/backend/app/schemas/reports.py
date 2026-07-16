from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class LabReportOut(BaseModel):
    id: int
    public_id: str
    patient_id: int
    file_path: str
    upload_date: datetime
    report_type: str
    summary: Optional[str] = None

    class Config:
        from_attributes = True
