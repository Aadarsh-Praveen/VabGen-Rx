"""
VabGenRx — FastAPI Application Layer
Clinical Intelligence Platform for Medication Safety

Architecture:
    Six-phase multi-agent pipeline coordinated by VabGenRxOrchestrator:
    Phase 1  Evidence gathering      — parallel PubMed + FDA fetch
    Phase 2  Round 1 synthesis       — Safety, Disease, Dosing agents
    Phase 3  Signal extraction       — compounding risk detection
    Phase 4  Round 2 re-evaluation   — conditional, signal-driven
    Phase 5  Patient counselling     — drug + condition services
    Phase 6  Orchestrator synthesis  — cross-domain clinical intelligence

Azure Services:
    Azure AI Foundry / Agent Service  — multi-agent orchestration
    Azure OpenAI (GPT-4o)             — evidence synthesis + counselling
    Azure SQL Database                — interaction cache + analysis log
    Azure SQL Audit Database          — HIPAA-compliant PHI audit log
    Azure Key Vault                   — secrets management
    Azure Application Insights        — telemetry + custom alert events
    Azure AI Foundry Tracing          — LLM prompt/response tracing

HIPAA Compliance:
    All PHI-touching endpoints are logged to phi_audit_log.
    Patient IDs are SHA-256 hashed before storage — never stored raw.
    Audit log retention enforced at 6 years on startup.
    Cache retention enforced at 30 days on startup.
"""

import os
import sys
import uuid
import hashlib
import logging
import asyncio
from typing             import List, Optional, Dict, Any
from itertools          import combinations
from concurrent.futures import ThreadPoolExecutor, as_completed
from fastapi            import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic           import BaseModel

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.getcwd())

from dotenv import load_dotenv
load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from keyvault import load_all_secrets
load_all_secrets()

# ── Azure Application Insights ────────────────────────────────────────────────
_AI_CONN_STR = os.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING", "")

if _AI_CONN_STR:
    try:
        from opencensus.ext.azure.log_exporter import AzureLogHandler
        _ai_handler = AzureLogHandler(connection_string=_AI_CONN_STR)
        _ai_handler.setLevel(logging.WARNING)
        logging.getLogger("vabgenrx").addHandler(_ai_handler)
        print("✅ Azure Application Insights connected")
    except Exception as e:
        print(f"⚠️  Application Insights setup failed: {e}")
else:
    print("⚠️  Application Insights not configured — skipping")

logger = logging.getLogger("vabgenrx")
logger.setLevel(logging.INFO)

# ── Azure AI Foundry Tracing ──────────────────────────────────────────────────
_PROJECT_ENDPOINT = os.getenv("AZURE_AI_PROJECT_ENDPOINT", "")
_PROJECT_CONN_STR = _PROJECT_ENDPOINT  # updated below if tracing connects

if _PROJECT_ENDPOINT:
    try:
        import pkg_resources
        print(f"📦 setuptools version: {pkg_resources.get_distribution('setuptools').version}")
        from azure.ai.projects           import AIProjectClient
        from azure.identity              import DefaultAzureCredential
        from azure.monitor.opentelemetry import configure_azure_monitor

        _project_client   = AIProjectClient(
            endpoint   = _PROJECT_ENDPOINT,
            credential = DefaultAzureCredential()
        )
        _foundry_conn_str = (
            _project_client.telemetry
            .get_application_insights_connection_string()
        )
        configure_azure_monitor(connection_string=_foundry_conn_str)
        _PROJECT_CONN_STR = _foundry_conn_str
        print("✅ Azure AI Foundry tracing enabled")

    except ImportError as e:
        print(f"⚠️  Foundry tracing: package not found — {e}")
    except AttributeError as e:
        print(f"⚠️  Foundry tracing: API mismatch — {e}")
    except Exception as e:
        print(f"⚠️  Foundry tracing setup failed: {e}")
else:
    print("⚠️  Foundry tracing not configured — skipping")


# ── Service imports ───────────────────────────────────────────────────────────
from services.pubmed_service              import PubMedService
from services.fda_service                 import FDAService
from services.evidence_analyzer           import EvidenceAnalyzer
from services.cache_service               import AzureSQLCacheService
from services.vabgenrx_agents             import VabGenRxOrchestrator
from services.patient.counselling_service import DrugCounselingService
from services.patient.condition_service   import ConditionCounselingService
from services.patient.dosing_service      import DosingService
from services.translation                 import TranslationService
from logs import AuditLogService, AuditAction, ResourceType
from services.a2a import (
    AGENT_CARD,
    create_task,
    get_task,
    update_task,
    detect_skill,
    execute_skill,
    TaskState,
    _tasks,
)

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title       = "VabGenRx",
    description = (
        "Clinical Intelligence Platform — "
        "Evidence-based medication safety analysis"
    ),
    version     = "3.0.0"
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins = [
        "https://yellow-sea-05177870f.2.azurestaticapps.net",  # production frontend
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:8080",
    ],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ── Lazy service references ───────────────────────────────────────────────────
