'''
"""
VabGenRx — FastAPI Layer
Clinical Intelligence Platform for Medication Safety

Install: pip install fastapi uvicorn
Run:     uvicorn api.app:app --reload --port 8000
"""

import os
import sys
import uuid
from typing import List, Optional, Dict, Any
from itertools import combinations
from fastapi import FastAPI, HTTPException, Request                    # ← added Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio


os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.getcwd())

from dotenv import load_dotenv
load_dotenv()

from services.pubmed_service      import PubMedService
from services.fda_service         import FDAService
from services.evidence_analyzer   import EvidenceAnalyzer
from services.cache_service       import AzureSQLCacheService
from services.vabgenrx_agent      import VabGenRxOrchestrator
from services.counselling_service import DrugCounselingService
from services.condition_service   import ConditionCounselingService
from services.dosing_service      import DosingService
from services.translation_service import TranslationService
# Also add this near the other service imports:
from services.a2a_service import (
    AGENT_CARD, create_task, get_task, update_task,
    detect_skill, execute_skill, TaskState
)
from services.a2a_service import _tasks


app = FastAPI(
    title       = "VabGenRx",
    description = "Clinical Intelligence Platform — Evidence-based medication safety analysis",
    version     = "2.0.0"
)

# ── CORS — allow frontend on port 5173 (Vite dev) and 3000 (Docker) ──────────
app.add_middleware(
    CORSMiddleware,
    allow_origins  = [
        "http://localhost:5173",   # Vite dev server
        "http://localhost:3000",   # Docker / nginx
        "http://localhost:8080",   # Node.js (for server-to-server if needed)
        "*",                       # Keep * as fallback for hackathon
    ],
    allow_credentials = True,      # ← added: needed if you later add cookies/auth
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ── Initialise services once at startup ───────────────────────────────────────
pubmed              = PubMedService()
fda                 = FDAService()
analyzer            = EvidenceAnalyzer()
cache               = AzureSQLCacheService()
agent_service       = VabGenRxOrchestrator()
counseling_service  = DrugCounselingService()
condition_service   = ConditionCounselingService()
dosing_service      = DosingService()
translation_service = TranslationService()


# ── Request / Response Models ─────────────────────────────────────────────────

class PatientProfile(BaseModel):
    """Confirmed lifestyle habits — only pass keys you actually know."""
    drinks_alcohol:      Optional[bool] = None
    smokes:              Optional[bool] = None
    sedentary:           Optional[bool] = None
    has_mobility_issues: Optional[bool] = None
    has_joint_pain:      Optional[bool] = None
    is_pregnant:         Optional[bool] = None
    has_kidney_disease:  Optional[bool] = None
    has_liver_disease:   Optional[bool] = None


class PatientLabs(BaseModel):
    """Lab values and vitals for dosing recommendations."""
    weight_kg:   Optional[float] = None
    height_cm:   Optional[float] = None
    bmi:         Optional[float] = None
    egfr:        Optional[float] = None
    sodium:      Optional[float] = None
    potassium:   Optional[float] = None
    bilirubin:   Optional[float] = None
    tsh:         Optional[float] = None
    free_t3:     Optional[float] = None
    free_t4:     Optional[float] = None
    pulse:       Optional[int]   = None
    other_investigations: Optional[Dict[str, Any]] = {}


class AnalysisRequest(BaseModel):
    medications:        List[str]
    diseases:           Optional[List[str]]      = []
    foods:              Optional[List[str]]       = []
    age:                Optional[int]             = 45
    sex:                Optional[str]             = "unknown"
    dose_map:           Optional[Dict[str, str]]  = {}
    patient_profile:    Optional[PatientProfile]  = None
    patient_labs:       Optional[PatientLabs]     = None
    preferred_language: Optional[str]             = None


class CounselingRequest(BaseModel):
    medications:        List[str]
    diseases:           Optional[List[str]]      = []
    age:                int
    sex:                str
    dose_map:           Optional[Dict[str, str]] = {}
    patient_profile:    Optional[PatientProfile] = None
    preferred_language: Optional[str]            = None


class DosingRequest(BaseModel):
    medications:  List[str]
    diseases:     Optional[List[str]]      = []
    age:          int
    sex:          str
    dose_map:     Optional[Dict[str, str]] = {}
    patient_labs: Optional[PatientLabs]   = None


class QuickCheckRequest(BaseModel):
    drug1: str
    drug2: str


class DrugValidateRequest(BaseModel):
    drug_name: str


# ── Pydantic response models ───────────────────────────────────────────────────

class DrugDrugResult(BaseModel):
    drug1:            str
    drug2:            str
    severity:         str
    confidence:       float
    mechanism:        str
    clinical_effects: str
    recommendation:   str
    evidence_level:   str
    pubmed_papers:    int
    fda_reports:      int
    from_cache:       bool


class DrugDiseaseResult(BaseModel):
    drug:              str
    disease:           str
    contraindicated:   bool
    severity:          str
    confidence:        float
    clinical_evidence: str
    recommendation:    str
    alternatives:      List[str]
    pubmed_papers:     int
    from_cache:        bool


class FoodResult(BaseModel):
    drug:              str
    foods_to_avoid:    List[str]
    foods_to_separate: List[str]
    foods_to_monitor:  List[str]
    mechanism:         str
    evidence_summary:  str
    pubmed_papers:     int
    from_cache:        bool


class RiskSummary(BaseModel):
    level:              str
    severe_ddi_count:   int
    moderate_ddi_count: int
    contraindicated:    int
    total_papers:       int


class AnalysisResponse(BaseModel):
    session_id:   str
    medications:  List[str]
    diseases:     List[str]
    drug_drug:    List[DrugDrugResult]
    drug_disease: List[DrugDiseaseResult]
    drug_food:    List[FoodResult]
    risk_summary: RiskSummary

class A2AMessagePart(BaseModel):
    type: str                          # "text" | "data"
    text: Optional[str]  = None
    data: Optional[Dict] = None


class A2AMessage(BaseModel):
    role:  str
    parts: List[A2AMessagePart]


class A2ATaskRequest(BaseModel):
    id:       Optional[str]  = None
    message:  A2AMessage
    metadata: Optional[Dict] = {}


def _profile_to_dict(profile: Optional[PatientProfile]) -> Dict:
    if not profile:
        return {}
    return {k: v for k, v in profile.dict().items() if v is not None}


def _labs_to_dict(labs: Optional[PatientLabs]) -> Dict:
    if not labs:
        return {}
    d = {k: v for k, v in labs.dict().items() if v is not None}
    if 'other_investigations' not in d:
        d['other_investigations'] = {}
    return d


# ── Internal helpers ──────────────────────────────────────────────────────────

def _check_drug_drug(drug1: str, drug2: str) -> DrugDrugResult:
    from_cache = False
    cached     = cache.get_drug_drug(drug1, drug2)

    if cached:
        from_cache   = True
        a            = cached
        pubmed_count = cached.get('pubmed_papers', 0)
        fda_count    = cached.get('fda_reports', 0)
    else:
        pubmed_data = pubmed.search_drug_interaction(drug1, drug2)
        fda_data    = fda.search_adverse_events(drug1, drug2)
        evidence    = {
            'pubmed':     pubmed_data,
            'fda':        fda_data,
            'fda_labels': [
                fda.get_drug_contraindications(drug1),
                fda.get_drug_contraindications(drug2)
            ]
        }
        a            = analyzer.analyze_drug_drug_interaction(drug1, drug2, evidence)
        pubmed_count = pubmed_data.get('count', 0)
        fda_count    = fda_data.get('total_reports', 0)
        a['pubmed_papers'] = pubmed_count
        a['fda_reports']   = fda_count
        cache.save_drug_drug(drug1, drug2, a)

    return DrugDrugResult(
        drug1            = drug1,
        drug2            = drug2,
        severity         = a.get('severity', 'unknown'),
        confidence       = a.get('confidence', 0.0),
        mechanism        = a.get('mechanism', ''),
        clinical_effects = a.get('clinical_effects', ''),
        recommendation   = a.get('recommendation', ''),
        evidence_level   = a.get('evidence_level', ''),
        pubmed_papers    = pubmed_count,
        fda_reports      = fda_count,
        from_cache       = from_cache
    )


def _check_drug_disease(drug: str, disease: str) -> DrugDiseaseResult:
    from_cache = False
    cached     = cache.get_drug_disease(drug, disease)

    if cached:
        from_cache   = True
        a            = cached
        pubmed_count = cached.get('pubmed_count', 0)
    else:
        pubmed_data  = pubmed.search_disease_contraindication(drug, disease)
        evidence     = {
            'pubmed':    pubmed_data,
            'fda_label': fda.get_drug_contraindications(drug)
        }
        a            = analyzer.analyze_drug_disease_interaction(drug, disease, evidence)
        pubmed_count = pubmed_data.get('count', 0)
        a['pubmed_count'] = pubmed_count
        cache.save_drug_disease(drug, disease, a)

    return DrugDiseaseResult(
        drug              = drug,
        disease           = disease,
        contraindicated   = a.get('contraindicated', False),
        severity          = a.get('severity', 'unknown'),
        confidence        = a.get('confidence', 0.0),
        clinical_evidence = a.get('clinical_evidence', ''),
        recommendation    = a.get('recommendation', ''),
        alternatives      = a.get('alternative_drugs', []),
        pubmed_papers     = pubmed_count,
        from_cache        = from_cache
    )


def _check_food(drug: str) -> FoodResult:
    from_cache = False
    cached     = cache.get_food(drug)

    if cached:
        from_cache = True
        a          = cached
    else:
        a = analyzer.get_food_recommendations_for_drug(drug)
        cache.save_food(drug, a)

    return FoodResult(
        drug              = drug,
        foods_to_avoid    = a.get('foods_to_avoid', []),
        foods_to_separate = a.get('foods_to_separate', []),
        foods_to_monitor  = a.get('foods_to_monitor', []),
        mechanism         = a.get('mechanism_explanation', ''),
        evidence_summary  = a.get('evidence_summary', ''),
        pubmed_papers     = a.get('pubmed_count', 0),
        from_cache        = from_cache
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "status":   "VabGenRx is running",
        "platform": "Clinical Intelligence Platform",
        "version":  "2.0.0"
    }


@app.get("/health")
def health():
    return {
        "status":      "healthy",
        "platform":    "VabGenRx",
        "cache":       cache.get_stats(),
        "api_version": "2.0.0"
    }


@app.post("/validate/drug")
def validate_drug(req: DrugValidateRequest):
    """
    Called while doctor is typing (debounced 500ms).
    Checks if drug name is recognised by FDA.
    """
    label = fda.get_drug_contraindications(req.drug_name)
    return {
        "drug":                  req.drug_name,
        "recognised":            label.get('found', False),
        "has_warnings":          bool(label.get('warnings')),
        "has_contraindications": bool(label.get('contraindications')),
    }


@app.post("/check/drug-pair")
def quick_drug_pair(req: QuickCheckRequest):
    """
    Called automatically when doctor adds each new drug.
    Only checks the one new pair — fast and cache-friendly.
    """
    result = _check_drug_drug(req.drug1, req.drug2)
    return {
        "pair":             f"{req.drug1} + {req.drug2}",
        "severity":         result.severity,
        "confidence":       result.confidence,
        "mechanism":        result.mechanism,
        "clinical_effects": result.clinical_effects,
        "recommendation":   result.recommendation,
        "from_cache":       result.from_cache,
        "badge_color": {
            "severe":   "#FF4444",
            "moderate": "#FFA500",
            "minor":    "#00C851",
        }.get(result.severity, "#999999")
    }


@app.post("/analyze", response_model=AnalysisResponse)
def analyze(req: AnalysisRequest):
    """
    Full analysis endpoint — drug-drug, drug-disease, drug-food.
    Uses EvidenceAnalyzer directly (not agent) for fast structured response.
    """
    if not req.medications:
        raise HTTPException(status_code=400, detail="At least one medication required")

    session_id   = str(uuid.uuid4())[:8]
    ddi_results  = []
    dd_results   = []
    food_results = []

    for drug1, drug2 in combinations(req.medications, 2):
        ddi_results.append(_check_drug_drug(drug1, drug2))

    for drug in req.medications:
        for disease in (req.diseases or []):
            dd_results.append(_check_drug_disease(drug, disease))

    for drug in req.medications:
        food_results.append(_check_food(drug))

    severe_count   = sum(1 for r in ddi_results if r.severity == 'severe')
    moderate_count = sum(1 for r in ddi_results if r.severity == 'moderate')
    contra_count   = sum(1 for r in dd_results  if r.contraindicated)
    total_papers   = (
        sum(r.pubmed_papers for r in ddi_results) +
        sum(r.pubmed_papers for r in dd_results)  +
        sum(r.pubmed_papers for r in food_results)
    )

    risk_level = (
        "HIGH"     if severe_count > 0 or contra_count > 0 else
        "MODERATE" if moderate_count > 0 else
        "LOW"
    )

    cache.log_analysis(
        session_id,
        req.medications,
        req.diseases or [],
        {
            'drug_drug':    [r.dict() for r in ddi_results],
            'drug_disease': [r.dict() for r in dd_results],
            'drug_food':    [r.dict() for r in food_results],
        }
    )

    return AnalysisResponse(
        session_id   = session_id,
        medications  = req.medications,
        diseases     = req.diseases or [],
        drug_drug    = ddi_results,
        drug_disease = dd_results,
        drug_food    = food_results,
        risk_summary = RiskSummary(
            level              = risk_level,
            severe_ddi_count   = severe_count,
            moderate_ddi_count = moderate_count,
            contraindicated    = contra_count,
            total_papers       = total_papers
        )
    )


@app.post("/agent/analyze")
def agent_analyze(req: AnalysisRequest):
    """
    Full agentic analysis — safety + counseling + dosing in one call.
    Uses Microsoft Agent Framework with 3 specialist agents coordinated
    by VabGenRxOrchestrator (Safety + Disease run in parallel, then Counseling).

    Pass preferred_language to get patient-facing counseling translated.
    Supported: Spanish, Hindi, Tamil, Arabic, French, and 100+ others.
    Drug names, lab values, and clinical terms are never translated.
    """
    if not req.medications:
        raise HTTPException(status_code=400, detail="At least one medication required")

    # ── FIX 1: Filter out empty strings from medications list ─────────────────
    # The frontend sends Generic_Name values — some may be empty if a drug
    # was added to the DB without a generic name filled in.
    medications = [m.strip() for m in req.medications if m and m.strip()]
    if not medications:
        raise HTTPException(status_code=400, detail="No valid medication names provided")

    result = agent_service.analyze(
        medications     = medications,
        diseases        = [d.strip() for d in (req.diseases or []) if d and d.strip()],
        foods           = req.foods or [],
        age             = req.age or 45,
        sex             = req.sex or "unknown",
        dose_map        = req.dose_map or {},
        patient_profile = _profile_to_dict(req.patient_profile),
        patient_data    = _labs_to_dict(req.patient_labs),
    )

    # ── Translation — only if preferred_language is set and not English ───────
    if req.preferred_language and result.get("analysis"):
        result["analysis"] = translation_service.translate_agent_result(
            result["analysis"],
            req.preferred_language
        )

    return result


@app.post("/counseling/drug")
def drug_counseling(req: CounselingRequest):
    """
    Drug counseling endpoint.
    Filters by patient age, sex, and confirmed habits.
    Pass preferred_language to translate output for the patient.
    """
    if not req.medications:
        raise HTTPException(status_code=400, detail="At least one medication required")

    results = counseling_service.get_counseling_for_all_drugs(
        medications     = req.medications,
        age             = req.age,
        sex             = req.sex,
        dose_map        = req.dose_map or {},
        conditions      = req.diseases or [],
        patient_profile = _profile_to_dict(req.patient_profile)
    )

    if req.preferred_language:
        results = [
            translation_service.translate_drug_counseling(r, req.preferred_language)
            for r in results
        ]

    return {"drug_counseling": results}


@app.post("/counseling/condition")
def condition_counseling(req: CounselingRequest):
    """
    Condition counseling endpoint.
    Returns exercise, lifestyle, diet and safety advice for each condition.
    Pass preferred_language to translate output for the patient.
    """
    if not req.diseases:
        raise HTTPException(status_code=400, detail="At least one condition required")

    results = condition_service.get_counseling_for_all_conditions(
        conditions      = req.diseases,
        age             = req.age,
        sex             = req.sex,
        medications     = req.medications,
        patient_profile = _profile_to_dict(req.patient_profile)
    )

    if req.preferred_language:
        results = [
            translation_service.translate_condition_counseling(r, req.preferred_language)
            for r in results
        ]

    return {"condition_counseling": results}


@app.post("/counseling/complete")
def complete_counseling(req: CounselingRequest):
    """
    Complete counseling — both drug and condition in one call.
    This is what the frontend calls to populate both patient panels.
    Pass preferred_language to translate all patient-facing content.
    """
    if not req.medications and not req.diseases:
        raise HTTPException(status_code=400, detail="Medications or diseases required")

    drug_results = counseling_service.get_counseling_for_all_drugs(
        medications     = req.medications,
        age             = req.age,
        sex             = req.sex,
        dose_map        = req.dose_map or {},
        conditions      = req.diseases or [],
        patient_profile = _profile_to_dict(req.patient_profile)
    ) if req.medications else []

    condition_results = condition_service.get_counseling_for_all_conditions(
        conditions      = req.diseases or [],
        age             = req.age,
        sex             = req.sex,
        medications     = req.medications,
        patient_profile = _profile_to_dict(req.patient_profile)
    ) if req.diseases else []

    if req.preferred_language:
        drug_results = [
            translation_service.translate_drug_counseling(r, req.preferred_language)
            for r in drug_results
        ]
        condition_results = [
            translation_service.translate_condition_counseling(r, req.preferred_language)
            for r in condition_results
        ]

    return {
        "drug_counseling":      drug_results,
        "condition_counseling": condition_results,
        "patient_context": {
            "age":                req.age,
            "sex":                req.sex,
            "medications":        req.medications,
            "conditions":         req.diseases or [],
            "preferred_language": req.preferred_language or "English"
        }
    }


@app.post("/dosing")
def dosing_recommendations(req: DosingRequest):
    """
    Dosing recommendations endpoint.
    Returns FDA label-based dose adjustments for each medication.
    Always fresh — never cached — since patient labs change frequently.
    """
    if not req.medications:
        raise HTTPException(status_code=400, detail="At least one medication required")

    patient_data = _labs_to_dict(req.patient_labs)
    dose_map     = req.dose_map or {}
    results      = []

    for drug in req.medications:
        pd                 = dict(patient_data)
        pd['age']          = req.age
        pd['sex']          = req.sex
        pd['current_dose'] = dose_map.get(drug, 'not specified')
        pd['current_drug'] = drug
        pd['conditions']   = req.diseases or []

        result = dosing_service.get_dosing_recommendation(
            drug         = drug,
            patient_data = pd
        )
        results.append(result)

    adjustments_required = sum(1 for r in results if r.get('adjustment_required'))
    high_urgency         = sum(1 for r in results if r.get('urgency') == 'high')

    return {
        "dosing_recommendations": results,
        "summary": {
            "total_drugs":          len(results),
            "adjustments_required": adjustments_required,
            "high_urgency_count":   high_urgency,
            "always_fresh":         True
        }
    }


# ── FIX 2: Add /agent/health endpoint ────────────────────────────────────────
# The frontend and CI/CD pipeline check this to confirm the agent is up.
# Without it, smoke tests fail with 404.
@app.get("/agent/health")
def agent_health():
    """Health check specifically for the agent subsystem."""
    return {
        "status":  "healthy",
        "agents":  ["VabGenRxSafetyAgent", "VabGenRxDiseaseAgent", "VabGenRxCounselingAgent"],
        "orchestrator": "VabGenRxOrchestrator",
        "version": "2.0.0"
    }


@app.get("/cache/stats")
def cache_stats():
    return cache.get_stats()


# ── FIX 3: Global exception handler ──────────────────────────────────────────
# Without this, any unhandled Python exception returns a raw 500 with no body,
# which causes the frontend to show "Agent analysis failed" with no detail.
# This handler returns a proper JSON error the frontend can display.
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"❌ Unhandled exception on {request.url}: {exc}")
    return JSONResponse(
        status_code = 500,
        content     = {
            "detail":  str(exc),
            "path":    str(request.url),
            "status":  "error"
        }
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Return clear validation errors instead of raw 422 Pydantic output."""
    return JSONResponse(
        status_code = 422,
        content     = {
            "detail": exc.errors(),
            "path":   str(request.url),
            "status": "validation_error"
        }
    )

 #── A2A Discovery endpoint ────────────────────────────────────────────────────

@app.get("/.well-known/agent.json")
def a2a_agent_card():
    """
    A2A Agent Card — standard discovery endpoint.
    External agents call GET /.well-known/agent.json to discover
    VabGenRx capabilities, skills, and authentication requirements.
    """
    return AGENT_CARD


# ── A2A Task Send ─────────────────────────────────────────────────────────────

@app.post("/a2a/tasks/send")
async def a2a_task_send(req: A2ATaskRequest):
    """
    A2A Task endpoint — receives tasks from external agents.

    Supports 4 skills:
    - drug_interaction_analysis  (drug-drug, drug-disease, drug-food)
    - dosing_recommendation      (FDA label-based dose adjustments)
    - patient_counseling         (exercise, diet, lifestyle, safety)
    - full_safety_analysis       (all three agents in parallel)

    Pass skill in metadata: {"skill": "drug_interaction_analysis"}
    Or describe naturally in message text — skill auto-detected.

    Example request body:
    {
        "message": {
            "role": "user",
            "parts": [
                {"type": "text", "text": "Check interactions for warfarin and aspirin"},
                {"type": "data", "data": {
                    "medications": ["warfarin", "aspirin"],
                    "diseases": ["hypertension"],
                    "age": 70,
                    "sex": "male"
                }}
            ]
        },
        "metadata": {"skill": "drug_interaction_analysis"}
    }
    """
    task_id = req.id or str(uuid.uuid4())

    # Extract text and data from message parts
    text_content = " ".join(
        p.text for p in req.message.parts
        if p.type == "text" and p.text
    )
    data_parts = [p.data for p in req.message.parts if p.type == "data" and p.data]
    data       = data_parts[0] if data_parts else {}

    # Detect which skill to run
    skill = detect_skill(text_content, req.metadata or {})

    # Create task record — state: submitted
    create_task(task_id, skill, data)
    update_task(task_id, TaskState.WORKING)

    # Execute the skill
    try:
        result = await execute_skill(skill, data)
        update_task(task_id, TaskState.COMPLETED, result)

        return {
            "id":     task_id,
            "status": {
                "state":   TaskState.COMPLETED,
                "message": {
                    "role":  "agent",
                    "parts": [{"type": "data", "data": result}]
                }
            },
            "artifacts": [
                {
                    "name":  f"{skill}_result",
                    "parts": [{"type": "data", "data": result}]
                }
            ],
            "metadata": {
                "skill":      skill,
                "agent":      "VabGenRxOrchestrator",
                "version":    "2.0.0",
                "powered_by": "Microsoft Agent Framework"
            }
        }

    except Exception as e:
        error_msg = str(e)
        update_task(task_id, TaskState.FAILED, error=error_msg)
        print(f"❌ A2A task failed [{task_id}]: {error_msg}")
        raise HTTPException(
            status_code = 500,
            detail      = {
                "task_id": task_id,
                "skill":   skill,
                "error":   error_msg
            }
        )


# ── A2A Task Status (polling) ─────────────────────────────────────────────────

@app.get("/a2a/tasks/{task_id}")
def a2a_task_get(task_id: str):
    """
    Poll task status — for async flows where client polls for completion.
    Returns current state: submitted | working | completed | failed
    """
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    return task


# ── A2A Tasks List (debug) ────────────────────────────────────────────────────

@app.get("/a2a/tasks")
def a2a_tasks_list():
    """List recent tasks — useful for debugging and monitoring."""
    return {
        "total":  len(_tasks),
        "tasks":  [
            {
                "id":         tid,
                "skill":      t.get("skill"),
                "state":      t["status"]["state"],
                "created_at": t.get("created_at"),
            }
            for tid, t in list(_tasks.items())[-20:]  # last 20 tasks
        ]
    }'''


