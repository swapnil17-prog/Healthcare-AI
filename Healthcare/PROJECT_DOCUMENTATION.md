# Healthcare AI Patient Risk Prediction System: Project Documentation & Architecture

This document provides a comprehensive overview of the **AI-Powered Patient Risk Prediction System**, detailing its architectural flow, a file-by-file breakdown explaining the exact purpose of every file, and a summary of all feature implementations completed to date.

---

## 1. Project Working & System Architecture

The **Healthcare AI Patient Risk Prediction System** is a full-stack, secure, machine-learning-enabled clinical decision support application. It operates by combining clinical rule engines, deterministic algorithms, pure-Python machine learning, and retrieval-augmented generation (RAG) to provide a modern interface for patients, doctors, and administrators.

The user interface is designed in a clean, modern medical dashboard style (MediAI specification) featuring:
- A light-gray background (#F4F7FE) with pure white card components and soft box shadows.
- Indigo-blue brand accents (#5B6BF8) and role-specific pill status badges.
- A fixed left sidebar navigation shell layout that collapses into a hamburger navigation drawer on mobile and tablet displays (≤1024px).
- Smooth Framer Motion enter slides, robot floating hover animations, and automatic card layout resizing.

### Core Architecture Flow
```mermaid
graph TD
  React["React + Redux Frontend"]
  FastAPI["FastAPI REST API Backend"]
  SQLite["SQLite Database (SQLAlchemy ORM)"]
  ML["Pure-Python ML Risk Service"]
  LLM["LLM Service (Claude / Groq API)"]
  PDF["ReportLab PDF Summary Service"]
  RuleEngine["Doctor Referral Rule Engine"]
  EmbedStore["SentenceTransformers Vector Store (RAG)"]
  
  React -->|REST Request with JWT| FastAPI
  FastAPI -->|Query/Persist Data| SQLite
  FastAPI -->|Inference (Pima Dataset)| ML
  FastAPI -->|Check Vitals thresholds| RuleEngine
  FastAPI -->|Ground Context & History / Query| LLM
  FastAPI -->|Semantic Search Guidelines| EmbedStore
  FastAPI -->|Compile Patient Report| PDF
  LLM -->|Tool Calls: fetch patient data| SQLite
```

### Operational Workflows
1. **User Authentication:** 
   Users register and login with roles (`admin`, `doctor`, `patient`). Access tokens (JWT) are returned in the response body for API requests, while a longer-lived refresh token is stored in a secure, `HttpOnly` cookie to seamlessly renew expired sessions.
2. **Patient Risk Prediction Pipeline:** 
   When a user (or their assigned doctor/admin) initiates a risk scan, physiological vitals (Pregnancies, Glucose, Blood Pressure, Insulin, BMI, Age) are submitted. The FastAPI backend triggers the ML service, executing an optimized pure-Python `SimpleLogisticRegression` model. The resulting percentage risk score and log-odds Explainable AI (XAI) feature contributions are calculated, processed through the **Doctor Referral Rule Engine** (to suggest specialists like Endocrinologists, Cardiologists, or Nutritionists), and stored in the database.
3. **Retrieval-Augmented Generation (RAG) Chatbot:** 
   A sliding right-side drawer chat widget streams responses from Claude 3.5 Sonnet or Llama-3.3-70b-versatile (accessible for patients). When a patient queries the assistant, the backend retrieves their latest ML prediction metrics, parses historical records via database function-calling tools, and queries a local `SentenceTransformer` (`all-MiniLM-L6-v2`) vector store indexing clinical guidelines (normal glucose ranges, BMI definitions) and app guides. This contextual package is injected into the LLM system prompt alongside clinical guardrails to deliver medical explanations without giving direct medical diagnoses.
4. **PDF Generation:** 
   Using the `ReportLab` library, patient demographic details, complete medical history logs, ML prediction history, and rule-based referral recommendations are dynamically compiled into a clean, printable PDF document on demand.

---

## 2. Interactive AI Chat & RAG Workflow

The system includes a secure, context-aware AI Health Assistant chatbot that integrates retrieval-augmented generation (RAG), strict safety deflections, dynamic database lookup tools, and multi-LLM API fallbacks.

### Frontend Chat Interface (`ChatWidget.jsx`)
1. **Drawer State & History Fetching:** The chat widget is rendered as a floating bubble at the bottom right. A custom window event listener (`open-chat`) allows other frontend components (like the sidebar) to trigger the opening of the sliding right-hand drawer panel. Upon opening, the component executes an API call to `GET /api/chat/history` to load the last 30 messages associated with the logged-in user.
2. **Text Streaming via Server-Sent Events (SSE):** When a user submits a query, the text is instantly rendered in the local chat bubble history with a loading typing animation. The frontend connects to the backend streaming endpoint `/api/chat/stream` using the browser's Fetch API, supplying JWT authorization headers. It parses the incoming stream using a `TextDecoder` and splits the buffer by newline boundaries, extracting JSON chunks prefixed with `data: ` and incrementally appending words to the active response state.
3. **Scroll Management:** An automatic scrolling anchor (`messagesEndRef`) scrolls the view down smoothly to ensure the latest streamed tokens remain visible to the user.

### Backend Routing and DB Persistence (`chat.py`)
1. **User Message Storing:** Every query submitted is written to the SQLite `ChatMessage` database table under the user's ID with the role set to `"user"`.
2. **Safety Pre-check Deflection:** To guarantee user safety and mitigate medical liability, the backend runs a regex scan on incoming message text before passing it to the LLM. It intercepts queries matching keyword patterns for:
   - **Dosages:** e.g., `dosage`, `dose`, `how many mg`
   - **Diagnosis:** e.g., `diagnose`, `diagnosis`, `do i have`, `am i diabetic`
   - **Emergencies:** e.g., `emergency`, `chest pain`
   - **Prescriptions:** e.g., `prescribe`, `prescription`
   When triggered, the backend bypasses the LLM APIs completely, returns an immediate static warning deflection advising the user to seek immediate professional medical attention, writes the disclaimer as an `"assistant"` record to the database, and streams it back to the client.
3. **Database Chat History Loading:** The backend queries the `ChatMessage` table to fetch the 10 most recent messages of the session and appends them to the current query payload as context to enable multi-turn conversations.
4. **Assistant Message Storing:** Once the full response is generated or streamed, the backend writes the compiled response to the SQLite `ChatMessage` database table under the user's ID with the role set to `"assistant"`.

### Retrieval-Augmented Generation (RAG) (`vector_store.py`)
1. **Document Loading and Fallbacks:** On startup, the singleton `GuidelineVectorStore` scans the directory `backend/app/data/knowledge_base/` for markdown (`.md`) and text (`.txt`) documents containing clinical advice or app documentation. If the folder is empty or absent, it falls back to a hardcoded array of `GUIDELINES_DOCUMENTS` covering American Diabetes Association (ADA) glucose guidelines, AHA/ACC hypertension rules, WHO BMI classifications, lifestyle/diet advice, and app instructions (uploads, appointments, PDF downloads).
2. **Semantic Text Chunking:** To fit within LLM context windows and maximize search precision, documents are segmented into smaller text chunks using a sliding window algorithm (chunk size: 300 words, overlap: 50 words).
3. **Embedding Generation:** The system encodes the corpus chunks using the lightweight SentenceTransformers model `"all-MiniLM-L6-v2"`. This generates 384-dimensional dense vector embeddings representing the semantic meaning of each chunk. The embeddings are pre-normalized, making cosine similarity calculations highly efficient.
4. **Cosine Similarity Vector Search:** When the user sends a query, the search service encodes the query using the same SentenceTransformers model. It computes cosine similarities via a vector dot product of the query embedding against the corpus embeddings.
5. **Threshold Filtering:** Matches are filtered using a similarity threshold score of `>= 0.3`. The top 2 matching chunks are formatted and returned as clinical background context.

### LLM Integration, Guardrails, and Tool Calling Loop
1. **Dynamic Prompt Assembly:** If the user role is `"patient"`, the backend fetches their demographic stats (name, age, gender, height, weight, blood group) from the SQLite database. It compiles these stats alongside the retrieved RAG guidelines chunks, system instructions, and the current local server time context (`[CURRENT DATE & TIME]`) into a unified system prompt to enable temporal awareness.
2. **Clinical System Guardrails:** The prompt explicitly commands the model to act as an educational app assistant, state that it is not a doctor, refuse to diagnose, and print the primary disclaimer strictly **only once** at the beginning of the chat session to keep subsequent conversation natural and direct.
3. **Multi-LLM API Dispatching:**
   - **Groq API (Llama-3.3-70b-versatile):** If a `GROQ_API_KEY` is detected, the backend issues a request to Groq's OpenAI-compatible completions endpoint. It provides native function calling tools:
     - `get_full_medical_history(patient_id)`: Fetches SQL records of diseases, diagnoses, medications, and clinical notes.
     - `get_prediction_history(patient_id)`: Fetches historical ML prediction results, logs, and feature inputs.
     - `get_appointments(patient_id)`: Fetches appointments dynamically tagged with `[PAST]` or `[UPCOMING]` relative to `datetime.now()` to ensure the LLM distinguishes them.
     If the model issues a tool call, the backend interceptor executes the corresponding SQLAlchemy database query, returns the structured data as a `"tool"` message to the model, and loops until the model outputs a final text answer.
   - **Anthropic API (Claude 3.5 Sonnet):** If an `ANTHROPIC_API_KEY` is present (and Groq key is absent/fails), the backend uses Anthropic's SDK to stream text directly from Claude 3.5 Sonnet.
   - **Rule-Based Mock Fallback:** If both LLM endpoints are unavailable or keys are missing, a localized deterministic keyword router (`generate_mock_response`) intercepts the query. It checks for keywords like `history`, `prediction`, `appointment`, or `upload` and dynamically fetches relevant patient records from the SQLite database to answer the query or prints app-usage details.

---

## 3. Comprehensive File-by-File Breakdown

Below is an directory list explaining the role and responsibility of each code file within the workspace.

### Backend Component (`backend/`)

The backend is built with **FastAPI** and uses **SQLAlchemy ORM** to connect to an SQLite database. It organizes logic into distinct directories for database access, auth security, models, schemas, API endpoints, and external services.

| File Path / Link | Description |
| :--- | :--- |
| [main.py](./backend/app/main.py) | **FastAPI Entrypoint:** Initializes the database schema, registers API routers, configures CORS origins, registers the rate-limiter, and defines the public `/api/health` check. |
| [database.py](./backend/app/database/database.py) | **Database Connection Setup:** Configures SQLAlchemy's database engine, handles session makers (`SessionLocal`), and exports the declarative `Base` model. Supports SQLite out-of-the-box but is structured to easily switch to PostgreSQL. |
| [models.py](./backend/app/models/models.py) | **SQLAlchemy Database Models:** Defines the database tables and relational schemas including `User` (auth data), `Patient` (vitals and profiles), `MedicalHistory` (clinical histories), `LabReport` (uploaded documents), `Prediction` (stored ML scores), `Appointment` (consultations), and `ChatMessage` (chat logs). |
| [requirements.txt](./backend/requirements.txt) | **Backend Dependencies:** Lists required Python packages including `fastapi`, `uvicorn`, `sqlalchemy`, `python-jose`, `bcrypt`, `reportlab`, `scikit-learn`, and `slowapi`. |
| [train_model.py](./backend/train_model.py) | **ML Training Script:** A standalone script that downloads the Pima Indians Diabetes Dataset, imputes missing physiological values with column medians, balances class distributions via minority class oversampling, runs hyperparameter grid-search cross-validation to select the optimal learning rate and epochs, trains the custom Logistic Regression model, prints accuracy metrics, and saves the trained weights into `models/diabetes_model.pkl`. |

#### Security & Auth Subfolder (`backend/app/auth/`)
| File Path / Link | Description |
| :--- | :--- |
| [security.py](./backend/app/auth/security.py) | **Token & Hashing Utils:** Handles hashing and verification of passwords via `bcrypt` and signs/decodes JWT access and refresh tokens. |
| [dependencies.py](./backend/app/auth/dependencies.py) | **API Guards & Middleware:** Custom FastAPI dependencies. `get_current_user` extracts and decodes the JWT bearer token, while `require_role`/`require_roles` enforce RBAC rules on endpoints. |

#### Machine Learning Subfolder (`backend/app/ml/`)
| File Path / Link | Description |
| :--- | :--- |
| [model_definition.py](./backend/app/ml/model_definition.py) | **Pure-Python Classifier:** Contains the `SimpleLogisticRegression` class definition, incorporating min-max feature scaling, fit loop gradient descent, probability estimation, and a feature contribution method to support Explainable AI (XAI). Avoids native binaries (SciPy/NumPy compiled DLLs) to ensure strict system compatibility. |
| [ml_service.py](./backend/app/ml/ml_service.py) | **Inference Singleton Wrapper:** Loads the pickled model binary and executes probability predictions on input profiles to calculate percentage risk scores and log-odds feature contributions. |

#### Schemas Subfolder (`backend/app/schemas/`)
Pydantic schemas enforce type safety and format requirements on requests and serialize API responses.
*   [schemas.py](./backend/app/schemas/schemas.py) – Base schemas for registration, logins, token payloads, and core user definitions.
*   [patients.py](./backend/app/schemas/patients.py) – Validates profile fields (height, weight, age, phone) and shapes output patient profiles.
*   [medical_history.py](./backend/app/schemas/medical_history.py) – Handles schemas for creating, updating, and viewing medical records.
*   [appointments.py](./backend/app/schemas/appointments.py) – Validates appointment dates, doctors, and scheduling notes.
*   [predictions.py](./backend/app/schemas/predictions.py) – Formats vitals fields for model input and structures prediction result outputs.
*   [reports.py](./backend/app/schemas/reports.py) – Handles serialization for diagnostic upload file data.

#### API Routers Subfolder (`backend/app/api/`)
These files contain the controllers mapping requests to business services and returning JSON structures.
*   [auth.py](./backend/app/api/auth.py) – Routes for `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/refresh`, and profile validation `/api/auth/me`.
*   [patients.py](./backend/app/api/patients.py) – Routes for profile retrievals, lists, and edits, enforcing doctor assignment bounds.
*   [appointments.py](./backend/app/api/appointments.py) – Creates and returns appointments for patients, admins, and doctors.
*   [medical_history.py](./backend/app/api/medical_history.py) – Implements medical record creation, list retrievals, updates, and deletes.
*   [predictions.py](./backend/app/api/predictions.py) – Runs prediction requests by routing variables to the ML service and returning recommendations.
*   [reports.py](./backend/app/api/reports.py) – Manages file uploads (PDF/CSV) to server disk, retrieves patient diagnostic lists, and downloads raw files.
*   [chat.py](./backend/app/api/chat.py) – Integrates the Claude 3.5 Sonnet streaming chatbot, incorporating Server-Sent Events (SSE) `/stream`, history calls, context assembly, mock response fallbacks, and local safety deflection filters for diagnoses and dosage questions.
*   [pdf.py](./backend/app/api/pdf.py) – Assembles the PDF document utilizing ReportLab styles, custom tables, margins, and titles, branded under the 'Healthcare AI' identifier.

#### Services and Core Subfolder (`backend/app/services/` & `backend/app/core/`)
*   [recommendation.py](./backend/app/services/recommendation.py) – Implements the deterministic rule engine evaluating glucose levels, BMI, and diastolic BP thresholds to match patients with clinical specialists.
*   [vector_store.py](./backend/app/services/vector_store.py) – Custom RAG vector index using TF-IDF matching. Extracts matching content blocks based on cosine similarities from medical guidelines and application instructions.
*   [rate_limiter.py](./backend/app/core/rate_limiter.py) – Sets up a central rate-limiting manager utilizing the client's IP to safeguard auth, ML, and chat routes.

#### Diagnostic Test Scripts (`backend/`)
Standalone diagnostic scripts executing test suites against a temporary in-memory database configuration:
*   [test_auth.py](./backend/test_auth.py) – Verifies user registrations, duplicate handling, logins, profile checks, and token refreshing.
*   [test_crud.py](./backend/test_crud.py) – Validates profile update constraints, medical history rights, and doctor assignment mechanics.
*   [test_prediction.py](./backend/test_prediction.py) – Asserts ML classification calculations, default referrals, and history access blocks.
*   [test_reports.py](./backend/test_reports.py) – Validates file extension checks (PDF/CSV), size blocks (>5MB), and download permissions.
*   [test_chat.py](./backend/test_chat.py) – Tests the chatbot history endpoints and mock conversation generation.
*   [test_pdf.py](./backend/test_pdf.py) – Confirms the ReportLab compilation process runs and yields structured files.

---

### Frontend Component (`frontend/`)

The frontend is a single-page React app styled with vanilla CSS variables and built with Vite. It features Redux Toolkit for state management, Recharts for data visualization, and Lucide icons.

| File Path / Link | Description |
| :--- | :--- |
| [index.html](./frontend/index.html) | **HTML Template:** Sets up the browser viewport metadata, declares the application mount element `<div id="root">`, and imports Outfit and Inter typography from Google Fonts. |
| [package.json](./frontend/package.json) | **Dependency Manifest:** Configures the project's scripts and lists React, Redux Toolkit, Recharts, Lucide-react, Framer-motion, and React-router-dom dependencies. |
| [vite.config.js](./frontend/vite.config.js) | **Build Config:** Sets up the Vite build tool and links the React compiler plugins. |
| [main.jsx](./frontend/src/main.jsx) | **App Mounter:** Mounts the React component tree into the DOM, wrapped in Redux `Provider` and React Router `BrowserRouter` containers. |
| [index.css](./frontend/src/index.css) | **Global Design System:** Contains all CSS variables (fonts, HEX color tokens, animations) and defines custom scrollbars, typography rules, white card panels with soft shadows, buttons, and badges. Configured with vertical scrolling overrides for the side navigation container. |
| [App.jsx](./frontend/src/App.jsx) | **Navigation Hub & Layout:** Renders the fixed left sidebar container, manages active navigation pill states, provides mobile drawer burger links, renders a Profile Settings Modal (for full name, phone number, and password change edits), and handles session logouts. Hides the AI Assistant controls from Doctor users. |
| [App.css](./frontend/src/App.css) | **Layout Customizations:** Styles the general layout grids, containers, footers, headers, and backgrounds. |

#### Redux State Subfolder (`frontend/src/redux/`)
*   [store.js](./frontend/src/redux/store.js) – Configures the global store, binding the authentication slice and registers the RTK Query API slice middleware.
*   [authSlice.js](./frontend/src/redux/authSlice.js) – Manages user login/logout states, stores active JWT tokens, and writes credentials to local storage.

#### API Query Clients (`frontend/src/services/`)
*   [api.js](./frontend/src/services/api.js) – A custom wrapper for the `fetch` API. Handles authorization header injection and automatically attempts token refresh requests when encountering a `401 Unauthorized` response.
*   [apiSlice.js](./frontend/src/services/apiSlice.js) – Integrates RTK Query, providing auto-generated hooks to fetch, update, and cache patient profiles, predictions, reports, and appointments.

#### Shared UI Components (`frontend/src/components/`)
*   [ChatWidget.jsx](./frontend/src/components/ChatWidget.jsx) & [ChatWidget.css](./frontend/src/components/ChatWidget.css) – Renders the sliding right-side assistant drawer. Initiates a connection to `/api/chat/stream`, parses Server-Sent Events (SSE) to display typing animations, and streams responses word-by-word.
*   [TrendChart.jsx](./frontend/src/components/TrendChart.jsx) – Integrates a Recharts LineChart component, displaying historical vital parameters (glucose, BMI, and diastolic blood pressure) alongside risk scores to visualize health trends over time.

#### Portal Pages (`frontend/src/pages/`)
Each file serves a specific route and has a corresponding CSS file in the same directory:
*   [Login.jsx](./frontend/src/pages/Login.jsx) & `Login.css` – Login and registration forms styled in split-screen format, containing a floating AI robot panel on the left and form credentials card on the right, integrated with enter and layout transitions.
*   [Dashboard.jsx](./frontend/src/pages/Dashboard.jsx) – A routing gatekeeper page that checks the user's role and renders either the `PatientDashboard` or `DoctorDashboard`.
*   [PatientDashboard.jsx](./frontend/src/pages/PatientDashboard.jsx) & `PatientDashboard.css` – The patient hub. Includes dynamic stat metric boxes, profile update forms, health target tracker meters, appointments summary lists, recommendations panels, and clinical histories log.
*   [PatientRecords.jsx](./frontend/src/pages/PatientRecords.jsx) – Extracted portal page separating patient appointments into chronologically sorted, interactive tabs (Upcoming vs. History), incorporating inline appointment booking, and corrected label date spacing.
*   [DoctorDashboard.jsx](./frontend/src/pages/DoctorDashboard.jsx) & `DoctorDashboard.css` – The clinician workspace. Displays summary metrics (population KPIs), a pie chart of risk severity distributions, average population risk trends, high-risk critical alerts, and a patient cohort correlation scatterplot.
*   [Patients.jsx](./frontend/src/pages/Patients.jsx) & `Patients.css` – The directory roster. Allows doctors and admins to browse patients using table structures, tab selections (All/High/Medium/Low), and name search fields, alongside file uploads and medical logs.
*   [Predictions.jsx](./frontend/src/pages/Predictions.jsx) & `Predictions.css` – The screening form. Allows users to submit vital parameters using a two-column input grid, run the risk model, and display recommendations with circular score percentages.
*   [Scheduling.jsx](./frontend/src/pages/Scheduling.jsx) & `Scheduling.css` – The consultation planner. Renders slots lists with accept/reject handlers, reschedule forms, consult notes logs, and a monthly calendar grid.

---

## 4. List of Completed Implementations

Here is a summary of the features and engineering work implemented in the project so far:

1.  **Full-Stack Scaffolding & Setup:** Installed all libraries, structured the front/back repositories, configured Vite bundlers, and set up dynamic CORS.
2.  **Role-Based Access Control (RBAC):** Established three distinct user roles (`admin`, `doctor`, `patient`). Secured API endpoints using FastAPI dependencies so patients can only access their own data, doctors can only interact with assigned patients, and admins have global access.
3.  **Secure JWT Auth Engine:** Integrated `bcrypt` password hashing and signed tokens. Implemented a session refresh flow using short-lived JWT access tokens and longer-lived refresh tokens stored in secure, HTTP-only cookies.
4.  **Database Integration (SQLite + SQLAlchemy):** Modeled 7 relational tables with cascade constraints, mapping tables to objects to simplify future migration to larger database dialects (like PostgreSQL).
5.  **Pure-Python Machine Learning Service:** Designed, trained, and integrated a `SimpleLogisticRegression` model on the Pima Indians Diabetes Dataset (achieving **77.27% accuracy**). Written entirely in pure Python to eliminate platform dependency issues on host environments.
6.  **Deterministic Referral Engine:** Developed a clinical rule engine evaluating vital parameters (glucose, blood pressure, BMI) and risk scores to propose specialty referrals (Endocrinologist, Cardiologist, Nutritionist, or General Practitioner).
7.  **Diagnostic Report Upload Service:** Implemented file upload handlers restricting file types to PDF and CSV formats, checking file sizes (under 5MB limit), and securing downloads.
8.  **Claude 3.5 Sonnet RAG Chatbot:** Integrated the Anthropic streaming API with Server-Sent Events (SSE). Grounded the LLM using a local TF-IDF vector search over clinical guidelines and application instructions. Implemented safety guardrails and local keyword deflection filters to immediately block and deflect diagnosis or dosage questions before LLM API invocation (refined to prevent false-positives on generic 'do i have' appointment queries).
9.  **ReportLab PDF Export Service:** Developed an endpoint to dynamically compile patient details, medical histories, latest risk assessments, and recommendations into a formatted PDF document, utilizing custom ReportLab styling branded under the 'Healthcare AI' header/footer templates.
10. **Clean Modern Medical Dashboard Redesign (MediAI reference)**: Completely redesigned the visual and UI layer of the application. Replaced the dark glassmorphism styling with a premium light theme (#F4F7FE background, white card components with soft box shadows, #5B6BF8 indigo-blue brand accents, pill badges). Shifted top navigation into a fixed left sidebar with collapsible mobile drawers, added a floating profile settings edit/password change modal, and upgraded Framer Motion enter and layout transition animations on the sign-in form.
11. **Interactive Recharts Visualizations:** Integrated charts displaying vital parameters and population demographics, including a radial gauge, risk distribution pie chart, and historical trend lines.
12. **Automated Testing Suite:** Created 6 dedicated test scripts to verify the functionality of authentication, CRUD operations, predictions, document uploads, chat response generation, and PDF compilation.
13. **Explainable AI (XAI) & Hyperparameter Grid Search:** Balanced model training via minority class oversampling and implemented validation grid search tuning. Added signed log-odds contribution calculations to explain ML classifications, which are persisted in the database and rendered as custom bar charts in the frontend screening UI.
14. **Records & Visits Separation:** Extracted scheduling elements and clinical logs into a dedicated [PatientRecords.jsx](./frontend/src/pages/PatientRecords.jsx) page, optimizing main dashboard clarity.
15. **Interactive Monthly Calendar Grid**: Built a month-by-month calendar view inside [Scheduling.jsx](./frontend/src/pages/Scheduling.jsx) for doctor visit planning, featuring status-colored indicators and detail panels.
16. **Patient Cohort Scatterplot**: Added a Glucose vs. BMI correlation scatterplot inside [DoctorDashboard.jsx](./frontend/src/pages/DoctorDashboard.jsx) color-coded by risk severity tiers.
17. **Health Target Trackers**: Created interactive health goals tracking progress meters using `localStorage` state persistence for patient self-monitoring.
18. **Polished UI Animations (Framer Motion)**: Added `framer-motion` dependency, implementing route transitions, staggered card entrances, radial loading risk gauges, login panel form toggles, sliding alerts, bouncing typing indicator dots, and tactile button hover/tap scaling actions.
19. **Explainable AI (XAI) UI & Chat Temporal Integration:** Rendered the backend ML log-odds contributions visually as custom positive/negative colored horizontal bar charts in [Predictions.jsx](./frontend/src/pages/Predictions.jsx) scaled proportionally. Injected local server time context (`[CURRENT DATE & TIME]`) and dynamically tagged appointments as `[PAST]` or `[UPCOMING]` to prevent chatbot temporal hallucinations. Separated patient records into tabbed chronological lists (Upcoming vs. History) and resolved date text squishing issues.
20. **Admin Panel Features (Backend & Frontend):** Added `/api/admin` routes and a fully featured admin dashboard. *Rationale*: Exposes admin-level oversight (users CRUD, referral assignments, cohort monitoring, stats) while maintaining separate doctor and patient dashboards.
21. **CSRF Token Hardening:** Scoped refresh token cookies to `/api/auth/refresh` only, with `SameSite="Lax"`, `Secure=True`, and `HttpOnly` attributes. Validates origin headers against `ALLOWED_ORIGINS` dynamically. *Rationale*: Protects token refresh cookies from cross-origin CSRF exploits.
22. **HTTP Security Headers Middleware:** Registered CSP, HSTS, X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, and Referrer-Policy filters to FastAPI response cycles. *Rationale*: Guards users against clickjacking, cross-site scripting (XSS), MIME-sniffing, and context leaks.
23. **Request Body Size Limit Middleware:** Restricts incoming content payload sizes to a maximum threshold of 10MB. *Rationale*: Prevents buffer bloats and Denials of Service (DoS) from exceptionally large request payloads.
24. **Server-Side Session Revocation:** Tracked token revocation status using `RevokedToken` tables. Logs token `jti` identifiers on logout, and invalidates old tokens issued before a user's `suspended_at` datetime. *Rationale*: Prevents compromised or logged-out access and refresh tokens from accessing API resources.
25. **Outbound SSRF Protections:** Added validation check (`validate_outbound_url`) ensuring requests to Groq/Mem0 resolve to public, non-private DNS entries on an allowed list. *Rationale*: Prevents server-side request forgery (SSRF) targeting private subnets, cloud metadata links, or unauthorized hosts.
26. **Predictive Health Trend Forecasting:** Built an algorithm using `scikit-learn`'s `LinearRegression` to predict future risk values over a 3-month window from past logs (minimum 4 records). Integrates a dashed projection line on the patient's Recharts trend graph and displays trend statistics, warning alerts, and clinical disclaimers in the patient and doctor portals.
27. **Proactive Health Nudges:** Integrated `APScheduler` in the FastAPI backend to run daily background checks at 09:00 server time. Automatically generates supportive notifications for stale vitals (>30 days), tomorrow's appointments, risk score changes (>=10% increase), and suggested follow-ups (risk >=70% with no upcoming appointment). Renders a floating notification bell dropdown with mark-as-read/dismiss buttons in the patient panel, and includes active nudges in the RAG chatbot's context.
28. **Clear Chat History Option:** Exposed a `DELETE /api/chat/history` endpoint in the backend and a corresponding Redux query mutation in the frontend. Embedded a red trash button in the AI Assistant chatbot header (`ChatWidget.jsx`) that lets patients wipe their entire conversation logs with a single confirmation.
29. **Refined Safety Precheck & Temporal Reasoning:** Upgraded chatbot prompt rules to verify dates temporally (marking past dates as PAST instead of upcoming). Refined safety precheck regex strings to only match clinical targets (e.g. disease queries) so generic questions like *"Do I have any appointments?"* are not blocked. Purged the Redux query cache on logout (`resetApiState`) to prevent patient record leakage.
30. **Premium Visual Assets Integration:** Configured 5 illustration images (`dashboard_illust`, `bot_avatar`, `scheduling_illust`, `report_illust`, `nudges_illust`) to visually enrich key cards, chat widgets, schedules, and document reports.

---

> [!NOTE]
> **Learning Project Disclaimer:** This system is a learning prototype using synthetic data. It is not HIPAA-compliant or intended for actual diagnostic clinical use.
