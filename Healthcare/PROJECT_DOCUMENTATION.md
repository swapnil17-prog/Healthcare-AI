# Healthcare AI Patient Risk Prediction System: Project Documentation & Architecture

This document provides a comprehensive overview of the **AI-Powered Patient Risk Prediction System**, detailing its architectural flow, a file-by-file breakdown explaining the exact purpose of every file, and a summary of all feature implementations completed to date.

---

## 1. Project Working & System Architecture

The **Healthcare AI Patient Risk Prediction System** is a full-stack, secure, machine-learning-enabled clinical decision support application. It operates by combining clinical rule engines, deterministic algorithms, pure-Python machine learning, and retrieval-augmented generation (RAG) to provide a modern interface for patients, doctors, and administrators.

### Core Architecture Flow
```mermaid
graph TD
  React["React + Redux Frontend"]
  FastAPI["FastAPI REST API Backend"]
  SQLite["SQLite Database (SQLAlchemy ORM)"]
  ML["Pure-Python ML Risk Service"]
  Claude["Claude 3.5 Sonnet RAG Chatbot"]
  PDF["ReportLab PDF Summary Service"]
  RuleEngine["Doctor Referral Rule Engine"]
  TFIDF["TF-IDF Vector Store (RAG)"]
  
  React -->|REST Request with JWT| FastAPI
  FastAPI -->|Query/Persist Data| SQLite
  FastAPI -->|Inference (Pima Dataset)| ML
  FastAPI -->|Check Vitals thresholds| RuleEngine
  FastAPI -->|Ground Context / Query| Claude
  FastAPI -->|Search Guidelines| TFIDF
  FastAPI -->|Compile Patient Report| PDF
```

### Operational Workflows
1. **User Authentication:** 
   Users register and login with roles (`admin`, `doctor`, `patient`). Access tokens (JWT) are returned in the response body for API requests, while a longer-lived refresh token is stored in a secure, `HttpOnly` cookie to seamlessly renew expired sessions.
2. **Patient Risk Prediction Pipeline:** 
   When a user (or their assigned doctor/admin) initiates a risk scan, physiological vitals (Pregnancies, Glucose, Blood Pressure, Insulin, BMI, Age) are submitted. The FastAPI backend triggers the ML service, executing an optimized pure-Python `SimpleLogisticRegression` model. The resulting percentage risk score and log-odds Explainable AI (XAI) feature contributions are calculated, processed through the **Doctor Referral Rule Engine** (to suggest specialists like Endocrinologists, Cardiologists, or Nutritionists), and stored in the database.
3. **Retrieval-Augmented Generation (RAG) Chatbot:** 
   A floating chat widget streams responses from Claude 3.5 Sonnet. When a patient queries the assistant, the backend retrieves their latest ML prediction metrics and queries a local `TfidfVectorizer` vector store indexing clinical guidelines (normal glucose ranges, BMI definitions) and app guides. This contextual package is injected into the Claude system prompt alongside clinical guardrails to deliver medical explanations without giving direct medical diagnoses.
4. **PDF Generation:** 
   Using the `ReportLab` library, patient demographic details, complete medical history logs, ML prediction history, and rule-based referral recommendations are dynamically compiled into a clean, printable PDF document on demand.

---

## 2. Comprehensive File-by-File Breakdown

Below is an exhaustive directory list explaining the role and responsibility of each code file within the workspace.

### Backend Component (`backend/`)

The backend is built with **FastAPI** and uses **SQLAlchemy ORM** to connect to an SQLite database. It organizes logic into distinct directories for database access, auth security, models, schemas, API endpoints, and external services.

| File Path / Link | Description |
| :--- | :--- |
| [main.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/app/main.py) | **FastAPI Entrypoint:** Initializes the database schema, registers API routers, configures CORS origins, registers the rate-limiter, and defines the public `/api/health` check. |
| [database.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/app/database/database.py) | **Database Connection Setup:** Configures SQLAlchemy's database engine, handles session makers (`SessionLocal`), and exports the declarative `Base` model. Supports SQLite out-of-the-box but is structured to easily switch to PostgreSQL. |
| [models.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/app/models/models.py) | **SQLAlchemy Database Models:** Defines the database tables and relational schemas including `User` (auth data), `Patient` (vitals and profiles), `MedicalHistory` (clinical histories), `LabReport` (uploaded documents), `Prediction` (stored ML scores), `Appointment` (consultations), and `ChatMessage` (chat logs). |
| [requirements.txt](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/requirements.txt) | **Backend Dependencies:** Lists required Python packages including `fastapi`, `uvicorn`, `sqlalchemy`, `python-jose`, `bcrypt`, `reportlab`, `scikit-learn`, and `slowapi`. |
| [train_model.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/train_model.py) | **ML Training Script:** A standalone script that downloads the Pima Indians Diabetes Dataset, imputes missing physiological values with column medians, balances class distributions via minority class oversampling, runs hyperparameter grid-search cross-validation to select the optimal learning rate and epochs, trains the custom Logistic Regression model, prints accuracy metrics, and saves the trained weights into `models/diabetes_model.pkl`. |