pubmed                = None
fda                   = None
analyzer              = None
cache                 = None
agent_service         = None
counseling_service    = None
condition_service     = None
dosing_service        = None
translation_service   = None
transcription_service = None
audit                 = None
_services_ready       = False

# ── PHI audit scope ───────────────────────────────────────────────────────────
_PHI_ENDPOINTS = (
    "/agent/analyze",
    "/agent/translate",
    "/counseling/",
    "/dosing",
    "/analyze",
)


def _init_services():
    """Initialize all heavy services in a background thread."""
    global pubmed, fda, analyzer, cache, agent_service
    global counseling_service, condition_service
    global dosing_service, translation_service, transcription_service, audit, _services_ready

    print("🔄 Initializing services in background...")
    try:
        pubmed              = PubMedService()
        print("   ✅ PubMedService")
        fda                 = FDAService()
        print("   ✅ FDAService")
        analyzer            = EvidenceAnalyzer()
        print("   ✅ EvidenceAnalyzer")
        cache               = AzureSQLCacheService()
        print("   ✅ AzureSQLCacheService")
        counseling_service  = DrugCounselingService()
        print("   ✅ DrugCounselingService")
        condition_service   = ConditionCounselingService()
        print("   ✅ ConditionCounselingService")
        dosing_service      = DosingService()
        print("   ✅ DosingService")
        translation_service = TranslationService()
        print("   ✅ TranslationService")
        audit               = AuditLogService()
        print("   ✅ AuditLogService")
        from services.transcription import TranscriptionService
        transcription_service = TranscriptionService()
        print("   ✅ TranscriptionService")
        agent_service       = VabGenRxOrchestrator()
        print("   ✅ VabGenRxOrchestrator")

        try:
            audit.enforce_retention_policy()
            cache_cleanup = cache.enforce_retention_policy()
            if cache_cleanup:
                print(f"   🗑️  Cache retention: {cache_cleanup}")
            print("✅ Retention policies enforced on startup")
        except Exception as e:
            print(f"⚠️  Startup retention cleanup failed: {e}")

        _services_ready = True
        print("✅ All services ready")

    except Exception as e:
        print(f"❌ Service initialization failed: {e}")


@app.on_event("startup")
async def startup_event():
    """Start service initialization in background — gunicorn responds instantly."""
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, _init_services)


def _check_ready():
    """Raise 503 if services are still initializing."""
    if not _services_ready:
        raise HTTPException(
            status_code = 503,
            detail      = "Service is still initializing — please retry in a moment."
        )


# ── Request models ────────────────────────────────────────────────────────────

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
    weight_kg:            Optional[float]          = None
    height_cm:            Optional[float]          = None
    bmi:                  Optional[float]          = None
    egfr:                 Optional[float]          = None
    sodium:               Optional[float]          = None
    potassium:            Optional[float]          = None
    bilirubin:            Optional[float]          = None
    tsh:                  Optional[float]          = None
    free_t3:              Optional[float]          = None
    free_t4:              Optional[float]          = None
    pulse:                Optional[int]            = None
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


class TranslateRequest(BaseModel):
    language:             str
    drug_counseling:      List[Dict[str, Any]] = []
    condition_counseling: List[Dict[str, Any]] = []


# ── Response models ───────────────────────────────────────────────────────────

class DrugDrugResult(BaseModel):
    drug1:            str
    drug2:            str
    severity:         str
    confidence:       Optional[float]
    mechanism:        str
    clinical_effects: str
    recommendation:   str
    evidence_level:   str
    pubmed_papers:    int
    fda_reports:      int
    from_cache:       bool


class DrugDiseaseResult(BaseModel):
    drug:                     str
    disease:                  str
    contraindicated:          bool
    severity:                 str
    confidence:               Optional[float]
    clinical_evidence:        str
    recommendation:           str
    alternatives:             List[str]
    pubmed_papers:            int
    fda_label_sections_count: int = 0
    from_cache:               bool


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
    text: Optional[str] = None
    data: Optional[Dict] = None