"""
VabGenRx — FastAPI Layer
Clinical Intelligence Platform for Medication Safety

Install: pip install fastapi uvicorn
Run:     uvicorn api.app:app --reload --port 8000
"""

import os
import sys
import uuid
from typing import List, Optional, Dict, Any
from itertools import combinations
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio


os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.getcwd())

from dotenv import load_dotenv
load_dotenv()

from services.pubmed_service      import PubMedService
from services.fda_service         import FDAService
from services.evidence_analyzer   import EvidenceAnalyzer
from services.cache_service       import AzureSQLCacheService
from services.vabgenrx_agent      import VabGenRxOrchestrator
from services.counselling_service import DrugCounselingService
from services.condition_service   import ConditionCounselingService
from services.dosing_service      import DosingService
from services.translation_service import TranslationService
from services.a2a_service import (
    AGENT_CARD, create_task, get_task, update_task,
    detect_skill, execute_skill, TaskState
)
from services.a2a_service import _tasks


app = FastAPI(
    title       = "VabGenRx",
    description = "Clinical Intelligence Platform — Evidence-based medication safety analysis",
    version     = "2.0.0"
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins  = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:8080",
        "*",
    ],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ── Initialise services once at startup ───────────────────────────────────────
pubmed              = PubMedService()
fda                 = FDAService()
analyzer            = EvidenceAnalyzer()
cache               = AzureSQLCacheService()
agent_service       = VabGenRxOrchestrator()
counseling_service  = DrugCounselingService()
condition_service   = ConditionCounselingService()
dosing_service      = DosingService()
translation_service = TranslationService()


