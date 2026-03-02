"""
VabGenRx — A2A (Agent-to-Agent) Protocol Service
Google A2A Protocol v0.2 — standard agent discovery and task execution.

Allows external AI agents to:
1. Discover VabGenRx capabilities via /.well-known/agent.json
2. Send clinical tasks via POST /a2a/tasks/send
3. Poll task status via GET /a2a/tasks/{task_id}

Each skill maps to an existing VabGenRx service — no new logic needed.
"""

import uuid
import json
from datetime import datetime, timezone
from typing import Dict, Optional


# ── In-memory task store (replace with Redis for production) ──────────────────
_tasks: Dict[str, Dict] = {}


# ── Agent Card — describes VabGenRx to external agents ────────────────────────

AGENT_CARD = {
    "schemaVersion": "0.2",
    "name": "VabGenRx Clinical Intelligence Agent",
    "description": (
        "A multi-agent clinical pharmacology platform powered by Microsoft Agent Framework. "
        "Analyzes drug-drug interactions, drug-disease contraindications, FDA-based dosing "
        "adjustments, and generates patient counseling in 100+ languages. "
        "Evidence sourced from PubMed (35M+ papers) and FDA adverse event database."
    ),
    "version": "2.0.0",
    "url": "https://vabgenrx.azurewebsites.net",
    "provider": {
        "name":         "VabGenRx Team",
        "url":          "https://github.com/Aadarsh-Praveen/VabGen-Rx",
        "contact":      "vabgenrx@team.com"
    },
    "capabilities": {
        "streaming":               False,
        "pushNotifications":       False,
        "stateTransitionHistory":  True,
        "authentication":          True,
    },
    "authentication": {
        "schemes": ["bearer"],
        "description": "JWT bearer token — obtain from POST /api/signin"
    },
    "skills": [
        {
            "id":          "drug_interaction_analysis",
            "name":        "Drug Interaction Analysis",
            "description": (
                "Analyzes drug-drug interactions using PubMed research and FDA adverse "
                "event database. Returns severity, mechanism, clinical effects, confidence "
                "score, and evidence tier. Results cached in Azure SQL."
            ),
            "tags":         ["pharmacology", "drug-safety", "clinical", "interactions"],
            "examples": [
                "Check interactions between warfarin and aspirin for a 70yo patient",
                "Are metformin and lisinopril safe to combine for a CKD patient?",
                "Analyze all interactions for: aspirin, dexamethasone, enalapril"
            ],
            "inputModes":  ["application/json"],
            "outputModes": ["application/json"],
            "inputSchema": {
                "type": "object",
                "required": ["medications"],
                "properties": {
                    "medications": {"type": "array", "items": {"type": "string"}},
                    "diseases":    {"type": "array", "items": {"type": "string"}},
                    "age":         {"type": "integer"},
                    "sex":         {"type": "string", "enum": ["male", "female", "unknown"]}
                }
            }
        },
        {
            "id":          "dosing_recommendation",
            "name":        "FDA-Based Dosing Recommendation",
            "description": (
                "Generates patient-specific dosing adjustments based on FDA drug labels, "
                "matched against patient labs (eGFR, TSH, potassium, bilirubin, etc.). "
                "Always fresh — never cached — since patient labs change frequently."
            ),
            "tags":         ["dosing", "fda", "renal", "hepatic", "pharmacokinetics"],
            "examples": [
                "What dose of metformin for a patient with eGFR 38?",
                "Adjust enalapril dose for 65yo male with CKD",
                "FDA dosing for dexamethasone in elderly patient"
            ],
            "inputModes":  ["application/json"],
            "outputModes": ["application/json"],
            "inputSchema": {
                "type": "object",
                "required": ["medications", "age", "sex"],
                "properties": {
                    "medications": {"type": "array", "items": {"type": "string"}},
                    "age":         {"type": "integer"},
                    "sex":         {"type": "string"},
                    "dose_map":    {"type": "object"},
                    "patient_labs": {
                        "type": "object",
                        "properties": {
                            "egfr":      {"type": "number"},
                            "potassium": {"type": "number"},
                            "tsh":       {"type": "number"},
                            "bilirubin": {"type": "number"}
                        }
                    }
                }
            }
        },
        {
            "id":          "patient_counseling",
            "name":        "Patient Counseling Generation",
            "description": (
                "Generates drug counseling (bleeding risk, timing, monitoring) and "
                "condition counseling (exercise, diet, lifestyle, safety) filtered by "
                "patient age, sex, and confirmed habits. Translates to 100+ languages."
            ),
            "tags":         ["counseling", "patient-education", "multilingual", "lifestyle"],
            "examples": [
                "Generate diabetes counseling in Tamil for a 65yo female",
                "Drug counseling for warfarin for a male who drinks alcohol",
                "Exercise and diet advice for hypertension in Spanish"
            ],
            "inputModes":  ["application/json"],
            "outputModes": ["application/json"],
            "inputSchema": {
                "type": "object",
                "required": ["age", "sex"],
                "properties": {
                    "medications":        {"type": "array", "items": {"type": "string"}},
                    "diseases":           {"type": "array", "items": {"type": "string"}},
                    "age":                {"type": "integer"},
                    "sex":                {"type": "string"},
                    "preferred_language": {"type": "string"},
                    "patient_profile": {
                        "type": "object",
                        "properties": {
                            "drinks_alcohol":     {"type": "boolean"},
                            "smokes":             {"type": "boolean"},
                            "has_kidney_disease": {"type": "boolean"}
                        }
                    }
                }
            }
        },
        {
            "id":          "full_safety_analysis",
            "name":        "Full Safety Analysis",
            "description": (
                "Runs all three specialist agents in parallel: "
                "VabGenRxSafetyAgent (drug-drug + food), "
                "VabGenRxDiseaseAgent (drug-disease), "
                "VabGenRxCounselingAgent (counseling + dosing). "
                "Returns complete clinical intelligence report."
            ),
            "tags":         ["safety", "full-analysis", "multi-agent", "comprehensive"],
            "examples": [
                "Complete safety analysis for aspirin, dexamethasone, enalapril in 65yo CKD patient",
                "Full clinical review for all medications with dosing and counseling"
            ],
            "inputModes":  ["application/json"],
            "outputModes": ["application/json"],
        }
    ],
    "defaultInputMode":  "application/json",
    "defaultOutputMode": "application/json",
}