class A2AMessage(BaseModel):
    role:  str
    parts: List[A2AMessagePart]


class A2ATaskRequest(BaseModel):
    id:       Optional[str]  = None
    message:  A2AMessage
    metadata: Optional[Dict] = {}


# ── Helpers ───────────────────────────────────────────────────────────────────

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
        confidence       = a.get('confidence'),
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
        fda_sections = cached.get('fda_label_sections_count', 0)
    else:
        pubmed_data = pubmed.search_disease_contraindication(drug, disease)
        evidence = {
            'pubmed':    pubmed_data,
            'fda_label': fda.get_drug_contraindications(drug)
        }
        a            = analyzer.analyze_drug_disease_interaction(drug, disease, evidence)
        pubmed_count = pubmed_data.get('count', 0)
        fda_sections = a.get('fda_label_sections_count', 0)
        a['pubmed_count'] = pubmed_count
        cache.save_drug_disease(drug, disease, a)

    return DrugDiseaseResult(
        drug                     = drug,
        disease                  = disease,
        contraindicated          = a.get('contraindicated', False),
        severity                 = a.get('severity', 'unknown'),
        confidence               = a.get('confidence'),
        clinical_evidence        = a.get('clinical_evidence', ''),
        recommendation           = a.get('recommendation', ''),
        alternatives             = a.get('alternative_drugs', []),
        pubmed_papers            = pubmed_count,
        fda_label_sections_count = fda_sections,
        from_cache               = from_cache
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


# ── Core routes ───────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "status":     "VabGenRx is running",
        "ready":      _services_ready,
        "platform":   "Clinical Intelligence Platform",
        "version":    "3.0.0",
        "monitoring": "Azure Application Insights" if _AI_CONN_STR else "disabled",
        "tracing":    "Azure AI Foundry" if _PROJECT_CONN_STR else "disabled",
    }


@app.get("/health")
def health():
    return {
        "status":      "healthy" if _services_ready else "initializing",
        "ready":       _services_ready,
        "platform":    "VabGenRx",
        "cache":       cache.get_stats() if cache else {},
        "fda_cache":   fda.get_cache_stats() if fda else {},
        "audit":       audit.get_stats() if audit else {},
        "monitoring":  "Azure Application Insights" if _AI_CONN_STR else "disabled",
        "tracing":     "Azure AI Foundry" if _PROJECT_CONN_STR else "disabled",
        "api_version": "3.0.0"
    }


@app.post("/validate/drug")
def validate_drug(req: DrugValidateRequest):
    _check_ready()
    label = fda.get_drug_contraindications(req.drug_name)
    return {
        "drug":                  req.drug_name,
        "recognised":            label.get('found', False),
        "has_warnings":          bool(label.get('warnings')),
        "has_contraindications": bool(label.get('contraindications')),
    }


@app.post("/check/drug-pair")
def quick_drug_pair(req: QuickCheckRequest):
    _check_ready()
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
            "unknown":  "#999999",
        }.get(result.severity, "#999999")
    }


@app.post("/analyze", response_model=AnalysisResponse)
def analyze(req: AnalysisRequest):
    """Fast structured analysis via EvidenceAnalyzer — no agent overhead."""
    _check_ready()
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


# ── Agent endpoints ───────────────────────────────────────────────────────────

@app.post("/agent/analyze")
def agent_analyze(req: AnalysisRequest):
    """Full agentic analysis — single blocking call through all six phases."""
    _check_ready()
    if not req.medications:
        raise HTTPException(status_code=400, detail="At least one medication required")

    medications = [m.strip() for m in req.medications if m and m.strip()]
    if not medications:
        raise HTTPException(status_code=400, detail="No valid medication names provided")

    task_id = str(uuid.uuid4())
    create_task(task_id, "full_safety_analysis", {
        "medications": medications,
        "diseases":    [d.strip() for d in (req.diseases or []) if d and d.strip()],
    })
    update_task(task_id, TaskState.WORKING)

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
        update_task(task_id, TaskState.COMPLETED, result)

        if req.preferred_language and result.get("analysis"):
            result["analysis"] = translation_service.translate_agent_result(
                result["analysis"], req.preferred_language
            )
        return result

    except Exception as e:
        update_task(task_id, TaskState.FAILED, error=str(e))
        raise


# ── Phase endpoints ───────────────────────────────────────────────────────────