# ── Request / Response Models ─────────────────────────────────────────────────

class PatientProfile(BaseModel):
    drinks_alcohol:      Optional[bool] = None
    smokes:              Optional[bool] = None
    sedentary:           Optional[bool] = None
    has_mobility_issues: Optional[bool] = None
    has_joint_pain:      Optional[bool] = None
    is_pregnant:         Optional[bool] = None
    has_kidney_disease:  Optional[bool] = None
    has_liver_disease:   Optional[bool] = None


class PatientLabs(BaseModel):
    weight_kg:   Optional[float] = None
    height_cm:   Optional[float] = None
    bmi:         Optional[float] = None
    egfr:        Optional[float] = None
    sodium:      Optional[float] = None
    potassium:   Optional[float] = None
    bilirubin:   Optional[float] = None
    tsh:         Optional[float] = None
    free_t3:     Optional[float] = None
    free_t4:     Optional[float] = None
    pulse:       Optional[int]   = None
    other_investigations: Optional[Dict[str, Any]] = {}


class AnalysisRequest(BaseModel):
    medications:        List[str]
    diseases:           Optional[List[str]]      = []
    foods:              Optional[List[str]]       = []
    age:                Optional[int]             = 45
    sex:                Optional[str]             = "unknown"
    dose_map:           Optional[Dict[str, str]]  = {}
    patient_profile:    Optional[PatientProfile]  = None
    patient_labs:       Optional[PatientLabs]     = None
    preferred_language: Optional[str]             = None