# ── Task State Machine ────────────────────────────────────────────────────────

class TaskState:
    SUBMITTED  = "submitted"
    WORKING    = "working"
    COMPLETED  = "completed"
    FAILED     = "failed"


# ── Task Store Helpers ────────────────────────────────────────────────────────

def create_task(task_id: str, skill: str, data: Dict) -> Dict:
    task = {
        "id":         task_id,
        "skill":      skill,
        "status":     {"state": TaskState.SUBMITTED},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "input":      data,
        "artifacts":  []
    }
    _tasks[task_id] = task
    return task


def get_task(task_id: str) -> Optional[Dict]:
    return _tasks.get(task_id)


def update_task(task_id: str, state: str, result: Dict = None, error: str = None):
    if task_id not in _tasks:
        return
    _tasks[task_id]["status"]["state"] = state
    if result:
        _tasks[task_id]["artifacts"] = [
            {
                "name":  "result",
                "parts": [{"type": "data", "data": result}]
            }
        ]
        _tasks[task_id]["status"]["message"] = {
            "role":  "agent",
            "parts": [{"type": "data", "data": result}]
        }
    if error:
        _tasks[task_id]["status"]["error"] = error


# ── Skill Detection ───────────────────────────────────────────────────────────

def detect_skill(content: str, metadata: Dict) -> str:
    """
    Detect which skill to run from metadata or message content.
    Metadata takes priority — content is fallback for natural language.
    """
    # Explicit skill in metadata
    if metadata.get("skill"):
        return metadata["skill"]

    # Natural language detection
    content_lower = content.lower()

    if any(w in content_lower for w in ["full analysis", "complete analysis", "all agents", "full safety"]):
        return "full_safety_analysis"

    if any(w in content_lower for w in ["counsel", "advice", "exercise", "diet", "lifestyle", "patient education"]):
        return "patient_counseling"

    if any(w in content_lower for w in ["dose", "dosing", "adjust", "egfr", "renal", "fda label"]):
        return "dosing_recommendation"

    # Default — drug interaction is most common
    return "drug_interaction_analysis"