@app.post("/agent/analyze/interactions")
def analyze_interactions(req: AnalysisRequest):
    """Phase 1 — drug interactions and drug-disease contraindications."""
    _check_ready()
    if not req.medications:
        raise HTTPException(status_code=400, detail="At least one medication required")

    medications = [m.strip() for m in req.medications if m and m.strip()]
    diseases    = [d.strip() for d in (req.diseases or []) if d and d.strip()]

    if not medications:
        raise HTTPException(status_code=400, detail="No valid medication names provided")

    from services.evidence.safety_evidence  import SafetyEvidenceService
    from services.evidence.disease_evidence import DiseaseEvidenceService
    from services.signals.signal_extractor  import SignalExtractor

    safety_ev_svc  = SafetyEvidenceService()
    disease_ev_svc = DiseaseEvidenceService()
    extractor      = SignalExtractor()

    def gather_safety():
        if len(medications) >= 2:
            return safety_ev_svc.gather(medications)
        return {"drug_drug": {}, "drug_food": {}}

    def gather_disease():
        if medications and diseases:
            return disease_ev_svc.gather(medications, diseases)
        return {}

    with ThreadPoolExecutor(max_workers=2) as ex:
        sf = ex.submit(gather_safety)
        df = ex.submit(gather_disease)
        safety_evidence  = sf.result()
        disease_evidence = df.result()

    safety_agent  = agent_service.safety_agent
    disease_agent = agent_service.disease_agent

    def run_safety():
        if len(medications) >= 2:
            return safety_agent.synthesize(safety_evidence, medications)
        return {"drug_drug": [], "drug_food": []}

    def run_disease():
        if medications and diseases:
            return disease_agent.synthesize(disease_evidence, medications, diseases)
        return {"drug_disease": []}

    safety_r1  = {"drug_drug": [], "drug_food": []}
    disease_r1 = {"drug_disease": []}

    with ThreadPoolExecutor(max_workers=2) as ex:
        futures = {
            ex.submit(run_safety):  "safety",
            ex.submit(run_disease): "disease",
        }
        for future in as_completed(futures):
            label  = futures[future]
            result = future.result()
            if label == "safety":
                safety_r1  = result or {"drug_drug": [], "drug_food": []}
            else:
                disease_r1 = result or {"drug_disease": []}

    safety_r1  = safety_ev_svc.patch_drug_drug_evidence(
        safety_r1, safety_evidence.get("drug_drug", {})
    )
    disease_r1 = disease_ev_svc.patch_drug_disease_evidence(
        disease_r1, disease_evidence
    )

    for item in safety_r1.get("drug_drug", []):
        if not item.get("from_cache"):
            try:
                cache.save_drug_drug(
                    item.get("drug1", ""), item.get("drug2", ""),
                    {
                        "severity":         item.get("severity"),
                        "confidence":       item.get("confidence"),
                        "mechanism":        item.get("mechanism", ""),
                        "clinical_effects": item.get("clinical_effects", ""),
                        "recommendation":   item.get("recommendation", ""),
                        "pubmed_papers":    item.get("evidence", {}).get("pubmed_papers", 0),
                        "fda_reports":      item.get("evidence", {}).get("fda_reports", 0),
                        "evidence":         item.get("evidence", {}),
                    }
                )
            except Exception as e:
                print(f"   ⚠️  Cache save drug-drug error: {e}")

    for item in disease_r1.get("drug_disease", []):
        if not item.get("from_cache"):
            try:
                cache.save_drug_disease(
                    item.get("drug", ""), item.get("disease", ""),
                    {
                        "contraindicated":          item.get("contraindicated", False),
                        "severity":                 item.get("severity"),
                        "confidence":               item.get("confidence"),
                        "clinical_evidence":        item.get("clinical_evidence", ""),
                        "recommendation":           item.get("recommendation", ""),
                        "alternative_drugs":        item.get("alternative_drugs", []),
                        "pubmed_count":             item.get("evidence", {}).get("pubmed_papers", 0),
                        "fda_label_sections_count": item.get("evidence", {}).get("fda_label_sections_count", 0),
                        "fda_label_sections_found": item.get("evidence", {}).get("fda_label_sections_found", []),
                        "evidence":                 item.get("evidence", {}),
                    }
                )
            except Exception as e:
                print(f"   ⚠️  Cache save drug-disease error: {e}")

    for item in safety_r1.get("drug_food", []):
        if not item.get("from_cache"):
            try:
                cache.save_food(
                    item.get("drug", ""),
                    {
                        "foods_to_avoid":              item.get("foods_to_avoid", []),
                        "foods_to_separate":           item.get("foods_to_separate", []),
                        "foods_to_monitor":            item.get("foods_to_monitor", []),
                        "no_significant_interactions": item.get("no_significant_interactions", False),
                        "mechanism_explanation":       item.get("mechanism", ""),
                        "evidence_summary":            item.get("evidence", {}).get("evidence_summary", ""),
                        "pubmed_count":                item.get("evidence", {}).get("pubmed_papers", 0),
                        "evidence":                    item.get("evidence", {}),
                    }
                )
            except Exception as e:
                print(f"   ⚠️  Cache save drug-food error: {e}")

    signals = extractor.extract(
        safety_r1, disease_r1,
        {"dosing_recommendations": []},
        {
            "age":        req.age or 45,
            "sex":        req.sex or "unknown",
            "conditions": diseases,
            "egfr":       _labs_to_dict(req.patient_labs).get("egfr"),
        }
    )

    return {
        "drug_drug":           safety_r1.get("drug_drug",    []),
        "drug_disease":        disease_r1.get("drug_disease", []),
        "drug_food":           safety_r1.get("drug_food",    []),
        "compounding_signals": signals,
        "phase":               "interactions",
        "status":              "completed",
    }


