# Walkthrough - Pagination, Timing Attack Defense, Cache-Control, & Log Filtering

Successfully implemented:
1. Cache-Control headers on all sensitive `/api/` endpoints.
2. Generic list pagination envelopes and page size hard caps (max 100/50/30).
3. Redux API slice response unpacking for dashboard compatibility.
4. Timing attack defense on user authentication.
5. Structured logging with sensitive data filtering and root logging refactoring.

## Changes Made

### 1. Cache-Control Security Middleware (`app/main.py`)
- Registered `NoCacheAPIMiddleware` which intercepts all requests matching `/api/`.
- Appends standard anti-caching headers (`Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0` and `Pragma: no-cache`) to response objects containing sensitive patient or doctor data.

### 2. API List Pagination & Envelopes (`app/schemas/schemas.py`, api files)
- Appended a generic `PaginatedEnvelope[T]` Pydantic model.
- Restructured routers to return wrapped envelope dictionaries: `{"items": [...], "total": count, "limit": limit, "skip": skip}`.
- Added hard-caps to all query parameters:
  - Admin/Patient lists: capped at 100.
  - Chat history: default 30, capped at 50.
  - Predictions: capped at 50.
- Updated API routes: `admin.py`, `predictions.py`, `medical_history.py`, `appointments.py`, `reports.py`, `chat.py`, and `patients.py`.

### 3. Frontend RTK Query Unpacking (`frontend/src/services/apiSlice.js`)
- Configured RTK Query `transformResponse` mapping logic for `getPatients`, `getDoctors`, `getMedicalHistory`, `getAppointments`, `getPredictions`, `getReports`, `getChatHistory`, `getAdminUsers`, and `getAssignments` endpoints.
- Seamlessly extracts `response?.items || response` to preserve compatibility with existing React widgets and charts without breaking layout states.

### 4. Authentication Timing Defense (`app/auth/security.py`, `api/auth.py`)
- Created `verify_password_safe` in `app/auth/security.py`.
- Generates a module-level dummy hash (`DUMMY_HASH`) using `bcrypt` at startup.
- Executes `bcrypt.checkpw` for both existing and missing user accounts to equalize login verification response times.
- Updated `/api/auth/login` to query the user, check `verify_password_safe`, and then apply lockout controls.

### 5. Structured Log Filter & Prints Audit (`core/logging_config.py`, `main.py`, app files)
- Created `logging_config.py` with `SensitiveDataFilter` to strip/mask:
  - JWT authorization tokens
  - Password parameters in json request payloads
  - Groq & Mem0 private API keys
  - Email addresses (partially masked)
  - Vitals search queries (e.g. glucose, bmi)
- Configured root logger stream formatting and attached it to `uvicorn.access`.
- Added `safe_request_logger` middleware to mask routing directories for sensitive authentication or stream targets.
- Replaced all legacy `print()` statements in `ml_service.py`, `chat.py`, `vector_store.py`, and `main.py` with structured `logger.info`, `logger.warning`, and `logger.error` calls.

---

## Test Verification

### Automated Tests
Successfully verified all 12 test files run and pass sequentially without database concurrency locks:
```bash
pytest test/ -v
```

All 12 test scripts passed successfully.

## Stage 2: Heart Disease Risk Prediction Feature

Successfully implemented the standalone Heart Disease Risk Prediction feature using the `cardio_train.csv` dataset:

### 1. Dataset Preprocessing & Model Training (`train_model.py`)
- Cleaned the `cardio_train.csv` dataset (systolic blood pressure capped at 250, diastolic strictly less than systolic, height and weight within physiological limits).
- Implemented a custom Logistic Regression classifier trained for 100 epochs, utilizing bootstrap resampling (100 estimators) to calculate 95% confidence intervals (2.5th and 97.5th percentiles) for the risk score.
- Saves model as `backend/models/heart_disease_model.pkl` with NumPy dynamic feature range specifications.