class CounselingRequest(BaseModel):
    medications:        List[str]
    diseases:           Optional[List[str]]      = []
    age:                int
    sex:                str
    dose_map:           Optional[Dict[str, str]] = {}
    patient_profile:    Optional[PatientProfile] = None
    preferred_language: Optional[str]            = None


class DosingRequest(BaseModel):
    medications:  List[str]
    diseases:     Optional[List[str]]      = []
    age:          int
    sex:          str
    dose_map:     Optional[Dict[str, str]] = {}
    patient_labs: Optional[PatientLabs]   = None


class QuickCheckRequest(BaseModel):
    drug1: str
    drug2: str


class DrugValidateRequest(BaseModel):
    drug_name: str


# ── Pydantic response models ───────────────────────────────────────────────────

class DrugDrugResult(BaseModel):
    drug1:            str
    drug2:            str
    severity:         str
    confidence:       float
    mechanism:        str
    clinical_effects: str
    recommendation:   str
    evidence_level:   str
    pubmed_papers:    int
    fda_reports:      int
    from_cache:       bool


class DrugDiseaseResult(BaseModel):
    drug:              str
    disease:           str
    contraindicated:   bool
    severity:          str
    confidence:        float
    clinical_evidence: str
    recommendation:    str
    alternatives:      List[str]
    pubmed_papers:     int
    from_cache:        bool


