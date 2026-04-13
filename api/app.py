"""
VabGen-Rx — Offline Mode FastAPI Application
Clinical Drug Safety — No Internet Required

Stack:
    Gemma 3 4B via Ollama     — local AI inference
    SQLite Vector Search      — local drug interaction knowledge base
    InterSystems IRIS FHIR    — local patient data (Docker)
    SQLite Audit Log          — HIPAA-compliant local audit

Zero dependencies on:
    Azure OpenAI, Azure SQL, Azure Key Vault,
    PubMed API, FDA API, or any internet connectivity.

Setup:
    1. Install Ollama: https://ollama.com
    2. Pull model:     ollama pull gemma3:4b
    3. Start IRIS:     cd Dockerfhir && docker compose up -d
    4. Setup vectors:  python scripts/setup_vectors.py
    5. Load patients:  python scripts/load_demo_patient.py
    6. Start server:   python -m uvicorn api.app:app --port 8000

Cost: $0 (Gemma Apache 2.0, IRIS Community Edition, all open source)
"""

import os
import sys
import tempfile
import sqlite3
import json
import numpy as np

from pathlib import Path
from fastapi  import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Offline module imports ────────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from offline.pipeline import offline_analyze, translate_fields
from offline.ingest   import ingest_file, get_database_stats
from services.fhir_service import get_patient_data as fhir_get_patient

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title       = "VabGen-Rx Offline",
    description = (
        "Clinical Drug Safety Platform — Offline Mode. "
        "Powered by Gemma 3 4B + IRIS Vector Search. "
        "No internet required."
    ),
    version = "1.0.0"
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["http://localhost:5173", "http://localhost:3000"],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ── Request models ────────────────────────────────────────────────────────────

class OfflineAnalysisRequest(BaseModel):
    new_drug:      str
    existing_meds: list
    age:           int   = 45
    sex:           str   = "unknown"
    egfr:          float = None
    potassium:     float = None
    conditions:    list  = []
    patient_no:    str   = ""
    language:      str   = ""


class OfflinePatientAnalyzeRequest(BaseModel):
    patient_no: str
    new_drug:   str
    language:   str = ""


class OfflineSearchRequest(BaseModel):
    query: str
    top_k: int = 5


class TranslateCounsellingRequest(BaseModel):
    counselling: list
    language:    str


# ── Constants ─────────────────────────────────────────────────────────────────
DB_PATH = Path("database/vabgen_vectors.db")


# ── Core routes ───────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "status":   "VabGen-Rx Offline is running",
        "mode":     "offline",
        "ai_model": "Gemma 3 4B (local via Ollama)",
        "vector_db": "SQLite (local)",
        "fhir":     "InterSystems IRIS (local Docker)",
        "cost":     "$0",
        "internet": "not required",
        "version":  "1.0.0",
    }


@app.get("/health")
def health():
    """Check if all offline components are ready."""
    ollama_ok  = False
    vectors_ok = DB_PATH.exists()
    fhir_ok    = False

    # Check Ollama
    try:
        import requests
        r = requests.get(
            os.getenv("OLLAMA_URL", "http://localhost:11434"),
            timeout=2
        )
        ollama_ok = r.status_code == 200
    except Exception:
        pass

    # Check FHIR
    try:
        import requests
        fhir_base = os.getenv("FHIR_BASE_URL", "http://localhost:32783/csp/healthshare/demo/fhir/r4")
        r = requests.get(f"{fhir_base}/metadata", auth=("_SYSTEM", "ISCDEMO"), timeout=2)
        fhir_ok = r.status_code == 200
    except Exception:
        pass

    vector_count = 0
    if vectors_ok:
        try:
            conn   = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM drug_interaction_vectors")
            vector_count = cursor.fetchone()[0]
            conn.close()
        except Exception:
            pass

    return {
        "status":        "ready" if (ollama_ok and vectors_ok) else "degraded",
        "ollama":        "✅ running" if ollama_ok  else "❌ not running — start with: ollama serve",
        "vector_db":     f"✅ {vector_count} pairs" if vectors_ok else "❌ missing — run: python scripts/setup_vectors.py",
        "fhir_server":   "✅ running" if fhir_ok else "⚠️  not running — start with: docker compose up -d",
        "mode":          "offline",
    }


# ── FHIR endpoint ─────────────────────────────────────────────────────────────