# ── Skill Executor ────────────────────────────────────────────────────────────

async def execute_skill(skill: str, data: Dict) -> Dict:
    """
    Route A2A task to the appropriate VabGenRx service.
    Each skill maps directly to an existing service — no new logic.
    """

    if skill == "full_safety_analysis":
        from services.vabgenrx_agent import VabGenRxOrchestrator
        orchestrator = VabGenRxOrchestrator()
        return orchestrator.analyze(
            medications     = data.get("medications", []),
            diseases        = data.get("diseases", []),
            age             = data.get("age", 45),
            sex             = data.get("sex", "unknown"),
            dose_map        = data.get("dose_map", {}),
            patient_profile = data.get("patient_profile", {}),
            patient_data    = data.get("patient_labs", {}),
        )

    elif skill == "drug_interaction_analysis":
        from services.vabgenrx_agent import VabGenRxOrchestrator
        orchestrator = VabGenRxOrchestrator()
        result = orchestrator.analyze(
            medications = data.get("medications", []),
            diseases    = data.get("diseases", []),
            age         = data.get("age", 45),
            sex         = data.get("sex", "unknown"),
        )
        # Return only interaction data — not full analysis
        analysis = result.get("analysis", {})
        return {
            "drug_drug":    analysis.get("drug_drug", []),
            "drug_disease": analysis.get("drug_disease", []),
            "drug_food":    analysis.get("drug_food", []),
            "risk_summary": analysis.get("risk_summary", {}),
        }

    elif skill == "dosing_recommendation":
        from services.dosing_service import DosingService
        svc          = DosingService()
        patient_data = data.get("patient_labs", {})
        patient_data.update({
            "age":        data.get("age", 45),
            "sex":        data.get("sex", "unknown"),
            "conditions": data.get("diseases", []),
        })
        dose_map = data.get("dose_map", {})
        results  = []
        for drug in data.get("medications", []):
            pd                 = dict(patient_data)
            pd["current_dose"] = dose_map.get(drug, "not specified")
            pd["current_drug"] = drug
            results.append(svc.get_dosing_recommendation(drug=drug, patient_data=pd))
        return {"dosing_recommendations": results}

    elif skill == "patient_counseling":
        from services.counselling_service import DrugCounselingService
        from services.condition_service   import ConditionCounselingService
        from services.translation_service import TranslationService

        drug_svc  = DrugCounselingService()
        cond_svc  = ConditionCounselingService()
        trans_svc = TranslationService()
        lang      = data.get("preferred_language")
        profile   = data.get("patient_profile", {})
        age       = data.get("age", 45)
        sex       = data.get("sex", "unknown")

        drug_results = drug_svc.get_counseling_for_all_drugs(
            medications     = data.get("medications", []),
            age             = age,
            sex             = sex,
            conditions      = data.get("diseases", []),
            patient_profile = profile,
        ) if data.get("medications") else []

        cond_results = cond_svc.get_counseling_for_all_conditions(
            conditions      = data.get("diseases", []),
            age             = age,
            sex             = sex,
            medications     = data.get("medications", []),
            patient_profile = profile,
        ) if data.get("diseases") else []

        # Translate if needed
        if lang and trans_svc.needs_translation(lang):
            drug_results = [trans_svc.translate_drug_counseling(r, lang) for r in drug_results]
            cond_results = [trans_svc.translate_condition_counseling(r, lang) for r in cond_results]

        return {
            "drug_counseling":      drug_results,
            "condition_counseling": cond_results,
        }

    raise ValueError(f"Unknown skill: {skill}")