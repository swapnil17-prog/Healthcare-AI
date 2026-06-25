# Patients & Medical History CRUD - Implementation Plan

This phase implements CRUD endpoints for Patients (Stage 2) and Medical Histories (Stage 3) with role-based access control (RBAC).

## User Review Required

> [!IMPORTANT]
> **Doctor Assignment Logic**: A patient is considered "assigned" to a doctor if there is at least one appointment between that patient and the doctor in the `appointments` table.
> - Doctors can list and view only their assigned patients.
> - Patients can only access and update their own patient record.
> - Admins can perform all actions on all patient records.

## Proposed Changes

We will create two new API routers in `backend/app/api/` and register them in `backend/app/main.py`.

### [Patients Resource (Stage 2)]

#### [NEW] [patients.py](file:///c:/Users/DELL/Desktop/Healthcare/backend/app/api/patients.py)
FastAPI router containing:
- `GET /api/patients`: Lists patients.
  - Admin: Returns all patients in the system.
  - Doctor: Returns patients who have appointments with this doctor.
  - Patient: Returns only the patient's own record.
- `GET /api/patients/{id}`: Returns details of a specific patient.
  - Access control: User must be admin, the patient themselves, or a doctor with a scheduled/past appointment with this patient.
- `PUT /api/patients/{id}`: Updates a patient record (age, gender, height, weight, blood_group, phone, address).
  - Access control: User must be admin, or the patient themselves.

#### [NEW] [patients.py (schema)](file:///c:/Users/DELL/Desktop/Healthcare/backend/app/schemas/patients.py)
Pydantic schemas for patient validation:
- `PatientUpdate`: Input fields to update a profile.
- `PatientOut`: Standard patient output (includes the related user's name/email).

### [Medical History Resource (Stage 3)]

#### [NEW] [medical_history.py](file:///c:/Users/DELL/Desktop/Healthcare/backend/app/api/medical_history.py)
FastAPI router containing:
- `GET /api/patients/{patient_id}/medical-history`: Lists medical history entries for a patient.
  - Access control: Admin, the patient themselves, or a doctor assigned to this patient.
- `POST /api/patients/{patient_id}/medical-history`: Creates a medical history entry.
  - Access control: Admin or an assigned doctor. Patients cannot write/insert their own medical history.
- `PUT /api/medical-history/{id}`: Updates a medical history entry.
  - Access control: Admin or the doctor who created/is assigned.
- `DELETE /api/medical-history/{id}`: Deletes a medical history entry.
  - Access control: Admin only.

#### [NEW] [medical_history.py (schema)](file:///c:/Users/DELL/Desktop/Healthcare/backend/app/schemas/medical_history.py)
Pydantic schemas:
- `MedicalHistoryCreate`: Input for creating an entry (disease, diagnosis_date, medications, notes).
- `MedicalHistoryUpdate`: Input for updating an entry.
- `MedicalHistoryOut`: Output schema.

## Verification Plan

### Automated Tests
- We will write a test script `backend/test_crud.py` to automate verify:
  1. Creating appointment between doctor & patient (to assign the patient).
  2. Registering an unassigned patient.
  3. Validating that the doctor can retrieve the assigned patient but NOT the unassigned patient.
  4. Validating that the patient can only retrieve their own record.
  5. Creating and reading medical history entries under the appropriate role permissions.

### Manual Verification
1. Run `test_crud.py` to confirm all validation assertions pass.
