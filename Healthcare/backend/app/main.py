from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

import os
from dotenv import load_dotenv

# Load .env relative to this file's folder (backend/app/main.py -> backend/.env)
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dotenv_path = os.path.join(base_dir, ".env")
load_dotenv(dotenv_path)

from sqlalchemy import text
from app.core.rate_limiter import limiter
from datetime import datetime
from app.database.database import engine, SessionLocal
from app.models.models import Base, RevokedToken, HealthNudge
from app.api import auth, patients, appointments, medical_history, predictions, reports, chat, pdf, admin, health_nudges

# Initialize Database tables
Base.metadata.create_all(bind=engine)

# Ensure feature_contributions column exists in predictions table for existing databases
try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE predictions ADD COLUMN feature_contributions JSON"))
        conn.commit()
except Exception:
    pass

# Ensure is_active column exists in users table for existing databases
try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1"))
        conn.commit()
except Exception:
    pass

# Ensure suspended_at column exists in users table for existing databases
try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN suspended_at DATETIME"))
        conn.commit()
except Exception:
    pass

app = FastAPI(
    title="Healthcare AI Patient Risk Prediction API",
    description="Backend API for the learning/portfolio Patient Risk Prediction System",
    version="1.0.0"
)

@app.on_event("startup")
async def cleanup_revoked_tokens():
    db = SessionLocal()
    try:
        db.query(RevokedToken)\
          .filter(RevokedToken.expires_at < datetime.utcnow())\
          .delete()
        db.commit()
    finally:
        db.close()

from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request
from fastapi.responses import JSONResponse

# 1. SecurityHeadersMiddleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=()"
        )
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline' fonts.googleapis.com; "
            "font-src 'self' fonts.gstatic.com; "
            "img-src 'self' data:; "
            "connect-src 'self' api.groq.com api.mem0.ai;"
        )
        return response

app.add_middleware(SecurityHeadersMiddleware)

# 2. Request size limit middleware
@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    max_body_size = 10 * 1024 * 1024  # 10MB max
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > max_body_size:
        return JSONResponse(
            status_code=413,
            content={"detail": "Request body too large"}
        )
    return await call_next(request)

# 3. CORS configuration
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 4. Hook the central rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Register API Routers
app.include_router(auth.router, prefix="/api")
app.include_router(patients.router, prefix="/api")
app.include_router(appointments.router, prefix="/api")
app.include_router(medical_history.router, prefix="/api")
app.include_router(predictions.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(pdf.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(health_nudges.router, prefix="/api")

# APScheduler Background Task Setup
from apscheduler.schedulers.background import BackgroundScheduler
from app.services.health_nudges import run_all_health_nudge_checks

scheduler = BackgroundScheduler()

def run_daily_nudge_job():
    db = SessionLocal()
    try:
        run_all_health_nudge_checks(db)
    except Exception as e:
        print(f"Error in daily nudge task: {e}")
    finally:
        db.close()

@app.on_event("startup")
def start_scheduler():
    if not scheduler.running:
        scheduler.add_job(run_daily_nudge_job, "cron", hour=9, minute=0)
        scheduler.start()

@app.on_event("shutdown")
def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)






@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "database": "connected",
        "system": "AI Patient Risk Prediction Backend"
    }