class FoodResult(BaseModel):
    drug:              str
    foods_to_avoid:    List[str]
    foods_to_separate: List[str]
    foods_to_monitor:  List[str]
    mechanism:         str
    evidence_summary:  str
    pubmed_papers:     int
    from_cache:        bool


class RiskSummary(BaseModel):
    level:              str
    severe_ddi_count:   int
    moderate_ddi_count: int
    contraindicated:    int
    total_papers:       int


class AnalysisResponse(BaseModel):
    session_id:   str
    medications:  List[str]
    diseases:     List[str]
    drug_drug:    List[DrugDrugResult]
    drug_disease: List[DrugDiseaseResult]
    drug_food:    List[FoodResult]
    risk_summary: RiskSummary


class A2AMessagePart(BaseModel):
    type: str
    text: Optional[str]  = None
    data: Optional[Dict] = None


class A2AMessage(BaseModel):
    role:  str
    parts: List[A2AMessagePart]


class A2ATaskRequest(BaseModel):
    id:       Optional[str]  = None
    message:  A2AMessage
    metadata: Optional[Dict] = {}


def _profile_to_dict(profile: Optional[PatientProfile]) -> Dict:
    if not profile:
        return {}
    return {k: v for k, v in profile.dict().items() if v is not None}


def _labs_to_dict(labs: Optional[PatientLabs]) -> Dict:
    if not labs:
        return {}
    d = {k: v for k, v in labs.dict().items() if v is not None}
    if 'other_investigations' not in d:
        d['other_investigations'] = {}
    return d