#### Security & Auth Subfolder (`backend/app/auth/`)
| File Path / Link | Description |
| :--- | :--- |
| [security.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/app/auth/security.py) | **Token & Hashing Utils:** Handles hashing and verification of passwords via `bcrypt` and signs/decodes JWT access and refresh tokens. |
| [dependencies.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/app/auth/dependencies.py) | **API Guards & Middleware:** Custom FastAPI dependencies. `get_current_user` extracts and decodes the JWT bearer token, while `require_role`/`require_roles` enforce RBAC rules on endpoints. |

#### Machine Learning Subfolder (`backend/app/ml/`)
| File Path / Link | Description |
| :--- | :--- |
| [model_definition.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/app/ml/model_definition.py) | **Pure-Python Classifier:** Contains the `SimpleLogisticRegression` class definition, incorporating min-max feature scaling, fit loop gradient descent, probability estimation, and a feature contribution method to support Explainable AI (XAI). Avoids native binaries (SciPy/NumPy compiled DLLs) to ensure strict system compatibility. |
| [ml_service.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/app/ml/ml_service.py) | **Inference Singleton Wrapper:** Loads the pickled model binary and executes probability predictions on input profiles to calculate percentage risk scores and log-odds feature contributions. |

#### Schemas Subfolder (`backend/app/schemas/`)
Pydantic schemas enforce type safety and format requirements on requests and serialize API responses.
*   [schemas.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/app/schemas/schemas.py) – Base schemas for registration, logins, token payloads, and core user definitions.
*   [patients.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/app/schemas/patients.py) – Validates profile fields (height, weight, age, phone) and shapes output patient profiles.
*   [medical_history.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/app/schemas/medical_history.py) – Handles schemas for creating, updating, and viewing medical records.
*   [appointments.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/app/schemas/appointments.py) – Validates appointment dates, doctors, and scheduling notes.
*   [predictions.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/app/schemas/predictions.py) – Formats vitals fields for model input and structures prediction result outputs.
*   [reports.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/app/schemas/reports.py) – Handles serialization for diagnostic upload file data.

#### API Routers Subfolder (`backend/app/api/`)
These files contain the controllers mapping requests to business services and returning JSON structures.
*   [auth.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/app/api/auth.py) – Routes for `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/refresh`, and profile validation `/api/auth/me`.
*   [patients.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/app/api/patients.py) – Routes for profile retrievals, lists, and edits, enforcing doctor assignment bounds.
*   [appointments.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/app/api/appointments.py) – Creates and returns appointments for patients, admins, and doctors.
*   [medical_history.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/app/api/medical_history.py) – Implements medical record creation, list retrievals, updates, and deletes.
*   [predictions.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/app/api/predictions.py) – Runs prediction requests by routing variables to the ML service and returning recommendations.
*   [reports.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/app/api/reports.py) – Manages file uploads (PDF/CSV) to server disk, retrieves patient diagnostic lists, and downloads raw files.
*   [chat.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/app/api/chat.py) – Integrates the Claude 3.5 Sonnet streaming chatbot, incorporating Server-Sent Events (SSE) `/stream`, history calls, context assembly, mock response fallbacks, and local safety deflection filters for diagnoses and dosage questions.
*   [pdf.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/app/api/pdf.py) – Assembles the PDF document utilizing ReportLab styles, custom tables, margins, and titles, branded under the 'Healthcare AI' identifier.

