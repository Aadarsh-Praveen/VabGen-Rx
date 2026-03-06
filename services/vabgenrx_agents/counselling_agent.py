"""
VabGenRx — Counselling Agent
Specialist agent for patient-specific drug and condition counselling.

CHANGED from original:
- No tool calls — calls services directly
- Dosing responsibility moved to VabGenRxDosingAgent
- Receives confirmed interaction results and compounding signals
  so counselling is aware of what specialist agents found
- Same JSON output structure as before plus evidence counts
"""

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List

from azure.ai.agents import AgentsClient

from .base_agent import _BaseAgent


class VabGenRxCounsellingAgent(_BaseAgent):
    """
    Generates patient-specific drug and condition counselling.

    Receives confirmed interaction results and compounding signals
    as context — counselling reflects the full clinical picture
    rather than being generated in isolation.
    """

    def __init__(
        self,
        client:   AgentsClient,
        model:    str,
        endpoint: str
    ):
        super().__init__(client, model, endpoint)

    # ── Public ────────────────────────────────────────────────────────────────

    def analyze(
        self,
        medications:          List[str],
        diseases:             List[str],
        age:                  int,
        sex:                  str,
        dose_map:             Dict,
        patient_profile:      Dict,
        compounding_signals:  Dict,
        safety_result:        Dict,
        disease_result:       Dict
    ) -> Dict:
        """
        Generate drug and condition counselling with full
        awareness of confirmed interactions and compounding risks.

        Calls DrugCounselingService and ConditionCounselingService
        directly — no agent wrapper for these calls.
        """
        from services.patient.counselling_service import (
            DrugCounselingService
        )
        from services.patient.condition_service import (
            ConditionCounselingService
        )

        drug_svc = DrugCounselingService()
        cond_svc = ConditionCounselingService()

        print(f"\n   💊 VabGenRxCounsellingAgent: "
              f"{len(medications)} drugs, "
              f"{len(diseases)} conditions...")

        # Build compounding context for services
        compounding_context = self._build_compounding_context(
            compounding_signals,
            safety_result,
            disease_result
        )

        # Run drug counselling and condition counselling in parallel
        drug_results = []
        cond_results = []

        with ThreadPoolExecutor(max_workers=2) as ex:

            drug_future = ex.submit(
                self._run_drug_counselling,
                drug_svc,
                medications,
                age,
                sex,
                dose_map,
                diseases,
                patient_profile,
                compounding_context
            )

            cond_future = ex.submit(
                self._run_condition_counselling,
                cond_svc,
                diseases,
                age,
                sex,
                medications,
                patient_profile,
                compounding_context
            )

            drug_results = drug_future.result()
            cond_results = cond_future.result()

        return {
            "drug_counseling":      drug_results,
            "condition_counseling": cond_results,
        }

    # ── Drug Counselling ──────────────────────────────────────────────────────

    def _run_drug_counselling(
        self,
        svc:                  object,
        medications:          List[str],
        age:                  int,
        sex:                  str,
        dose_map:             Dict,
        diseases:             List[str],
        patient_profile:      Dict,
        compounding_context:  str
    ) -> List[Dict]:
        """
        Run drug counselling for all medications.
        Injects compounding context via patient_profile
        so DrugCounselingService code is unchanged.
        """
        profile_with_context = dict(patient_profile)
        if compounding_context:
            profile_with_context[
                "compounding_context"
            ] = compounding_context

        results = []
        for drug in medications:
            try:
                result = svc.get_drug_counseling(
                    drug            = drug,
                    age             = age,
                    sex             = sex,
                    dose            = dose_map.get(drug, ""),
                    conditions      = diseases,
                    patient_profile = profile_with_context
                )
                # Add evidence count
                result["evidence_count"] = {
                    "fda_label_sections_used": len(
                        result.get("counseling_points", [])
                    ),
                    "patient_profile_flags_applied": [
                        k for k, v in patient_profile.items()
                        if v is True
                    ],
                    "compounding_signals_applied": (
                        list(
                            result.get(
                                "compounding_signals_applied", []
                            )
                        )
                    ),
                    "counseling_points_total": len(
                        result.get("counseling_points", [])
                    ),
                }
                results.append(result)
            except Exception as e:
                print(f"   ⚠️  Drug counselling error "
                      f"for {drug}: {e}")

        return results

    # ── Condition Counselling ─────────────────────────────────────────────────

    def _run_condition_counselling(
        self,
        svc:                  object,
        diseases:             List[str],
        age:                  int,
        sex:                  str,
        medications:          List[str],
        patient_profile:      Dict,
        compounding_context:  str
    ) -> List[Dict]:
        """
        Run condition counselling for all diseases.
        Injects compounding context via patient_profile.
        """
        profile_with_context = dict(patient_profile)
        if compounding_context:
            profile_with_context[
                "compounding_context"
            ] = compounding_context

        results = []
        for condition in diseases:
            try:
                result = svc.get_condition_counseling(
                    condition       = condition,
                    age             = age,
                    sex             = sex,
                    medications     = medications,
                    patient_profile = profile_with_context
                )
                # Add evidence count
                result["evidence_count"] = {
                    "patient_profile_flags_applied": [
                        k for k, v in patient_profile.items()
                        if v is True
                    ],
                    "compounding_signals_applied": (
                        list(
                            result.get(
                                "compounding_signals_applied", []
                            )
                        )
                    ),
                    "exercise_points": len(
                        result.get("exercise", [])
                    ),
                    "diet_points": len(
                        result.get("diet", [])
                    ),
                    "lifestyle_points": len(
                        result.get("lifestyle", [])
                    ),
                    "safety_points": len(
                        result.get("safety", [])
                    ),
                    "total_counseling_points": (
                        len(result.get("exercise",  [])) +
                        len(result.get("diet",      [])) +
                        len(result.get("lifestyle", [])) +
                        len(result.get("safety",    []))
                    ),
                }
                results.append(result)
            except Exception as e:
                print(f"   ⚠️  Condition counselling error "
                      f"for {condition}: {e}")

        return results

    # ── Context Builder ───────────────────────────────────────────────────────

    def _build_compounding_context(
        self,
        compounding_signals: Dict,
        safety_result:       Dict,
        disease_result:      Dict
    ) -> str:
        """
        Build compounding context string for injection into
        counselling services.
        Dynamic — handles whatever signals were found.
        """
        if not compounding_signals:
            return ""

        parts = []

        for organ_system, signal_data in compounding_signals.items():
            parts.append(
                f"{organ_system.upper()} COMPOUNDING RISK: "
                f"{signal_data.get('explanation', '')} "
                f"({signal_data.get('signal_count', 0)} "
                f"independent signals)"
            )

        # Add severe interactions context
        severe_ddis = [
            i for i in safety_result.get("drug_drug", [])
            if i.get("severity") == "severe"
        ]
        if severe_ddis:
            severe_str = ", ".join([
                f"{i['drug1']}+{i['drug2']}"
                for i in severe_ddis
            ])
            parts.append(
                f"SEVERE DRUG INTERACTIONS CONFIRMED: {severe_str}"
            )

        # Add contraindications context
        contraindicated = [
            i for i in disease_result.get("drug_disease", [])
            if i.get("contraindicated")
        ]
        if contraindicated:
            contra_str = ", ".join([
                f"{i['drug']}+{i['disease']}"
                for i in contraindicated
            ])
            parts.append(
                f"CONTRAINDICATIONS CONFIRMED: {contra_str}"
            )

        return " | ".join(parts)