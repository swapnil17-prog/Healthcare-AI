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

from app.core.rate_limiter import limiter
from app.database.database import engine
from app.models.models import Base
from app.api import auth, patients, appointments, medical_history, predictions, reports, chat, pdf

# Initialize Database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Healthcare AI Patient Risk Prediction API",
    description="Backend API for the learning/portfolio Patient Risk Prediction System",
    version="1.0.0"
)

# Hook the central rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS configuration
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

# Register API Routers
app.include_router(auth.router, prefix="/api")
app.include_router(patients.router, prefix="/api")
app.include_router(appointments.router, prefix="/api")
app.include_router(medical_history.router, prefix="/api")
app.include_router(predictions.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(pdf.router, prefix="/api")






@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "database": "connected",
        "system": "AI Patient Risk Prediction Backend"
    }