@app.post("/agent/analyze/dosing")
def analyze_dosing(req: AnalysisRequest):
    """Phase 2 — FDA-based dosing recommendations."""
    _check_ready()
    if not req.medications:
        raise HTTPException(status_code=400, detail="At least one medication required")

    medications = [m.strip() for m in req.medications if m and m.strip()]
    diseases    = [d.strip() for d in (req.diseases or []) if d and d.strip()]

    if not medications:
        raise HTTPException(status_code=400, detail="No valid medication names provided")

    patient_data = _labs_to_dict(req.patient_labs)
    full_patient_data = {
        **patient_data,
        "age":        req.age or 45,
        "sex":        req.sex or "unknown",
        "conditions": diseases,
    }

    dosing_r1 = agent_service.dosing_agent.analyze(
        medications, full_patient_data, req.dose_map or {}
    )

    return {
        "dosing_recommendations": dosing_r1.get("dosing_recommendations", []),
        "phase":  "dosing",
        "status": "completed",
    }


@app.post("/agent/analyze/counselling")
def analyze_counselling(req: AnalysisRequest):
    """Phase 3 — patient-specific drug and condition counselling."""
    _check_ready()
    if not req.medications and not req.diseases:
        raise HTTPException(status_code=400, detail="Medications or diseases required")

    medications = [m.strip() for m in (req.medications or []) if m and m.strip()]
    diseases    = [d.strip() for d in (req.diseases or [])    if d and d.strip()]
    age         = req.age or 45
    sex         = req.sex or "unknown"
    profile     = _profile_to_dict(req.patient_profile)
    dose_map    = req.dose_map or {}

    def run_drug():
        if not medications:
            return []
        return counseling_service.get_counseling_for_all_drugs(
            medications=medications, age=age, sex=sex,
            dose_map=dose_map, conditions=diseases, patient_profile=profile,
        )

    def run_condition():
        if not diseases:
            return []
        return condition_service.get_counseling_for_all_conditions(
            conditions=diseases, age=age, sex=sex,
            medications=medications, patient_profile=profile,
        )

    with ThreadPoolExecutor(max_workers=2) as ex:
        df = ex.submit(run_drug)
        cf = ex.submit(run_condition)
        drug_results = df.result()
        cond_results = cf.result()

    if req.preferred_language:
        drug_results = [
            translation_service.translate_drug_counseling(r, req.preferred_language)
            for r in drug_results
        ]
        cond_results = [
            translation_service.translate_condition_counseling(r, req.preferred_language)
            for r in cond_results
        ]

    return {
        "drug_counseling":      drug_results,
        "condition_counseling": cond_results,
        "phase":                "counselling",
        "status":               "completed",
    }