#### Services and Core Subfolder (`backend/app/services/` & `backend/app/core/`)
*   [recommendation.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/app/services/recommendation.py) – Implements the deterministic rule engine evaluating glucose levels, BMI, and diastolic BP thresholds to match patients with clinical specialists.
*   [vector_store.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/app/services/vector_store.py) – Custom RAG vector index using TF-IDF matching. Extracts matching content blocks based on cosine similarities from medical guidelines and application instructions.
*   [rate_limiter.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/app/core/rate_limiter.py) – Sets up a central rate-limiting manager utilizing the client's IP to safeguard auth, ML, and chat routes.

#### Diagnostic Test Scripts (`backend/`)
Standalone diagnostic scripts executing test suites against a temporary in-memory database configuration:
*   [test_auth.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/test_auth.py) – Verifies user registrations, duplicate handling, logins, profile checks, and token refreshing.
*   [test_crud.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/test_crud.py) – Validates profile update constraints, medical history rights, and doctor assignment mechanics.
*   [test_prediction.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/test_prediction.py) – Asserts ML classification calculations, default referrals, and history access blocks.
*   [test_reports.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/test_reports.py) – Validates file extension checks (PDF/CSV), size blocks (>5MB), and download permissions.
*   [test_chat.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/test_chat.py) – Tests the chatbot history endpoints and mock conversation generation.
*   [test_pdf.py](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/backend/test_pdf.py) – Confirms the ReportLab compilation process runs and yields structured files.

---

### Frontend Component (`frontend/`)

The frontend is a single-page React app styled with vanilla CSS variables and built with Vite. It features Redux Toolkit for state management, Recharts for data visualization, and Lucide icons.

| File Path / Link | Description |
| :--- | :--- |
| [index.html](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/frontend/index.html) | **HTML Template:** Sets up the browser viewport metadata, declares the application mount element `<div id="root">`, and imports Outfit and Inter typography from Google Fonts. |
| [package.json](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/frontend/package.json) | **Dependency Manifest:** Configures the project's scripts and lists React, Redux Toolkit, Recharts, Lucide-react, and React-router-dom dependencies. |
| [vite.config.js](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/frontend/vite.config.js) | **Build Config:** Sets up the Vite build tool and links the React compiler plugins. |
| [main.jsx](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/frontend/src/main.jsx) | **App Mounter:** Mounts the React component tree into the DOM, wrapped in Redux `Provider` and React Router `BrowserRouter` containers. |
| [index.css](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/frontend/src/index.css) | **Global Design System:** Contains all CSS variables (fonts, HSL color tokens, animations) and defines custom scrollbars, typography rules, glassmorphism layouts, buttons, and badges. |
| [App.jsx](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/frontend/src/App.jsx) | **Navigation Hub & Layout:** Renders the main glassmorphism navbar header, links tabs based on roles, configures routing paths, and handles session logouts. |
| [App.css](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/frontend/src/App.css) | **Layout Customizations:** Styles the general layout grids, containers, footers, headers, and backgrounds. |

#### Redux State Subfolder (`frontend/src/redux/`)
*   [store.js](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/frontend/src/redux/store.js) – Configures the global store, binding the authentication slice and registers the RTK Query API slice middleware.
*   [authSlice.js](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/frontend/src/redux/authSlice.js) – Manages user login/logout states, stores active JWT tokens, and writes credentials to local storage.

#### API Query Clients (`frontend/src/services/`)
*   [api.js](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/frontend/src/services/api.js) – A custom wrapper for the `fetch` API. Handles authorization header injection and automatically attempts token refresh requests when encountering a `401 Unauthorized` response.
*   [apiSlice.js](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/frontend/src/services/apiSlice.js) – Integrates RTK Query, providing auto-generated hooks to fetch, update, and cache patient profiles, predictions, reports, and appointments.

#### Shared UI Components (`frontend/src/components/`)
*   [ChatWidget.jsx](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/frontend/src/components/ChatWidget.jsx) & [ChatWidget.css](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/frontend/src/components/ChatWidget.css) – Renders the floating chat bubble widget. Initiates a connection to `/api/chat/stream`, parses Server-Sent Events (SSE) to display typing animations, and streams responses word-by-word.
*   [TrendChart.jsx](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/frontend/src/components/TrendChart.jsx) – Integrates a Recharts LineChart component, displaying historical vital parameters (glucose, BMI, and diastolic blood pressure) alongside risk scores to visualize health trends over time.