# ── Internal helpers ──────────────────────────────────────────────────────────

def _check_drug_drug(drug1: str, drug2: str) -> DrugDrugResult:
    from_cache = False
    cached     = cache.get_drug_drug(drug1, drug2)

    if cached:
        from_cache   = True
        a            = cached
        pubmed_count = cached.get('pubmed_papers', 0)
        fda_count    = cached.get('fda_reports', 0)
    else:
        pubmed_data = pubmed.search_drug_interaction(drug1, drug2)
        fda_data    = fda.search_adverse_events(drug1, drug2)
        evidence    = {
            'pubmed':     pubmed_data,
            'fda':        fda_data,
            'fda_labels': [
                fda.get_drug_contraindications(drug1),
                fda.get_drug_contraindications(drug2)
            ]
        }
        a            = analyzer.analyze_drug_drug_interaction(drug1, drug2, evidence)
        pubmed_count = pubmed_data.get('count', 0)
        fda_count    = fda_data.get('total_reports', 0)
        a['pubmed_papers'] = pubmed_count
        a['fda_reports']   = fda_count
        cache.save_drug_drug(drug1, drug2, a)

    return DrugDrugResult(
        drug1            = drug1,
        drug2            = drug2,
        severity         = a.get('severity', 'unknown'),
        confidence       = a.get('confidence', 0.0),
        mechanism        = a.get('mechanism', ''),
        clinical_effects = a.get('clinical_effects', ''),
        recommendation   = a.get('recommendation', ''),
        evidence_level   = a.get('evidence_level', ''),
        pubmed_papers    = pubmed_count,
        fda_reports      = fda_count,
        from_cache       = from_cache
    )


def _check_drug_disease(drug: str, disease: str) -> DrugDiseaseResult:
    from_cache = False
    cached     = cache.get_drug_disease(drug, disease)

    if cached:
        from_cache   = True
        a            = cached
        pubmed_count = cached.get('pubmed_count', 0)
    else:
        pubmed_data  = pubmed.search_disease_contraindication(drug, disease)
        evidence     = {
            'pubmed':    pubmed_data,
            'fda_label': fda.get_drug_contraindications(drug)
        }
        a            = analyzer.analyze_drug_disease_interaction(drug, disease, evidence)
        pubmed_count = pubmed_data.get('count', 0)
        a['pubmed_count'] = pubmed_count
        cache.save_drug_disease(drug, disease, a)

    return DrugDiseaseResult(
        drug              = drug,
        disease           = disease,
        contraindicated   = a.get('contraindicated', False),
        severity          = a.get('severity', 'unknown'),
        confidence        = a.get('confidence', 0.0),
        clinical_evidence = a.get('clinical_evidence', ''),
        recommendation    = a.get('recommendation', ''),
        alternatives      = a.get('alternative_drugs', []),
        pubmed_papers     = pubmed_count,
        from_cache        = from_cache
    )


def _check_food(drug: str) -> FoodResult:
    from_cache = False
    cached     = cache.get_food(drug)

    if cached:
        from_cache = True
        a          = cached
    else:
        a = analyzer.get_food_recommendations_for_drug(drug)
        cache.save_food(drug, a)

    return FoodResult(
        drug              = drug,
        foods_to_avoid    = a.get('foods_to_avoid', []),
        foods_to_separate = a.get('foods_to_separate', []),
        foods_to_monitor  = a.get('foods_to_monitor', []),
        mechanism         = a.get('mechanism_explanation', ''),
        evidence_summary  = a.get('evidence_summary', ''),
        pubmed_papers     = a.get('pubmed_count', 0),
        from_cache        = from_cache
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "status":   "VabGenRx is running",
        "platform": "Clinical Intelligence Platform",
        "version":  "2.0.0"
    }


@app.get("/health")
def health():
    return {
        "status":      "healthy",
        "platform":    "VabGenRx",
        "cache":       cache.get_stats(),
        "api_version": "2.0.0"
    }