@app.post("/agent/analyze/summary")
def analyze_summary(req: AnalysisRequest, request: Request):
    """Phase 4 — cross-domain clinical summary via OrchestratorAgent."""
    _check_ready()
    if not req.medications:
        raise HTTPException(status_code=400, detail="At least one medication required")

    medications = [m.strip() for m in req.medications if m and m.strip()]
    diseases    = [d.strip() for d in (req.diseases or []) if d and d.strip()]

    if not medications:
        raise HTTPException(status_code=400, detail="No valid medication names provided")

    session_id = request.headers.get("X-Session-ID", str(uuid.uuid4()))
    labs       = _labs_to_dict(req.patient_labs)

    orchestrator_result = agent_service.orchestrator_agent.synthesize(
        safety_result       = {"drug_drug": [], "drug_food": []},
        disease_result      = {"drug_disease": []},
        dosing_result       = {"dosing_recommendations": []},
        counselling_result  = {"drug_counseling": [], "condition_counseling": []},
        compounding_signals = {},
        patient_context     = {
            "age":        req.age or 45,
            "sex":        req.sex or "unknown",
            "conditions": diseases,
            "egfr":       labs.get("egfr"),
            "potassium":  labs.get("potassium"),
            "bilirubin":  labs.get("bilirubin"),
            "tsh":        labs.get("tsh"),
            "pulse":      labs.get("pulse"),
        },
        session_id = session_id,
    )

    risk_summary = {
        "level":                         orchestrator_result.get("risk_level", "UNKNOWN"),
        "severe_count":                  0,
        "moderate_count":                0,
        "contraindicated_count":         0,
        "dosing_adjustments_required":   0,
        "compounding_patterns_detected": 0,
        "round2_updates":                0,
        "clinical_summary":              orchestrator_result.get("clinical_summary", ""),
        "compounding_patterns":          orchestrator_result.get("compounding_patterns", []),
        "priority_actions":              orchestrator_result.get("priority_actions", []),
        "evidence_summary":              orchestrator_result.get("evidence_summary", {}),
        "trace_session_id":              orchestrator_result.get("trace_session_id", ""),
    }

    return {
        "risk_summary":        risk_summary,
        "compounding_signals": {},
        "phase":               "summary",
        "status":              "completed",
    }


# ── Counselling endpoints ─────────────────────────────────────────────────────

@app.post("/counseling/drug")
def drug_counseling(req: CounselingRequest):
    _check_ready()
    if not req.medications:
        raise HTTPException(status_code=400, detail="At least one medication required")

    results = counseling_service.get_counseling_for_all_drugs(
        medications=req.medications, age=req.age, sex=req.sex,
        dose_map=req.dose_map or {}, conditions=req.diseases or [],
        patient_profile=_profile_to_dict(req.patient_profile)
    )

    if req.preferred_language:
        results = [
            translation_service.translate_drug_counseling(r, req.preferred_language)
            for r in results
        ]
    return {"drug_counseling": results}


@app.post("/counseling/condition")
def condition_counseling(req: CounselingRequest):
    _check_ready()
    if not req.diseases:
        raise HTTPException(status_code=400, detail="At least one condition required")

    results = condition_service.get_counseling_for_all_conditions(
        conditions=req.diseases, age=req.age, sex=req.sex,
        medications=req.medications,
        patient_profile=_profile_to_dict(req.patient_profile)
    )

    if req.preferred_language:
        results = [
            translation_service.translate_condition_counseling(r, req.preferred_language)
            for r in results
        ]
    return {"condition_counseling": results}