#### Portal Pages (`frontend/src/pages/`)
Each file serves a specific route and has a corresponding CSS file in the same directory:
*   [Login.jsx](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/frontend/src/pages/Login.jsx) & `Login.css` – Login and registration forms styled with glassmorphism overlays and background gradients.
*   [Dashboard.jsx](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/frontend/src/pages/Dashboard.jsx) – A routing gatekeeper page that checks the user's role and renders either the `PatientDashboard` or `DoctorDashboard`.
*   [PatientDashboard.jsx](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/frontend/src/pages/PatientDashboard.jsx) & `PatientDashboard.css` – The patient hub. Includes a radial risk gauge, profile update form, appointment booker, document downloads, trend charts, and the predictions log list.
*   [DoctorDashboard.jsx](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/frontend/src/pages/DoctorDashboard.jsx) & `DoctorDashboard.css` – The clinician workspace. Displays summary metrics (population KPIs), a pie chart of risk severity distributions, a chart showing average population risk trends, and high-risk alerts.
*   [Patients.jsx](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/frontend/src/pages/Patients.jsx) & `Patients.css` – The directory roster. Allows doctors and admins to browse patients, view clinical histories, upload PDF/CSV lab results, and run risk scans.
*   [Predictions.jsx](file:///c:/Users/LENOVO/OneDrive/Desktop/Healthcare/Healthcare/frontend/src/pages/Predictions.jsx) & `Predictions.css` – The screening form. Allows users to submit vital parameters, run the risk model, and display recommendations.

---

## 3. List of Completed Implementations

Here is a summary of the features and engineering work implemented in the project so far:

1.  **Full-Stack Scaffolding & Setup:** Installed all libraries, structured the front/back repositories, configured Vite bundlers, and set up dynamic CORS.
2.  **Role-Based Access Control (RBAC):** Established three distinct user roles (`admin`, `doctor`, `patient`). Secured API endpoints using FastAPI dependencies so patients can only access their own data, doctors can only interact with assigned patients, and admins have global access.
3.  **Secure JWT Auth Engine:** Integrated `bcrypt` password hashing and signed tokens. Implemented a session refresh flow using short-lived JWT access tokens and longer-lived refresh tokens stored in secure, HTTP-only cookies.
4.  **Database Integration (SQLite + SQLAlchemy):** Modeled 7 relational tables with cascade constraints, mapping tables to objects to simplify future migration to larger database dialects (like PostgreSQL).
5.  **Pure-Python Machine Learning Service:** Designed, trained, and integrated a `SimpleLogisticRegression` model on the Pima Indians Diabetes Dataset (achieving **77.27% accuracy**). Written entirely in pure Python to eliminate platform dependency issues on host environments.
6.  **Deterministic Referral Engine:** Developed a clinical rule engine evaluating vital parameters (glucose, blood pressure, BMI) and risk scores to propose specialty referrals (Endocrinologist, Cardiologist, Nutritionist, or General Practitioner).
7.  **Diagnostic Report Upload Service:** Implemented file upload handlers restricting file types to PDF and CSV formats, checking file sizes (under 5MB limit), and securing downloads.
8.  **Claude 3.5 Sonnet RAG Chatbot:** Integrated the Anthropic streaming API with Server-Sent Events (SSE). Grounded the LLM using a local TF-IDF vector search over clinical guidelines and application instructions. Implemented safety guardrails and local keyword deflection filters to immediately block and deflect diagnosis or dosage questions before LLM API invocation.
9.  **ReportLab PDF Export Service:** Developed an endpoint to dynamically compile patient details, medical histories, latest risk assessments, and recommendations into a formatted PDF document, utilizing custom ReportLab styling branded under the 'Healthcare AI' header/footer templates.
10. **Modern Glassmorphism UI:** Designed a premium interface using vanilla CSS variables, dark-mode styling, glowing gradients, hover states, and keyframe animations.
11. **Interactive Recharts Visualizations:** Integrated charts displaying vital parameters and population demographics, including a radial gauge, risk distribution pie chart, and historical trend lines.
12. **Automated Testing Suite:** Created 6 dedicated test scripts to verify the functionality of authentication, CRUD operations, predictions, document uploads, chat response generation, and PDF compilation.
13. **Explainable AI (XAI) & Hyperparameter Grid Search:** Balanced model training via minority class oversampling and implemented validation grid search tuning. Added signed log-odds contribution calculations to explain ML classifications, which are persisted in the database and rendered as custom bar charts in the frontend screening UI.

---

> [!NOTE]
> **Learning Project Disclaimer:** This system is a learning prototype using synthetic data. It is not HIPAA-compliant or intended for actual diagnostic clinical use.