### 2. Database & API Router (`app/models/models.py`, `app/api/heart_predictions.py`)
- Created `HeartPrediction` SQLAlchemy model mapping vital parameters, calculated BMI, bootstrap confidence intervals, XAI log-odds feature contributions, and cardiologist referral recommendations.
- Implemented `/api/heart/predict` and `/api/heart/history` endpoints with robust role-based access checks (patients access own records, doctors access assigned patients' records via appointment bounds, admins access all).
- Created `/api/heart/status` endpoint to expose model availability status.

### 3. Frontend Pages & Analytics Integration (`frontend/src/`)
- **Predictions Page (`src/pages/Predictions.jsx`):** Implemented a tabbed layout to select between Diabetes Screening and Heart Disease Screening. Includes a two-column heart assessment form with real-time BMI auto-calculation, gauge charts, and conditional cardiologist referral cards.
- **Patient Dashboard (`src/pages/PatientDashboard.jsx`):** Renders a "Heart Disease Risk" card adjacent to the diabetes card, showing the latest risk score, confidence interval, and date.
- **Doctor Dashboard (`src/pages/DoctorDashboard.jsx`):** Integrates population-level heart statistics including an average risk KPI, a "Heart Disease Risk Distribution" donut chart, and routes patients with high risk (>70%) to the critical alerts list.

---

## Stage 3: Chatbot Heart Disease Risk Support & ChatWidget Crash Fix

### 1. Paginated Chat Array Extraction Fix (`frontend/src/components/ChatWidget.jsx`)
- Handled the paginated envelope payload in the `loadHistory` API call, using `Array.isArray(data) ? data : data?.items || []` to correctly assign the messages state. This resolved the uncaught `TypeError: messages.map is not a function` dashboard widget crash.

### 2. PDF Vitals Table Alignment (`backend/app/api/pdf.py`)
- Refactored ReportLab table structures to wrap all cells in auto-wrapping `Paragraph` flowable elements with custom `table_cell_style` and `table_header_style` settings.
- Restructured **Lifestyle factors** in the heart disease table to render neatly stacked lines via `<br/>` tags, avoiding column overlaps or text truncation.

### 3. Chatbot Cardiovascular Vitals RAG Integration (`backend/app/api/chat.py`)
- Implemented `get_heart_prediction_history` helper querying historical `HeartPrediction` records.
- Added `get_heart_prediction_history` to `GROQ_TOOLS` to allow the LLM to contextually retrieve patients' cardiovascular history.
- Integrated heart keywords (`"heart"`, `"cardio"`, `"cholesterol"`, `"blood pressure"`, `"bp"`) into the local mock fallback engine so patients get structured vitals history even when API keys are absent.

---

## Stage 4: Personalized Health Recommendations

### 1. LLM-Based Recommendations Upgrade (`backend/app/services/recommendation.py`)
- Refactored `get_doctor_recommendations` to support optional database session (`db`) and `patient_id` parameters.
- Implemented `generate_llm_recommendation` querying patient demography, historical diabetes screenings, historical heart disease screenings, and known medical histories/conditions.
- Prompts Groq (`llama-3.3-70b-versatile`) or Claude (`claude-3-5-sonnet-20240620`) to analyze longitudinal trends and output a highly personalized, contextual recommendation (e.g. tracking BMI or glucose increases over time) rather than generic rule referrals.
- Configured a fallback to the deterministic clinical rule engine if API calls fail or keys are absent.

### 2. API & PDF Call Sites (`predictions.py`, `reports.py`, `pdf.py`)
- Updated prediction pipelines, diagnostics report uploads, and PDF generators to propagate database context and patient IDs, displaying rich personalized health recommendations in the clinician views and downloaded reports.

### 3. Unit Tests (`backend/test/test_recommendations.py`)
- Created `test_recommendations.py` validating standard rule-based referral checks, successful LLM-driven recommendation generation, and API failure fallbacks.
- **Status: PASSED**