@app.get("/fhir/patient/{patient_id}")
def fhir_patient(patient_id: str):
    """Load patient data from local InterSystems IRIS FHIR server."""
    try:
        data = fhir_get_patient(patient_id)
        return data
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"FHIR fetch failed: {str(e)}")


# ── Offline analysis endpoints ────────────────────────────────────────────────

@app.post("/offline/analyze")
def offline_analyze_endpoint(req: OfflineAnalysisRequest):
    """
    Offline drug interaction analysis.
    Uses local SQLite vector search + Gemma 3 4B via Ollama.
    No internet required.
    """
    try:
        result = offline_analyze(
            new_drug      = req.new_drug,
            existing_meds = req.existing_meds,
            age           = req.age,
            sex           = req.sex,
            egfr          = req.egfr,
            potassium     = req.potassium,
            conditions    = req.conditions,
            patient_no    = req.patient_no,
            language      = req.language,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Offline analysis failed: {str(e)}")


@app.post("/offline/patient-analyze")
def offline_patient_analyze(req: OfflinePatientAnalyzeRequest):
    """
    Load patient from local IRIS FHIR server + run offline analysis.
    Doctor types only the new drug — everything else comes from FHIR.
    """
    try:
        patient = fhir_get_patient(req.patient_no)
        if not patient.get("fhir_found"):
            raise HTTPException(
                status_code = 404,
                detail      = f"Patient {req.patient_no} not found in local FHIR server"
            )
        result = offline_analyze(
            new_drug      = req.new_drug,
            existing_meds = patient["medications"],
            egfr          = patient["lab_values"].get("egfr"),
            potassium     = patient["lab_values"].get("potassium"),
            conditions    = patient["conditions"],
            patient_no    = req.patient_no,
            language      = req.language,
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/offline/translate-counselling")
def offline_translate_counselling(req: TranslateCounsellingRequest):
    """
    Translate counselling points to patient's language.
    Uses Gemma 3 4B locally — supports 140+ languages.
    Drug names are always kept in English.
    """
    try:
        translated = translate_fields(
            req.counselling,
            req.language,
            ["title", "instruction"]
        )
        return {"translated_counselling": translated, "language": req.language}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Knowledge base endpoints ──────────────────────────────────────────────────

@app.post("/offline/ingest")
async def offline_ingest(file: UploadFile = File(...)):
    """
    Upload a PDF or TXT file and add it to the local vector knowledge base.
    Supports FDA drug labels, clinical guidelines, PubMed abstracts.
    """
    try:
        suffix = "." + file.filename.split(".")[-1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        result = ingest_file(tmp_path, source_name=file.filename)
        os.unlink(tmp_path)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/offline/vector-stats")
def offline_vector_stats():
    """Get stats about the local vector knowledge base."""
    try:
        return get_database_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/offline/drug-pairs")
def offline_drug_pairs():
    """Return all drug pair names from the vector database."""
    try:
        if not DB_PATH.exists():
            return {"drug_pairs": [], "count": 0}
        conn   = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT drug_pair FROM drug_interaction_vectors")
        pairs = [row[0] for row in cursor.fetchall()]
        conn.close()
        return {"drug_pairs": pairs, "count": len(pairs)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/offline/search")
def offline_search(req: OfflineSearchRequest):
    """
    Semantic search over the local vector knowledge base.
    Returns the most relevant drug interaction records for a query.
    """
    try:
        from sentence_transformers import SentenceTransformer

        if not DB_PATH.exists():
            return {"results": [], "query": req.query}

        model           = SentenceTransformer("all-MiniLM-L6-v2")
        query_embedding = model.encode(req.query).tolist()

        conn   = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT drug_pair, severity, mechanism, abstract_text, source, embedding "
            "FROM drug_interaction_vectors"
        )
        rows = cursor.fetchall()
        conn.close()

        scored = []
        for row in rows:
            stored = json.loads(row[5])
            a, b   = np.array(query_embedding), np.array(stored)
            score  = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
            scored.append({
                "drug_pair":     row[0],
                "severity":      row[1],
                "mechanism":     row[2],
                "abstract_text": row[3],
                "source":        row[4],
                "score":         round(score, 4),
            })

        scored.sort(key=lambda x: x["score"], reverse=True)
        return {"results": scored[:req.top_k], "query": req.query}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))