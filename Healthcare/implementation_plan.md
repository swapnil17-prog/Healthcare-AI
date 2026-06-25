# Patient Risk Prediction System - Implementation Plan

This is a portfolio learning project for a full-stack, AI-powered patient risk prediction system using synthetic data. The development will be done incrementally.

This initial phase (Stage 1) focuses on setting up the project scaffolding, database connections, user/auth models, JWT issuance, password hashing, and role-based access control (RBAC).

## User Review Required

> [!IMPORTANT]
> The database dialect is SQLite for simplicity, but the SQLAlchemy connection is abstracted using `SessionLocal` and dynamic URLs to make it easy to migrate to PostgreSQL.
> Access tokens are short-lived, and a basic refresh token structure (or endpoint) will be scaffolding-ready.
> Passwords will be hashed using `passlib` with `bcrypt`.

## Proposed Changes

We will construct the backend directory structure inside `c:/Users/DELL/Desktop/Healthcare`.

### [Backend Scaffolding & Auth (Stage 1)]

#### [NEW] [requirements.txt](file:///c:/Users/DELL/Desktop/Healthcare/backend/requirements.txt)
Define backend dependencies: `fastapi`, `uvicorn`, `sqlalchemy`, `pydantic`, `python-jose[cryptography]`, `passlib[bcrypt]`, `python-multipart`, `python-dotenv`.

#### [NEW] [database.py](file:///c:/Users/DELL/Desktop/Healthcare/backend/app/database/database.py)
Establish the SQLAlchemy engine, session maker, and base class. Uses an environment variable for connection strings, defaulting to SQLite.

#### [NEW] [models.py](file:///c:/Users/DELL/Desktop/Healthcare/backend/app/models/models.py)
Create initial database models for authentication and audit logs:
- `User` (id, name, email, password_hash, role, created_at)
- `ChatMessage` (id, user_id, role, content, created_at)

#### [NEW] [schemas.py](file:///c:/Users/DELL/Desktop/Healthcare/backend/app/schemas/schemas.py)
Pydantic schemas for request validation:
- `UserCreate` (name, email, password, role)
- `UserLogin` (email, password)
- `Token` (access_token, token_type, role)
- `UserOut` (id, name, email, role, created_at)

#### [NEW] [security.py](file:///c:/Users/DELL/Desktop/Healthcare/backend/app/auth/security.py)
Implement password hashing/verification using `passlib` and JWT token creation/decoding functions using `python-jose`.

#### [NEW] [dependencies.py](file:///c:/Users/DELL/Desktop/Healthcare/backend/app/auth/dependencies.py)
Define security dependencies for FastAPI:
- `get_db`: Yields database sessions.
- `get_current_user`: Validates JWT, fetches user.
- `require_role(role)`: Validates that the current user has the required role (admin/doctor/patient) or list of roles.

#### [NEW] [auth.py](file:///c:/Users/DELL/Desktop/Healthcare/backend/app/api/auth.py)
FastAPI router containing:
- `/api/auth/register` (Registers a new user)
- `/api/auth/login` (Authenticates and returns JWT)
- `/api/auth/me` (Returns current user info, protected)

#### [NEW] [main.py](file:///c:/Users/DELL/Desktop/Healthcare/backend/app/main.py)
FastAPI entrypoint. Registers routers, initializes tables, configures CORS, and has a simple health check `/api/health`.

## Verification Plan

### Automated Tests
- We will verify using a python test script or manual request checks using `curl` / python `requests` directly from the shell.

### Manual Verification
1. Run the FastAPI development server: `uvicorn app.main:app --reload --reload-dir app --host 127.0.0.1 --port 8000`.
2. Send a `POST` request to `/api/auth/register` to register an admin, doctor, and patient.
3. Send a `POST` request to `/api/auth/login` to obtain JWT.
4. Access protected endpoint `/api/auth/me` and verify role constraints.