@app.post("/validate/drug")
def validate_drug(req: DrugValidateRequest):
    label = fda.get_drug_contraindications(req.drug_name)
    return {
        "drug":                  req.drug_name,
        "recognised":            label.get('found', False),
        "has_warnings":          bool(label.get('warnings')),
        "has_contraindications": bool(label.get('contraindications')),
    }


@app.post("/check/drug-pair")
def quick_drug_pair(req: QuickCheckRequest):
    result = _check_drug_drug(req.drug1, req.drug2)
    return {
        "pair":             f"{req.drug1} + {req.drug2}",
        "severity":         result.severity,
        "confidence":       result.confidence,
        "mechanism":        result.mechanism,
        "clinical_effects": result.clinical_effects,
        "recommendation":   result.recommendation,
        "from_cache":       result.from_cache,
        "badge_color": {
            "severe":   "#FF4444",
            "moderate": "#FFA500",
            "minor":    "#00C851",
        }.get(result.severity, "#999999")
    }


@app.post("/analyze", response_model=AnalysisResponse)
def analyze(req: AnalysisRequest):
    if not req.medications:
        raise HTTPException(status_code=400, detail="At least one medication required")

    session_id   = str(uuid.uuid4())[:8]
    ddi_results  = []
    dd_results   = []
    food_results = []

    for drug1, drug2 in combinations(req.medications, 2):
        ddi_results.append(_check_drug_drug(drug1, drug2))

    for drug in req.medications:
        for disease in (req.diseases or []):
            dd_results.append(_check_drug_disease(drug, disease))

    for drug in req.medications:
        food_results.append(_check_food(drug))

    severe_count   = sum(1 for r in ddi_results if r.severity == 'severe')
    moderate_count = sum(1 for r in ddi_results if r.severity == 'moderate')
    contra_count   = sum(1 for r in dd_results  if r.contraindicated)
    total_papers   = (
        sum(r.pubmed_papers for r in ddi_results) +
        sum(r.pubmed_papers for r in dd_results)  +
        sum(r.pubmed_papers for r in food_results)
    )

    risk_level = (
        "HIGH"     if severe_count > 0 or contra_count > 0 else
        "MODERATE" if moderate_count > 0 else
        "LOW"
    )

    cache.log_analysis(
        session_id,
        req.medications,
        req.diseases or [],
        {
            'drug_drug':    [r.dict() for r in ddi_results],
            'drug_disease': [r.dict() for r in dd_results],
            'drug_food':    [r.dict() for r in food_results],
        }
    )

    return AnalysisResponse(
        session_id   = session_id,
        medications  = req.medications,
        diseases     = req.diseases or [],
        drug_drug    = ddi_results,
        drug_disease = dd_results,
        drug_food    = food_results,
        risk_summary = RiskSummary(
            level              = risk_level,
            severe_ddi_count   = severe_count,
            moderate_ddi_count = moderate_count,
            contraindicated    = contra_count,
            total_papers       = total_papers
        )
    )


@app.post("/agent/analyze")
def agent_analyze(req: AnalysisRequest):
    """
    Full agentic analysis — safety + counseling + dosing in one call.
    Uses Microsoft Agent Framework with 3 specialist agents coordinated
    by VabGenRxOrchestrator (Safety + Disease run in parallel, then Counseling).
    """
    if not req.medications:
        raise HTTPException(status_code=400, detail="At least one medication required")

    medications = [m.strip() for m in req.medications if m and m.strip()]
    if not medications:
        raise HTTPException(status_code=400, detail="No valid medication names provided")

    # ── Register task in A2A task store so dashboard can track it ────────────
    task_id = str(uuid.uuid4())
    create_task(task_id, "full_safety_analysis", {
        "medications": medications,
        "diseases":    [d.strip() for d in (req.diseases or []) if d and d.strip()],
    })
    update_task(task_id, TaskState.WORKING)
    # ─────────────────────────────────────────────────────────────────────────

    try:
        result = agent_service.analyze(
            medications     = medications,
            diseases        = [d.strip() for d in (req.diseases or []) if d and d.strip()],
            foods           = req.foods or [],
            age             = req.age or 45,
            sex             = req.sex or "unknown",
            dose_map        = req.dose_map or {},
            patient_profile = _profile_to_dict(req.patient_profile),
            patient_data    = _labs_to_dict(req.patient_labs),
        )

        # ── Mark task completed ───────────────────────────────────────────────
        update_task(task_id, TaskState.COMPLETED, result)
        # ─────────────────────────────────────────────────────────────────────

        if req.preferred_language and result.get("analysis"):
            result["analysis"] = translation_service.translate_agent_result(
                result["analysis"],
                req.preferred_language
            )

        return result

    except Exception as e:
        # ── Mark task failed ──────────────────────────────────────────────────
        update_task(task_id, TaskState.FAILED, error=str(e))
        # ─────────────────────────────────────────────────────────────────────
        raise


@app.post("/counseling/drug")
def drug_counseling(req: CounselingRequest):
    if not req.medications:
        raise HTTPException(status_code=400, detail="At least one medication required")

    results = counseling_service.get_counseling_for_all_drugs(
        medications     = req.medications,
        age             = req.age,
        sex             = req.sex,
        dose_map        = req.dose_map or {},
        conditions      = req.diseases or [],
        patient_profile = _profile_to_dict(req.patient_profile)
    )

    if req.preferred_language:
        results = [
            translation_service.translate_drug_counseling(r, req.preferred_language)
            for r in results
        ]

    return {"drug_counseling": results}


@app.post("/counseling/condition")
def condition_counseling(req: CounselingRequest):
    if not req.diseases:
        raise HTTPException(status_code=400, detail="At least one condition required")

    results = condition_service.get_counseling_for_all_conditions(
        conditions      = req.diseases,
        age             = req.age,
        sex             = req.sex,
        medications     = req.medications,
        patient_profile = _profile_to_dict(req.patient_profile)
    )

    if req.preferred_language:
        results = [
            translation_service.translate_condition_counseling(r, req.preferred_language)
            for r in results
        ]

    return {"condition_counseling": results}


