from pydantic import BaseModel
from datetime import datetime

class LabReportOut(BaseModel):
    id: int
    public_id: str
    patient_id: int
    file_path: str
    upload_date: datetime
    report_type: str

    class Config:
        from_attributes = True
