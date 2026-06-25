import os
import re
import numpy as np

# Sample clinical guidelines and application instructions documents to index (used as fallback)
GUIDELINES_DOCUMENTS = [
    {
        "id": "glucose_guidelines",
        "title": "American Diabetes Association (ADA) Fasting Glucose Guidelines",
        "content": (
            "Fasting blood glucose levels: A level of 99 mg/dL or lower is normal. "
            "A level between 100 and 125 mg/dL indicates prediabetes (impaired fasting glucose, reflecting insulin resistance). "
            "A fasting glucose level of 126 mg/dL or higher on two separate tests indicates diabetes. "
            "During an Oral Glucose Tolerance Test (OGTT), 140 to 199 mg/dL indicates prediabetes, while 200 mg/dL or higher indicates diabetes."
        )
    },
    {
        "id": "blood_pressure_guidelines",
        "title": "AHA/ACC Hypertension Guidelines",
        "content": (
            "Blood pressure stages: Normal blood pressure is less than 120 mm Hg systolic and less than 80 mm Hg diastolic. "
            "Elevated blood pressure is 120-129 systolic and less than 80 diastolic. "
            "Stage 1 Hypertension is defined as 130-139 systolic or 80-89 diastolic. "
            "Stage 2 Hypertension is defined as 140 or higher systolic or 90 or higher diastolic. "
            "A hypertensive crisis is higher than 180 systolic and/or higher than 120 diastolic, requiring immediate emergency medical attention."
        )
    },
    {
        "id": "bmi_categories",
        "title": "WHO Body Mass Index (BMI) Classifications",
        "content": (
            "Body Mass Index (BMI) categories: Underweight is a BMI less than 18.5. "
            "Normal weight is a BMI between 18.5 and 24.9. "
            "Overweight is a BMI between 25.0 and 29.9. "
            "Obesity is classified as a BMI of 30.0 or higher. "
            "Obesity increases insulin resistance and is a primary risk factor for type 2 diabetes and cardiovascular complications."
        )
    },
    {
        "id": "diabetes_management",
        "title": "Diabetic Care, Diet, and Lifestyle Management",
        "content": (
            "Diabetes lifestyle management: Eat a balanced diet rich in fiber, complex carbohydrates (whole grains, vegetables), "
            "lean proteins, and healthy fats while minimizing simple sugars and refined grains. "
            "Aim for at least 150 minutes per week of moderate-intensity aerobic physical activity (e.g., brisk walking, swimming). "
            "Always consult your primary care doctor for personalized medication guidance, glucose monitoring frequencies, and treatment plans."
        )
    },
    {
        "id": "app_usage_upload",
        "title": "How to Upload Lab Diagnostics Reports",
        "content": (
            "Uploading lab reports: Click on the Patients tab in the navigation bar to open the patient roster. "
            "Select the patient profile, then locate the 'Upload Diagnostics Report' card. "
            "Enter the report type (e.g., Blood Test), select a PDF or CSV file from your device, and click 'Upload Document'. "
            "The file size must be less than 5MB."
        )
    },
    {
        "id": "app_usage_schedule",
        "title": "How to Schedule Doctor Appointments",
        "content": (
            "Scheduling appointments: From the Patient Dashboard, locate the 'Upcoming Appointments' card "
            "and click the '+ Book New' button. Select the doctor, choose the desired date and time, "
            "add any optional notes (such as the purpose of the visit), and click 'Schedule'."
        )
    },
    {
        "id": "app_usage_pdf",
        "title": "How to Export and Download PDF Reports",
        "content": (
            "Downloading summary reports: From the patient dashboard or patient profile details screen, "
            "click the 'Export Clinical PDF' or 'Download PDF Summary' button at the top of the screen. "
            "This compiles all demographic information, medical history log entries, recent risk scores, "
            "and referral suggestions into a single printable PDF file."
        )
    }
]

def load_documents_from_kb(kb_dir: str) -> list:
    documents = []
    if not os.path.exists(kb_dir):
        return documents
        
    for filename in os.listdir(kb_dir):
        if filename.endswith(".md") or filename.endswith(".txt"):
            filepath = os.path.join(kb_dir, filename)
            doc_id = os.path.splitext(filename)[0]
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    content = f.read().strip()
                
                # Default title based on filename
                title = doc_id.replace("_", " ").title()
                # Extract first line if it's a markdown header
                match = re.match(r"^#\s+(.+)$", content)
                if match:
                    title = match.group(1).strip()
                
                documents.append({
                    "id": doc_id,
                    "title": title,
                    "content": content
                })
            except Exception as e:
                print(f"Error reading file {filename}: {e}")
    return documents

def chunk_document(doc: dict, chunk_size: int = 300, overlap: int = 50) -> list:
    content = doc["content"]
    words = content.split()
    if len(words) <= chunk_size:
        return [doc]
    
    chunks = []
    step = chunk_size - overlap
    for i in range(0, len(words), step):
        chunk_words = words[i:i + chunk_size]
        # If the chunk has fewer than overlap words and we already have chunks, skip it to avoid tiny leftovers
        if len(chunk_words) < 50 and len(chunks) > 0:
            break
        chunk_content = " ".join(chunk_words)
        chunks.append({
            "id": f"{doc['id']}_{len(chunks)}",
            "title": doc["title"],
            "content": chunk_content
        })
    return chunks

class GuidelineVectorStore:
    def __init__(self):
        from sentence_transformers import SentenceTransformer
        self.model = SentenceTransformer("all-MiniLM-L6-v2")
        
        # Determine knowledge base directory
        self.kb_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "data",
            "knowledge_base"
        )
        
        # Load documents from files
        raw_docs = load_documents_from_kb(self.kb_dir)
        
        # Chunk all documents
        self.documents = []
        for doc in raw_docs:
            self.documents.extend(chunk_document(doc))
            
        # Fallback to default GUIDELINES_DOCUMENTS if none found
        if not self.documents:
            for doc in GUIDELINES_DOCUMENTS:
                self.documents.extend(chunk_document(doc))
        
        # Compute embeddings (normalize so cosine similarity is simple dot product)
        self.corpus = [doc["content"] for doc in self.documents]
        if self.corpus:
            self.embeddings = self.model.encode(self.corpus, normalize_embeddings=True, convert_to_numpy=True)
        else:
            self.embeddings = np.empty((0, 384))

    def search(self, query: str, top_n: int = 2, threshold: float = 0.3) -> list:
        if not query.strip() or len(self.documents) == 0:
            return []
            
        # Encode query (normalized)
        query_embedding = self.model.encode([query], normalize_embeddings=True, convert_to_numpy=True)[0]
        
        # Compute cosine similarities via dot product
        similarities = np.dot(self.embeddings, query_embedding)
        
        # Sort document indices by similarity score descending
        top_indices = np.argsort(similarities)[::-1]
        
        results = []
        for idx in top_indices:
            score = float(similarities[idx])
            # Only return chunks that meet the threshold requirement
            if score < threshold:
                break
            results.append({
                "id": self.documents[idx]["id"],
                "title": self.documents[idx]["title"],
                "content": self.documents[idx]["content"],
                "score": round(score, 4)
            })
            if len(results) >= top_n:
                break
        return results

# Central singleton instance
vector_store = GuidelineVectorStore()
