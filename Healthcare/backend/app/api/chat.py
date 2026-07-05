import os
import json
import asyncio
import re
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
import anthropic

from app.database.database import get_db, SessionLocal
from app.models.models import ChatMessage, Patient, Prediction, User, MedicalHistory, Appointment
from app.auth.dependencies import get_current_user
from app.core.rate_limiter import limiter
from app.services.vector_store import vector_store

router = APIRouter(prefix="/chat", tags=["chat"])

# Request/Response schemas
class ChatMessageIn(BaseModel):
    message: str

class ChatMessageOut(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True

# Safety pre-check helper function
def pre_check_safety(message: str) -> Optional[str]:
    msg_lower = message.lower()
    
    # 1. Dosage patterns: "dosage", "dose", "how many mg", "how much mg"
    dosage_patterns = [
        r"\bdosage\b", r"\bdose\b", r"\bdoses\b", r"\bdosing\b",
        r"\bhow many mg\b", r"\bhow much mg\b"
    ]
    # 2. Diagnostic/diagnosis patterns: "diagnose", "diagnosis", "do i have", "am i diabetic"
    diagnostic_patterns = [
        r"\bdiagnose\b", r"\bdiagnosis\b", r"\bdo i have\b", r"\bam i diabetic\b"
    ]
    # 3. Emergency patterns: "emergency", "chest pain"
    emergency_patterns = [
        r"\bemergency\b", r"\bchest pain\b"
    ]
    # 4. Prescription patterns: "prescribe", "prescription"
    prescription_patterns = [
        r"\bprescribe\b", r"\bprescription\b"
    ]
    
    all_patterns = dosage_patterns + diagnostic_patterns + emergency_patterns + prescription_patterns
    for pattern in all_patterns:
        if re.search(pattern, msg_lower):
            return (
                "I cannot provide a medical diagnosis, prescribe medications, recommend dosages, "
                "or give emergency medical guidance. Please consult your healthcare provider or primary "
                "doctor for any clinical decisions. If you are experiencing a medical emergency, "
                "please seek immediate emergency services. Would you like me to help you schedule "
                "an appointment with a doctor?"
            )
    return None

# Database lookup helper functions for LLM tools
def get_full_medical_history(patient_id: int, db: Session) -> str:
    print(f"DEBUG TOOL CALL: get_full_medical_history for patient_id={patient_id}")
    records = db.query(MedicalHistory).filter(MedicalHistory.patient_id == patient_id).all()
    if not records:
        return "No medical history records found."
    result = []
    for r in records:
        result.append(f"- Disease: {r.disease}, Diagnosed: {r.diagnosis_date.strftime('%Y-%m-%d') if r.diagnosis_date else 'N/A'}, Medications: {r.medications or 'None'}, Notes: {r.notes or 'None'}")
    return "\n".join(result)

def get_prediction_history(patient_id: int, db: Session) -> str:
    print(f"DEBUG TOOL CALL: get_prediction_history for patient_id={patient_id}")
    records = db.query(Prediction).filter(Prediction.patient_id == patient_id).order_by(Prediction.created_at.desc()).all()
    if not records:
        return "No prediction history records found."
    result = []
    for r in records:
        result.append(f"- Date: {r.created_at.strftime('%Y-%m-%d %H:%M') if r.created_at else 'N/A'}, Model: {r.model_name}, Risk Score: {r.risk_score}%, Result: {r.prediction}, Input Features: {json.dumps(r.input_features)}")
    return "\n".join(result)

def get_appointments(patient_id: int, db: Session) -> str:
    print(f"DEBUG TOOL CALL: get_appointments for patient_id={patient_id}")
    records = db.query(Appointment).filter(Appointment.patient_id == patient_id).order_by(Appointment.scheduled_at.desc()).all()
    if not records:
        return "No appointments found."
    result = []
    now = datetime.now()
    for r in records:
        doctor_name = r.doctor.name if r.doctor else "Unknown Doctor"
        time_label = "[UPCOMING]" if r.scheduled_at >= now else "[PAST]"
        result.append(f"- {time_label} Scheduled: {r.scheduled_at.strftime('%Y-%m-%d %H:%M') if r.scheduled_at else 'N/A'}, Doctor: {doctor_name}, Status: {r.status}, Notes: {r.notes or 'None'}")
    return "\n".join(result)

# Tool schema mapping for Groq / OpenAI-compatible API
GROQ_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_full_medical_history",
            "description": "Fetch the full medical history record of a patient including diseases, diagnosis dates, and medications.",
            "parameters": {
                "type": "object",
                "properties": {
                    "patient_id": {
                        "type": "integer",
                        "description": "The unique patient profile database ID"
                    }
                },
                "required": ["patient_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_prediction_history",
            "description": "Fetch the patient's historical risk predictions and ML models inputs/outputs.",
            "parameters": {
                "type": "object",
                "properties": {
                    "patient_id": {
                        "type": "integer",
                        "description": "The unique patient profile database ID"
                    }
                },
                "required": ["patient_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_appointments",
            "description": "Fetch the patient's booked/upcoming doctor appointments.",
            "parameters": {
                "type": "object",
                "properties": {
                    "patient_id": {
                        "type": "integer",
                        "description": "The unique patient profile database ID"
                    }
                },
                "required": ["patient_id"]
            }
        }
    }
]

@router.get("/history", response_model=List[ChatMessageOut])
def read_chat_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Fetch recent 30 messages for this user, ordered by creation time ascending
    history = db.query(ChatMessage)\
        .filter(ChatMessage.user_id == current_user.id)\
        .order_by(ChatMessage.created_at.asc())\
        .limit(30)\
        .all()
    return history

@router.post("", response_model=ChatMessageOut)
@limiter.limit("5/minute")
def send_chat_message(
    chat_in: ChatMessageIn,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_msg_text = chat_in.message.strip()
    if not user_msg_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message content cannot be empty"
        )
        
    # 1. Save user's message to DB
    user_message = ChatMessage(
        user_id=current_user.id,
        role="user",
        content=user_msg_text
    )
    db.add(user_message)
    db.commit()
    db.refresh(user_message)
    
    # 2. Safety Pre-check
    safety_deflection = pre_check_safety(user_msg_text)
    if safety_deflection:
        assistant_message = ChatMessage(
            user_id=current_user.id,
            role="assistant",
            content=safety_deflection
        )
        db.add(assistant_message)
        db.commit()
        db.refresh(assistant_message)
        return assistant_message
        
    # 3. Retrieve patient details
    patient_id = None
    patient_context = ""
    if current_user.role == "patient":
        patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
        if patient:
            patient_id = patient.id
            patient_context = (
                f"\n[CURRENT PATIENT PROFILE INFO]:\n"
                f"- Name: {current_user.name}\n"
                f"- Patient Profile ID: {patient_id}\n"
                f"- Age: {patient.age or 'N/A'} years\n"
                f"- Gender: {patient.gender or 'N/A'}\n"
                f"- Height: {patient.height or 'N/A'} cm\n"
                f"- Weight: {patient.weight or 'N/A'} kg\n"
                f"- Blood Group: {patient.blood_group or 'N/A'}\n"
            )

    # 4. Retrieve relevant guidelines via embeddings RAG (with threshold 0.3)
    guidelines_matches = vector_store.search(user_msg_text, top_n=2)
    guidelines_context = ""
    if guidelines_matches:
        guidelines_context = "\n[RELEVANT CLINICAL GUIDELINES & APP INFORMATION]:\n"
        for doc in guidelines_matches:
            guidelines_context += f"- Source: {doc['title']}\n  Content: {doc['content']}\n"

    # 5. Build System Prompt with Clinical Guardrails
    system_prompt = (
        "You are an AI assistant for a learning/portfolio healthcare application.\n\n"
        "IMPORTANT CLINICAL GUARDRAILS:\n"
        "1. You are NOT a doctor. You must NOT provide medical advice, medical diagnoses, "
        "or treatment recommendations. Always clearly state these limitations and "
        "strongly encourage the user to consult their healthcare provider / primary doctor for any clinical decisions.\n"
        "2. You MUST NOT diagnose a condition, recommend a specific medication or dosage, or give emergency medical guidance. "
        "Instead, respond with a clear redirect advising them to consult their doctor, and optionally offer to help book an appointment.\n"
        "3. You MUST state the disclaimer ('I am not a doctor' and 'I cannot provide medical advice') ONLY ONCE at the very beginning of the conversation. Never repeat, copy, or prepend this disclaimer in any subsequent messages, follow-up answers, or subsequent turns within the same chat session. Keep all subsequent responses natural, friendly, and direct without repeating medical warnings.\n\n"
        "WHAT YOU WILL ANSWER:\n"
        "1. General health education and wellness info (framed as general info, not personalized medical orders).\n"
        "2. Explaining the patient's own data, trends, and risk numbers (e.g. what is glucose, BMI, and what do their numbers mean based on standard clinical thresholds).\n"
        "3. App usage instructions and FAQ (e.g. how to upload a report, view history, or book an appointment).\n\n"
        "You have tools to fetch patient medical history, prediction history, and appointments. Call them when needed. "
        "Always use the current user's Patient Profile ID to call these tools.\n"
    )
    # Inject current date and time for temporal awareness
    system_prompt += f"\n[CURRENT DATE & TIME]:\n- {datetime.now().strftime('%A, %B %d, %Y, %I:%M %p')}\n"
    
    if patient_context:
        system_prompt += patient_context
    if guidelines_context:
        system_prompt += guidelines_context

    # 6. Load recent history for context
    history = db.query(ChatMessage)\
        .filter(ChatMessage.user_id == current_user.id)\
        .order_by(ChatMessage.created_at.asc())\
        .limit(10)\
        .all()
        
    messages_payload = []
    for m in history:
        role = "user" if m.role == "user" else "assistant"
        messages_payload.append({"role": role, "content": m.content})
        
    if not messages_payload or messages_payload[-1]["content"] != user_msg_text:
        messages_payload.append({"role": "user", "content": user_msg_text})

    # 7. Call LLM or fallback
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    groq_key = os.getenv("GROQ_API_KEY")
    assistant_text = ""
    
    if groq_key:
        try:
            import requests
            model_name = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
            headers = {
                "Authorization": f"Bearer {groq_key}",
                "Content-Type": "application/json"
            }
            
            # OpenAI function calling loop
            current_messages = [{"role": "system", "content": system_prompt}] + messages_payload
            has_tool_calls = True
            
            while has_tool_calls:
                payload = {
                    "model": model_name,
                    "messages": current_messages,
                    "temperature": 0.2,
                    "max_tokens": 1000,
                    "tools": GROQ_TOOLS
                }
                res = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
                if res.status_code == 200:
                    res_data = res.json()
                    choice = res_data["choices"][0]
                    msg = choice["message"]
                    
                    if "tool_calls" in msg and msg["tool_calls"]:
                        current_messages.append(msg)
                        
                        for tc in msg["tool_calls"]:
                            tc_id = tc["id"]
                            func_name = tc["function"]["name"]
                            func_args = json.loads(tc["function"]["arguments"])
                            p_id = func_args.get("patient_id")
                            
                            # Execute appropriate tool
                            if func_name == "get_full_medical_history":
                                tool_result = get_full_medical_history(p_id, db)
                            elif func_name == "get_prediction_history":
                                tool_result = get_prediction_history(p_id, db)
                            elif func_name == "get_appointments":
                                tool_result = get_appointments(p_id, db)
                            else:
                                tool_result = f"Unknown function: {func_name}"
                                
                            current_messages.append({
                                "role": "tool",
                                "tool_call_id": tc_id,
                                "name": func_name,
                                "content": tool_result
                            })
                    else:
                        assistant_text = msg.get("content", "")
                        has_tool_calls = False
                else:
                    assistant_text = f"[System Warning: Failed to connect to Groq API (Status {res.status_code}): {res.text}. Falling back to mock assistant response.]\n\n"
                    has_tool_calls = False
        except Exception as e:
            assistant_text = f"[System Warning: Failed to connect to Groq API: {e}. Falling back to mock assistant response.]\n\n"
            
    elif anthropic_key:
        try:
            client = anthropic.Anthropic(api_key=anthropic_key)
            model_name = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20240620")
            response = client.messages.create(
                model=model_name,
                system=system_prompt,
                messages=messages_payload,
                max_tokens=1000
            )
            assistant_text = response.content[0].text
        except Exception as e:
            assistant_text = f"[System Warning: Failed to connect to Claude API: {e}. Falling back to mock assistant response.]\n\n"
            
    # Mock fallback response
    if not assistant_text or "[System Warning" in assistant_text:
        assistant_text += generate_mock_response(user_msg_text, patient_id, db, current_user.name)

    # 8. Save assistant's response to DB
    assistant_message = ChatMessage(
        user_id=current_user.id,
        role="assistant",
        content=assistant_text
    )
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)
    
    return assistant_message


@router.post("/stream")
@limiter.limit("5/minute")
def send_chat_message_stream(
    chat_in: ChatMessageIn,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_msg_text = chat_in.message.strip()
    if not user_msg_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message content cannot be empty"
        )
        
    # 1. Save user's message to DB
    user_message = ChatMessage(
        user_id=current_user.id,
        role="user",
        content=user_msg_text
    )
    db.add(user_message)
    db.commit()
    db.refresh(user_message)
    
    # 2. Safety Pre-check
    safety_deflection = pre_check_safety(user_msg_text)
    if safety_deflection:
        async def sse_generator_safety():
            words = safety_deflection.split(" ")
            full_txt = ""
            for i, word in enumerate(words):
                spaced_word = word + (" " if i < len(words) - 1 else "")
                full_txt += spaced_word
                yield f"data: {json.dumps({'text': spaced_word})}\n\n"
                await asyncio.sleep(0.02)
                
            new_db = SessionLocal()
            try:
                assistant_message = ChatMessage(
                    user_id=current_user.id,
                    role="assistant",
                    content=full_txt
                )
                new_db.add(assistant_message)
                new_db.commit()
            finally:
                new_db.close()
        return StreamingResponse(sse_generator_safety(), media_type="text/event-stream")

    # 3. Retrieve patient details
    patient_id = None
    patient_context = ""
    if current_user.role == "patient":
        patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
        if patient:
            patient_id = patient.id
            patient_context = (
                f"\n[CURRENT PATIENT PROFILE INFO]:\n"
                f"- Name: {current_user.name}\n"
                f"- Patient Profile ID: {patient_id}\n"
                f"- Age: {patient.age or 'N/A'} years\n"
                f"- Gender: {patient.gender or 'N/A'}\n"
                f"- Height: {patient.height or 'N/A'} cm\n"
                f"- Weight: {patient.weight or 'N/A'} kg\n"
                f"- Blood Group: {patient.blood_group or 'N/A'}\n"
            )

    # 4. Retrieve relevant guidelines via embeddings RAG
    guidelines_matches = vector_store.search(user_msg_text, top_n=2)
    guidelines_context = ""
    if guidelines_matches:
        guidelines_context = "\n[RELEVANT CLINICAL GUIDELINES & APP INFORMATION]:\n"
        for doc in guidelines_matches:
            guidelines_context += f"- Source: {doc['title']}\n  Content: {doc['content']}\n"

    # 5. Build System Prompt
    system_prompt = (
        "You are an AI assistant for a learning/portfolio healthcare application.\n\n"
        "IMPORTANT CLINICAL GUARDRAILS:\n"
        "1. You are NOT a doctor. You must NOT provide medical advice, medical diagnoses, "
        "or treatment recommendations. Always clearly state these limitations and "
        "strongly encourage the user to consult their healthcare provider / primary doctor for any clinical decisions.\n"
        "2. You MUST NOT diagnose a condition, recommend a specific medication or dosage, or give emergency medical guidance. "
        "Instead, respond with a clear redirect advising them to consult their doctor, and optionally offer to help book an appointment.\n"
        "3. You MUST state the disclaimer ('I am not a doctor' and 'I cannot provide medical advice') ONLY ONCE at the very beginning of the conversation. Never repeat, copy, or prepend this disclaimer in any subsequent messages, follow-up answers, or subsequent turns within the same chat session. Keep all subsequent responses natural, friendly, and direct without repeating medical warnings.\n\n"
        "WHAT YOU WILL ANSWER:\n"
        "1. General health education and wellness info (framed as general info, not personalized medical orders).\n"
        "2. Explaining the patient's own data, trends, and risk numbers (e.g. what is glucose, BMI, and what do their numbers mean based on standard clinical thresholds).\n"
        "3. App usage instructions and FAQ (e.g. how to upload a report, view history, or book an appointment).\n\n"
        "You have tools to fetch patient medical history, prediction history, and appointments. Call them when needed. "
        "Always use the current user's Patient Profile ID to call these tools.\n"
    )
    # Inject current date and time for temporal awareness
    system_prompt += f"\n[CURRENT DATE & TIME]:\n- {datetime.now().strftime('%A, %B %d, %Y, %I:%M %p')}\n"
    
    if patient_context:
        system_prompt += patient_context
    if guidelines_context:
        system_prompt += guidelines_context

    # 6. Load recent history for context
    history = db.query(ChatMessage)\
        .filter(ChatMessage.user_id == current_user.id)\
        .order_by(ChatMessage.created_at.asc())\
        .limit(10)\
        .all()
        
    messages_payload = []
    for m in history:
        role = "user" if m.role == "user" else "assistant"
        messages_payload.append({"role": role, "content": m.content})
        
    if not messages_payload or messages_payload[-1]["content"] != user_msg_text:
        messages_payload.append({"role": "user", "content": user_msg_text})

    # 7. Asynchronous generator for StreamingResponse
    async def sse_generator():
        anthropic_key = os.getenv("ANTHROPIC_API_KEY")
        groq_key = os.getenv("GROQ_API_KEY")
        full_response_text = ""
        
        db_session = SessionLocal()
        try:
            if groq_key:
                try:
                    import requests
                    model_name = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
                    headers = {
                        "Authorization": f"Bearer {groq_key}",
                        "Content-Type": "application/json"
                    }
                    
                    current_messages = [{"role": "system", "content": system_prompt}] + messages_payload
                    has_tool_calls = True
                    
                    while has_tool_calls:
                        payload = {
                            "model": model_name,
                            "messages": current_messages,
                            "temperature": 0.2,
                            "max_tokens": 1000,
                            "tools": GROQ_TOOLS
                        }
                        
                        loop = asyncio.get_event_loop()
                        def make_request():
                            return requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
                        
                        res = await loop.run_in_executor(None, make_request)
                        
                        if res.status_code == 200:
                            res_data = res.json()
                            choice = res_data["choices"][0]
                            msg = choice["message"]
                            
                            if "tool_calls" in msg and msg["tool_calls"]:
                                current_messages.append(msg)
                                for tc in msg["tool_calls"]:
                                    tc_id = tc["id"]
                                    func_name = tc["function"]["name"]
                                    func_args = json.loads(tc["function"]["arguments"])
                                    p_id = func_args.get("patient_id")
                                    
                                    if func_name == "get_full_medical_history":
                                        tool_result = get_full_medical_history(p_id, db_session)
                                    elif func_name == "get_prediction_history":
                                        tool_result = get_prediction_history(p_id, db_session)
                                    elif func_name == "get_appointments":
                                        tool_result = get_appointments(p_id, db_session)
                                    else:
                                        tool_result = f"Unknown function: {func_name}"
                                        
                                    current_messages.append({
                                        "role": "tool",
                                        "tool_call_id": tc_id,
                                        "name": func_name,
                                        "content": tool_result
                                    })
                            else:
                                final_content = msg.get("content", "")
                                # Stream final text
                                words = final_content.split(" ")
                                for i, word in enumerate(words):
                                    spaced_word = word + (" " if i < len(words) - 1 else "")
                                    full_response_text += spaced_word
                                    yield f"data: {json.dumps({'text': spaced_word})}\n\n"
                                    await asyncio.sleep(0.01)
                                has_tool_calls = False
                        else:
                            err_warn = f"[System Warning: Failed to connect to Groq API (Status {res.status_code}): {res.text}. Falling back to mock assistant response.]\n\n"
                            full_response_text += err_warn
                            yield f"data: {json.dumps({'text': err_warn})}\n\n"
                            has_tool_calls = False
                except Exception as e:
                    err_warn = f"[System Warning: Failed to connect to Groq API: {e}. Falling back to mock assistant response.]\n\n"
                    full_response_text += err_warn
                    yield f"data: {json.dumps({'text': err_warn})}\n\n"
                    
            elif anthropic_key:
                try:
                    client = anthropic.Anthropic(api_key=anthropic_key)
                    model_name = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20240620")
                    
                    with client.messages.stream(
                        model=model_name,
                        system=system_prompt,
                        messages=messages_payload,
                        max_tokens=1000
                    ) as stream:
                        for text in stream.text_stream:
                            full_response_text += text
                            yield f"data: {json.dumps({'text': text})}\n\n"
                            await asyncio.sleep(0.01)
                except Exception as e:
                    err_warn = f"[System Warning: Failed to connect to Claude API: {e}. Falling back to mock assistant response.]\n\n"
                    full_response_text += err_warn
                    yield f"data: {json.dumps({'text': err_warn})}\n\n"
                    
            # Mock fallback response
            if not groq_key and not anthropic_key or "[System Warning" in full_response_text:
                mock_text = generate_mock_response(user_msg_text, patient_id, db_session, current_user.name)
                words = mock_text.split(" ")
                for i, word in enumerate(words):
                    spaced_word = word + (" " if i < len(words) - 1 else "")
                    full_response_text += spaced_word
                    yield f"data: {json.dumps({'text': spaced_word})}\n\n"
                    await asyncio.sleep(0.02)
                    
            # Save assistant message to database
            assistant_message = ChatMessage(
                user_id=current_user.id,
                role="assistant",
                content=full_response_text
            )
            db_session.add(assistant_message)
            db_session.commit()
        finally:
            db_session.close()

    return StreamingResponse(sse_generator(), media_type="text/event-stream")


def generate_mock_response(user_message: str, patient_id: Optional[int], db: Session, user_name: str) -> str:
    msg_lower = user_message.lower()
    
    # Determine if query mentions medical metrics or patient record histories
    medical_keywords = ["history", "prediction", "risk", "glucose", "insulin", "pressure", "bp", "bmi", "medical", "disease", "treatment"]
    is_medical = any(kw in msg_lower for kw in medical_keywords)
    
    disclaimer = "*(Please note: I am not a doctor and I cannot provide medical advice. Consult your physician for any clinical decisions.)*\n\n"
    
    response = ""
    if is_medical:
        response += disclaimer
        
    # Check for specific queries
    if "medical history" in msg_lower or "history" in msg_lower:
        if patient_id:
            history = get_full_medical_history(patient_id, db)
            response += f"Here is your medical history:\n{history}"
        else:
            response += "I couldn't find a patient profile associated with your account to fetch your medical history."
    elif "prediction" in msg_lower or "risk" in msg_lower or "glucose" in msg_lower:
        if patient_id:
            predictions = get_prediction_history(patient_id, db)
            response += f"Here is your prediction history:\n{predictions}"
        else:
            response += "I couldn't find a patient profile associated with your account to retrieve your risk prediction history."
    elif "appointment" in msg_lower or "schedule" in msg_lower or "book" in msg_lower:
        if patient_id:
            appts = get_appointments(patient_id, db)
            response += f"Here is your appointment history:\n{appts}"
        else:
            response += "I couldn't find a patient profile associated with your account to retrieve your appointments."
    elif "upload" in msg_lower or "report" in msg_lower:
        response += "To upload a lab report: Go to your Patients tab or patient profile, locate the 'Upload Diagnostics Report' card. Enter the report type, select a PDF or CSV file (under 5MB), and click 'Upload Document'."
    else:
        response += f"Hello {user_name}! How can I help you today? I can answer general app questions (like how to upload reports or schedule appointments) or explain the medical indicators from your risk prediction results in plain language."
        
    return response