@app.post("/counseling/complete")
def complete_counseling(req: CounselingRequest):
    if not req.medications and not req.diseases:
        raise HTTPException(status_code=400, detail="Medications or diseases required")

    drug_results = counseling_service.get_counseling_for_all_drugs(
        medications     = req.medications,
        age             = req.age,
        sex             = req.sex,
        dose_map        = req.dose_map or {},
        conditions      = req.diseases or [],
        patient_profile = _profile_to_dict(req.patient_profile)
    ) if req.medications else []

    condition_results = condition_service.get_counseling_for_all_conditions(
        conditions      = req.diseases or [],
        age             = req.age,
        sex             = req.sex,
        medications     = req.medications,
        patient_profile = _profile_to_dict(req.patient_profile)
    ) if req.diseases else []

    if req.preferred_language:
        drug_results = [
            translation_service.translate_drug_counseling(r, req.preferred_language)
            for r in drug_results
        ]
        condition_results = [
            translation_service.translate_condition_counseling(r, req.preferred_language)
            for r in condition_results
        ]

    return {
        "drug_counseling":      drug_results,
        "condition_counseling": condition_results,
        "patient_context": {
            "age":                req.age,
            "sex":                req.sex,
            "medications":        req.medications,
            "conditions":         req.diseases or [],
            "preferred_language": req.preferred_language or "English"
        }
    }


@app.post("/dosing")
def dosing_recommendations(req: DosingRequest):
    if not req.medications:
        raise HTTPException(status_code=400, detail="At least one medication required")

    patient_data = _labs_to_dict(req.patient_labs)
    dose_map     = req.dose_map or {}
    results      = []

    for drug in req.medications:
        pd                 = dict(patient_data)
        pd['age']          = req.age
        pd['sex']          = req.sex
        pd['current_dose'] = dose_map.get(drug, 'not specified')
        pd['current_drug'] = drug
        pd['conditions']   = req.diseases or []

        result = dosing_service.get_dosing_recommendation(
            drug         = drug,
            patient_data = pd
        )
        results.append(result)

    adjustments_required = sum(1 for r in results if r.get('adjustment_required'))
    high_urgency         = sum(1 for r in results if r.get('urgency') == 'high')

    return {
        "dosing_recommendations": results,
        "summary": {
            "total_drugs":          len(results),
            "adjustments_required": adjustments_required,
            "high_urgency_count":   high_urgency,
            "always_fresh":         True
        }
    }


@app.get("/agent/health")
def agent_health():
    return {
        "status":       "healthy",
        "agents":       ["VabGenRxSafetyAgent", "VabGenRxDiseaseAgent", "VabGenRxCounselingAgent"],
        "orchestrator": "VabGenRxOrchestrator",
        "version":      "2.0.0"
    }


@app.get("/cache/stats")
def cache_stats():
    return cache.get_stats()


# ── Exception handlers ────────────────────────────────────────────────────────
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"❌ Unhandled exception on {request.url}: {exc}")
    return JSONResponse(
        status_code = 500,
        content     = {
            "detail": str(exc),
            "path":   str(request.url),
            "status": "error"
        }
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code = 422,
        content     = {
            "detail": exc.errors(),
            "path":   str(request.url),
            "status": "validation_error"
        }
    )


# ── A2A Discovery ─────────────────────────────────────────────────────────────

@app.get("/.well-known/agent.json")
def a2a_agent_card():
    return AGENT_CARD


# ── A2A Task Send ─────────────────────────────────────────────────────────────

@app.post("/a2a/tasks/send")
async def a2a_task_send(req: A2ATaskRequest):
    task_id = req.id or str(uuid.uuid4())

    text_content = " ".join(
        p.text for p in req.message.parts
        if p.type == "text" and p.text
    )
    data_parts = [p.data for p in req.message.parts if p.type == "data" and p.data]
    data       = data_parts[0] if data_parts else {}

    skill = detect_skill(text_content, req.metadata or {})

    create_task(task_id, skill, data)
    update_task(task_id, TaskState.WORKING)

    try:
        result = await execute_skill(skill, data)
        update_task(task_id, TaskState.COMPLETED, result)

        return {
            "id":     task_id,
            "status": {
                "state":   TaskState.COMPLETED,
                "message": {
                    "role":  "agent",
                    "parts": [{"type": "data", "data": result}]
                }
            },
            "artifacts": [
                {
                    "name":  f"{skill}_result",
                    "parts": [{"type": "data", "data": result}]
                }
            ],
            "metadata": {
                "skill":      skill,
                "agent":      "VabGenRxOrchestrator",
                "version":    "2.0.0",
                "powered_by": "Microsoft Agent Framework"
            }
        }

    except Exception as e:
        error_msg = str(e)
        update_task(task_id, TaskState.FAILED, error=error_msg)
        print(f"❌ A2A task failed [{task_id}]: {error_msg}")
        raise HTTPException(
            status_code = 500,
            detail      = {
                "task_id": task_id,
                "skill":   skill,
                "error":   error_msg
            }
        )


# ── A2A Task Status ───────────────────────────────────────────────────────────

@app.get("/a2a/tasks/{task_id}")
def a2a_task_get(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    return task


# ── A2A Tasks List ────────────────────────────────────────────────────────────

@app.get("/a2a/tasks")
def a2a_tasks_list():
    """List recent tasks — useful for debugging and dashboard monitoring."""
    return {
        "total": len(_tasks),
        "tasks": [
            {
                "id":         tid,
                "skill":      t.get("skill"),
                "state":      t["status"]["state"],
                "created_at": t.get("created_at"),
            }
            for tid, t in list(_tasks.items())[-20:]
        ]
    }