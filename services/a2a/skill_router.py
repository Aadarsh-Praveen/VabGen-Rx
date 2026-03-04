"""
VabGenRx — A2A Skill Router
Detects which skill to run from incoming A2A task messages
and routes execution to the appropriate VabGenRx service.

EXTRACTED from a2a_service.py
Updated imports to reflect new folder structure.
Logic identical to original.
"""

from typing import Dict


# ── Skill Detection ───────────────────────────────────────────────────────────

def detect_skill(content: str, metadata: Dict) -> str:
    """
    Detect which skill to run from metadata or message content.
    Metadata takes priority — content is fallback for natural
    language requests.
    """
    # Explicit skill in metadata
    if metadata.get("skill"):
        return metadata["skill"]

    # Natural language detection
    content_lower = content.lower()

    if any(
        w in content_lower
        for w in [
            "full analysis", "complete analysis",
            "all agents", "full safety"
        ]
    ):
        return "full_safety_analysis"

    if any(
        w in content_lower
        for w in [
            "counsel", "advice", "exercise",
            "diet", "lifestyle", "patient education"
        ]
    ):
        return "patient_counseling"

    if any(
        w in content_lower
        for w in [
            "dose", "dosing", "adjust",
            "egfr", "renal", "fda label"
        ]
    ):
        return "dosing_recommendation"

    # Default — drug interaction is most common
    return "drug_interaction_analysis"


# ── Skill Executor ────────────────────────────────────────────────────────────

async def execute_skill(skill: str, data: Dict) -> Dict:
    """
    Route A2A task to the appropriate VabGenRx service.
    Updated imports reflect new folder structure.
    Logic identical to original.
    """

    if skill == "full_safety_analysis":
        from services.vabgenrx_agents import VabGenRxOrchestrator
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
        from services.vabgenrx_agents import VabGenRxOrchestrator
        orchestrator = VabGenRxOrchestrator()
        result       = orchestrator.analyze(
            medications = data.get("medications", []),
            diseases    = data.get("diseases", []),
            age         = data.get("age", 45),
            sex         = data.get("sex", "unknown"),
        )
        analysis = result.get("analysis", {})
        return {
            "drug_drug":            analysis.get("drug_drug",    []),
            "drug_disease":         analysis.get("drug_disease", []),
            "drug_food":            analysis.get("drug_food",    []),
            "compounding_signals":  analysis.get(
                "compounding_signals", {}
            ),
            "risk_summary":         analysis.get("risk_summary", {}),
        }

    elif skill == "dosing_recommendation":
        from services.patient.dosing_service import DosingService
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
            pd["current_dose"] = dose_map.get(
                drug, "not specified"
            )
            pd["current_drug"] = drug
            results.append(
                svc.get_dosing_recommendation(
                    drug=drug, patient_data=pd
                )
            )
        return {"dosing_recommendations": results}

    elif skill == "patient_counseling":
        from services.patient.counselling_service import (
            DrugCounselingService
        )
        from services.patient.condition_service import (
            ConditionCounselingService
        )
        from services.translation.translation_service import (
            TranslationService
        )

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

        if lang and trans_svc.needs_translation(lang):
            drug_results = [
                trans_svc.translate_drug_counseling(r, lang)
                for r in drug_results
            ]
            cond_results = [
                trans_svc.translate_condition_counseling(r, lang)
                for r in cond_results
            ]

        return {
            "drug_counseling":      drug_results,
            "condition_counseling": cond_results,
        }

    raise ValueError(f"Unknown skill: {skill}")