@app.post("/counseling/complete")
def complete_counseling(req: CounselingRequest):
    _check_ready()
    if not req.medications and not req.diseases:
        raise HTTPException(status_code=400, detail="Medications or diseases required")

    drug_results = counseling_service.get_counseling_for_all_drugs(
        medications=req.medications, age=req.age, sex=req.sex,
        dose_map=req.dose_map or {}, conditions=req.diseases or [],
        patient_profile=_profile_to_dict(req.patient_profile)
    ) if req.medications else []

    condition_results = condition_service.get_counseling_for_all_conditions(
        conditions=req.diseases or [], age=req.age, sex=req.sex,
        medications=req.medications,
        patient_profile=_profile_to_dict(req.patient_profile)
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
    _check_ready()
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
        results.append(
            dosing_service.get_dosing_recommendation(drug=drug, patient_data=pd)
        )

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


# ── Health and stats endpoints ────────────────────────────────────────────────

@app.get("/agent/health")
def agent_health():
    return {
        "status": "healthy" if _services_ready else "initializing",
        "ready":  _services_ready,
        "agents": [
            "VabGenRxSafetyAgent",
            "VabGenRxDiseaseAgent",
            "VabGenRxDosingAgent",
            "VabGenRxCounsellingAgent",
            "VabGenRxOrchestratorAgent",
        ],
        "orchestrator": "VabGenRxOrchestrator",
        "version":      "3.0.0"
    }


@app.get("/cache/stats")
def cache_stats():
    _check_ready()
    return {
        **cache.get_stats(),
        "fda_label_cache": fda.get_cache_stats(),
    }


@app.get("/audit/stats")
def audit_stats():
    """HIPAA compliance reporting — audit log statistics."""
    _check_ready()
    return audit.get_stats()


# ── Translation endpoint ──────────────────────────────────────────────────────

@app.post("/agent/translate")
def translate_counselling(req: TranslateRequest):
    """Translate approved counselling content to the patient's preferred language."""
    _check_ready()
    if not translation_service.needs_translation(req.language):
        return {
            "drug_counseling":      req.drug_counseling,
            "condition_counseling": req.condition_counseling,
            "translated":           False,
            "language":             req.language,
        }

    agent_result = {
        "drug_counseling":      req.drug_counseling,
        "condition_counseling": req.condition_counseling,
        "risk_summary":         {},
    }

    translated = translation_service.translate_agent_result(
        agent_result, req.language
    )

    return {
        "drug_counseling":      translated.get("drug_counseling", []),
        "condition_counseling": translated.get("condition_counseling", []),
        "translated":           True,
        "language":             req.language,
    }


# ── HIPAA audit middleware ────────────────────────────────────────────────────

@app.middleware("http")
async def phi_audit_middleware(request: Request, call_next):
    """
    Log every PHI-touching request to phi_audit_log.

    Patient IDs from X-Resource-ID header are SHA-256 hashed
    before storage — raw IDs never reach the audit database.
    Session IDs from X-Session-ID tie all four phase calls
    for one analysis to a single traceable session.
    """
    response = await call_next(request)

    try:
        path = request.url.path
        if any(path.startswith(ep) for ep in _PHI_ENDPOINTS):

            if "interact" in path:
                resource = ResourceType.DRUG_ANALYSIS
            elif "translate" in path:
                resource = ResourceType.TRANSLATION
            elif "counsel" in path:
                resource = ResourceType.COUNSELLING
            elif "dosing" in path:
                resource = ResourceType.DOSING
            else:
                resource = ResourceType.DRUG_ANALYSIS

            raw_resource_id    = request.headers.get("X-Resource-ID", "")
            hashed_resource_id = (
                hashlib.sha256(raw_resource_id.encode()).hexdigest()[:16]
                if raw_resource_id else ""
            )

            if audit:
                try:
                    audit.log(
                        action        = AuditAction.ANALYSIS,
                        resource_type = resource,
                        user_id       = request.headers.get("X-User-ID", "anonymous"),
                        user_email    = request.headers.get("X-User-Email", ""),
                        ip_address    = request.client.host if request.client else "",
                        session_id    = request.headers.get("X-Session-ID", ""),
                        resource_id   = hashed_resource_id,
                        endpoint      = path,
                        http_method   = request.method,
                        status_code   = response.status_code,
                        success       = response.status_code < 400,
                        detail        = f"HTTP {response.status_code}",
                    )
                except Exception as audit_err:
                    logger.critical(
                        "hipaa_audit_failure",
                        extra={"custom_dimensions": {
                            "event":      "hipaa_audit_failure",
                            "endpoint":   path,
                            "error":      str(audit_err)[:300],
                            "session_id": request.headers.get("X-Session-ID", ""),
                        }}
                    )
                    print(f"   ⚠️  Audit middleware error: {audit_err}")

    except Exception as e:
        print(f"   ⚠️  Audit middleware outer error: {e}")

    return response


# ── Exception handlers ────────────────────────────────────────────────────────

from fastapi.responses  import JSONResponse
from fastapi.exceptions import RequestValidationError


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"❌ Unhandled exception on {request.url}: {exc}")
    return JSONResponse(
        status_code = 500,
        content     = {"detail": str(exc), "path": str(request.url), "status": "error"}
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code = 422,
        content     = {"detail": exc.errors(), "path": str(request.url), "status": "validation_error"}
    )


# ── A2A protocol ──────────────────────────────────────────────────────────────

@app.get("/.well-known/agent.json")
def a2a_agent_card():
    return AGENT_CARD


