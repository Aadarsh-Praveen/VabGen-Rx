"""
VabGenRx Dosing Agent

Specialist agent responsible for generating FDA-based dosing
recommendations tailored to patient-specific clinical data.

Purpose
-------
The DosingAgent evaluates whether medication doses should be
adjusted based on patient characteristics such as renal
function, age, laboratory results, and comorbidities.

Capabilities
------------
• FDA label-based dose evaluation
• Detection of dose adjustment requirements
• Monitoring recommendations
• Parallel processing of medication analyses

Architecture Role
-----------------
The DosingAgent participates in both Round 1 and Round 2
analysis phases.

Round 1:
    Standard FDA-based dosing evaluation.

Round 2:
    Re-evaluates dosing when compounding risk signals
    indicate elevated patient risk.

Design Principle
----------------
The agent delegates dosing logic to DosingService to ensure
clinical rules remain centralized and maintainable.
"""

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List

from azure.ai.agents import AgentsClient

from .base_agent import _BaseAgent


class VabGenRxDosingAgent(_BaseAgent):
    """
    Generates FDA-based dosing recommendations with optional
    Round 2 re-evaluation when compounding signals are detected.
    """

    def __init__(
        self,
        client:   AgentsClient,
        model:    str,
        endpoint: str
    ):
        super().__init__(client, model, endpoint)

    # ── Round 1 ───────────────────────────────────────────────────────────────

    def analyze(
        self,
        medications:  List[str],
        patient_data: Dict,
        dose_map:     Dict
    ) -> Dict:
        """
        Round 1 — standard FDA-based dosing for each medication.
        Calls DosingService directly in parallel.
        No agent overhead for this step — direct service call.
        """
        from services.patient.dosing_service import DosingService
        svc = DosingService()

        print(f"\n   💊 VabGenRxDosingAgent Round 1: "
              f"{len(medications)} medications...")

        results = []

        # Run all dosing recommendations in parallel
        with ThreadPoolExecutor(
            max_workers=min(len(medications), 5)
        ) as ex:
            futures = {}
            for drug in medications:
                pd                 = dict(patient_data)
                pd["current_dose"] = dose_map.get(drug, "")
                pd["current_drug"] = drug
                futures[
                    ex.submit(
                        svc.get_dosing_recommendation,
                        drug,
                        pd
                    )
                ] = drug

            for future in as_completed(futures):
                drug = futures[future]
                try:
                    result = future.result()
                    results.append(result)
                except Exception as e:
                    print(f"   ⚠️  Dosing error for {drug}: {e}")
                    results.append({
                        "drug":                drug,
                        "current_dose":        dose_map.get(drug, ""),
                        "recommended_dose":    "Consult pharmacist",
                        "adjustment_required": False,
                        "adjustment_type":     "none",
                        "urgency":             "low",
                        "error":               str(e),
                        "from_cache":          False,
                    })

        return {"dosing_recommendations": results}

    # ── Round 2 ───────────────────────────────────────────────────────────────

    def re_evaluate(
        self,
        round1_results:      Dict,
        compounding_signals: Dict,
        medications:         List[str],
        patient_data:        Dict,
        dose_map:            Dict
    ) -> Dict:
        """
        Round 2 — re-evaluate dosing with compounding signal context.

        Injects compounding signals into patient_data via
        other_investigations — DosingService code is unchanged.
        GPT-4o inside DosingService sees all original patient data
        plus the compounding context and may adjust recommendations.
        """
        from services.patient.dosing_service import DosingService
        svc = DosingService()

        print(f"\n   💊 VabGenRxDosingAgent Round 2: "
              f"re-evaluating with compounding context...")

        # Build compounding context string
        signal_context = self._build_signal_context(
            compounding_signals
        )

        results = []
        round1_map = {
            r.get("drug", "").lower(): r
            for r in round1_results.get("dosing_recommendations", [])
        }

        with ThreadPoolExecutor(
            max_workers=min(len(medications), 5)
        ) as ex:
            futures = {}
            for drug in medications:
                # Copy all original patient data — nothing removed
                pd = dict(patient_data)
                pd["current_dose"] = dose_map.get(drug, "")
                pd["current_drug"] = drug

                # Inject compounding signals via other_investigations
                # DosingService._build_patient_context already
                # iterates other_investigations dynamically
                other = dict(pd.get("other_investigations", {}))
                other["compounding_signals"] = signal_context
                pd["other_investigations"]   = other

                futures[
                    ex.submit(
                        svc.get_dosing_recommendation,
                        drug,
                        pd
                    )
                ] = drug

            for future in as_completed(futures):
                drug = futures[future]
                try:
                    result = future.result()

                    # Mark round2 fields
                    round1 = round1_map.get(drug.lower(), {})

                    if (
                        result.get("recommended_dose")
                        != round1.get("recommended_dose")
                        or result.get("urgency")
                        != round1.get("urgency")
                    ):
                        result["round2_updated"] = True
                        result["round2_note"] = (
                            f"Recommendation updated based on "
                            f"compounding signals: "
                            f"{list(compounding_signals.keys())}"
                        )
                    else:
                        result["round2_updated"] = False
                        result["round2_note"]    = None

                    results.append(result)

                except Exception as e:
                    print(f"   ⚠️  Dosing Round 2 error "
                          f"for {drug}: {e}")
                    # Fallback to Round 1 result
                    if drug.lower() in round1_map:
                        results.append(round1_map[drug.lower()])

        # If Round 2 produced no results — return Round 1
        if not results:
            print("   ⚠️  Dosing Round 2 produced no results — "
                  "keeping Round 1")
            return round1_results

        return {"dosing_recommendations": results}

    # ── Signal Context Builder ────────────────────────────────────────────────

    def _build_signal_context(
        self,
        compounding_signals: Dict
    ) -> str:
        """
        Format compounding signals into text for injection
        into patient_data other_investigations.
        Dynamic — handles whatever signals were found.
        """
        if not compounding_signals:
            return ""

        parts = []
        for organ_system, signal_data in compounding_signals.items():
            sources = [
                f"{s.get('domain','').upper()}: "
                f"{s.get('drug','')} — {s.get('finding','')}"
                for s in signal_data.get("sources", [])
            ]
            parts.append(
                f"{organ_system.upper()} COMPOUNDING RISK "
                f"({signal_data.get('severity','').upper()}): "
                f"{signal_data.get('explanation','')} "
                f"Sources: {'; '.join(sources)}. "
                f"Re-evaluation note: "
                f"{signal_data.get('round2_instructions','')}"
            )

        return " | ".join(parts)