@app.post("/a2a/tasks/send")
async def a2a_task_send(req: A2ATaskRequest):
    _check_ready()
    task_id = req.id or str(uuid.uuid4())

    text_content = " ".join(
        p.text for p in req.message.parts if p.type == "text" and p.text
    )
    data_parts = [p.data for p in req.message.parts if p.type == "data" and p.data]
    data       = data_parts[0] if data_parts else {}
    skill      = detect_skill(text_content, req.metadata or {})

    create_task(task_id, skill, data)
    update_task(task_id, TaskState.WORKING)

    try:
        result = await execute_skill(skill, data)
        update_task(task_id, TaskState.COMPLETED, result)

        logger.info(
            "a2a_task_complete",
            extra={"custom_dimensions": {
                "event":   "a2a_task_success",
                "skill":   skill,
                "task_id": task_id,
            }}
        )

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
                {"name": f"{skill}_result", "parts": [{"type": "data", "data": result}]}
            ],
            "metadata": {
                "skill":      skill,
                "agent":      "VabGenRxOrchestrator",
                "version":    "3.0.0",
                "powered_by": "Microsoft Agent Framework"
            }
        }

    except Exception as e:
        error_msg = str(e)
        update_task(task_id, TaskState.FAILED, error=error_msg)

        logger.error(
            "a2a_task_failed",
            extra={"custom_dimensions": {
                "event":   "a2a_task_failed",
                "skill":   skill,
                "task_id": task_id,
                "error":   error_msg[:300],
            }}
        )
        print(f"❌ A2A task failed [{task_id}]: {error_msg}")
        raise HTTPException(
            status_code = 500,
            detail      = {"task_id": task_id, "skill": skill, "error": error_msg}
        )


@app.get("/a2a/tasks/{task_id}")
def a2a_task_get(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    return task


@app.get("/a2a/tasks")
def a2a_tasks_list():
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

# ── Voice Intelligence — Transcription + SOAP Note ───────────────────────────

@app.post("/agent/transcribe-summarize")
async def transcribe_and_summarize(
    request: Request,
    audio:   UploadFile = File(...),
):
    """
    Transcribes recorded doctor-patient audio and generates a
    diarized SOAP clinical note.

    Input:  multipart/form-data
            - audio: audio file (webm, mp4, wav, m4a, mp3)

    Output:
        {
          "transcript":          str,
          "diarized_transcript": [{"speaker": "Doctor"|"Patient", "text": "..."}, ...],
          "soap_note":           { subjective, objective, assessment, plan },
          "language_detected":   str
        }

    HIPAA:
        Audio is transmitted to Azure OpenAI Whisper.
        Requires BAA with Microsoft and abuse-monitoring opt-out
        on the Azure OpenAI resource before use with real patient data.
        All accesses are logged to phi_audit_log.
    """
    _check_ready()

    # ── Read uploaded audio ───────────────────────────────────────────────────
    audio_bytes = await audio.read()
    filename    = audio.filename or "recording.webm"

    if len(audio_bytes) < 1000:
        raise HTTPException(
            status_code = 400,
            detail      = "Audio too short. Minimum ~3 seconds of audio required."
        )

    # ── Extract request context for audit log ─────────────────────────────────
    ip_address = (
        request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        or (request.client.host if request.client else "")
    )
    user_id    = request.headers.get("X-User-Id",    "unknown")
    patient_id = request.headers.get("X-Patient-Id", "")
    session_id = str(uuid.uuid4())

    # ── HIPAA audit: log transcription access ─────────────────────────────────
    if audit:
        audit.log(
            action        = AuditAction.VOICE_TRANSCRIPTION,
            resource_type = ResourceType.VOICE_NOTE,
            user_id       = user_id,
            patient_id    = patient_id,
            ip_address    = ip_address,
            session_id    = session_id,
            endpoint      = "/agent/transcribe-summarize",
            http_method   = "POST",
            status_code   = 200,
            success       = True,
            detail        = f"Audio size: {len(audio_bytes)} bytes, file: {filename}",
        )

    # ── Run transcription + SOAP in thread pool ───────────────────────────────
    # TranscriptionService makes blocking HTTP calls to Azure OpenAI.
    # run_in_executor keeps the async event loop unblocked.
    try:
        loop   = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: transcription_service.transcribe_and_summarize(
                audio_bytes, filename
            )
        )

        if result.get("error") == "no_speech_detected":
            raise HTTPException(
                status_code = 422,
                detail      = "No speech detected in the recording. "
                              "Please check your microphone and try again."
            )

        logger.info(
            f"Transcription complete | user={user_id} | "
            f"lang={result.get('language_detected')} | "
            f"transcript_len={len(result.get('transcript', ''))}"
        )
        return result

    except HTTPException:
        raise
    except RuntimeError as e:
        if audit:
            audit.log(
                action        = AuditAction.VOICE_TRANSCRIPTION,
                resource_type = ResourceType.VOICE_NOTE,
                user_id       = user_id,
                patient_id    = patient_id,
                ip_address    = ip_address,
                session_id    = session_id,
                endpoint      = "/agent/transcribe-summarize",
                http_method   = "POST",
                status_code   = 500,
                success       = False,
                detail        = str(e),
            )
        logger.error(f"Transcription endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
