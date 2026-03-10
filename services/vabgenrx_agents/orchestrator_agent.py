"""
VabGenRx Orchestrator Agent

Cross-domain clinical reasoning agent that synthesizes the
outputs of all specialist agents into a unified clinical
intelligence report.

Purpose
-------
The OrchestratorAgent performs higher-level reasoning across
multiple specialist domains to identify compounding risk
patterns that cannot be detected by any single agent.

Inputs
------
• SafetyAgent interaction results
• DiseaseAgent contraindication results
• DosingAgent dose adjustment recommendations
• CounsellingAgent patient guidance
• Compounding signals detected by the SignalExtractor
• Patient context information

Capabilities
------------
• Cross-domain clinical reasoning
• Identification of compounding risk patterns
• Prioritization of clinical actions
• Unified clinical summary generation
• Evidence aggregation across domains

Architecture Role
-----------------
The OrchestratorAgent executes in the final phase of the
VabGenRx workflow:

Phase 1: Evidence gathering
Phase 2: Specialist agent synthesis
Phase 3: Compounding signal detection
Phase 4: Optional Round 2 specialist re-evaluation
Phase 5: Patient counseling
Phase 6: Orchestrator synthesis

Output
------
Produces a unified clinical intelligence report including:

• risk_level classification
• prescriber clinical summary
• detected compounding patterns
• prioritized clinical actions
• aggregated evidence metrics
"""

import json
import logging
from typing import Dict, List

from azure.ai.agents import AgentsClient

from .base_agent import _BaseAgent

# Shared logger — Application Insights handler attached in app.py
logger = logging.getLogger("vabgenrx")


class VabGenRxOrchestratorAgent(_BaseAgent):
    """
    Cross-domain clinical reasoning agent.

    Receives all specialist agent results and:
    - Identifies compounding risk patterns across domains
    - Prioritizes clinical actions by urgency
    - Generates unified clinical summary
    - Produces risk_summary informed by compounding context
      not just individual counts
    """

    def __init__(
        self,
        client:   AgentsClient,
        model:    str,
        endpoint: str
    ):
        super().__init__(client, model, endpoint)

    # ── Public ────────────────────────────────────────────────────────────────

    def synthesize(
        self,
        safety_result:       Dict,
        disease_result:      Dict,
        dosing_result:       Dict,
        counselling_result:  Dict,
        compounding_signals: Dict,
        patient_context:     Dict
    ) -> Dict:
        """
        Synthesize cross-domain clinical intelligence from all
        specialist agent results.

        Returns enhanced risk_summary with:
        - clinical_summary: unified narrative for prescriber
        - compounding_patterns: named risk patterns detected
        - priority_actions: ranked list of what to do first
        - risk_level: informed by compounding, not just counts
        - evidence_summary: total evidence counts across all sections
        """
        print(f"\n   🧠 VabGenRxOrchestratorAgent: "
              f"cross-domain synthesis...")

        # Build compact summary of all results for LLM
        results_summary = self._build_results_summary(
            safety_result,
            disease_result,
            dosing_result,
            counselling_result,
            compounding_signals,
            patient_context
        )

        instructions = f"""
You are VabGenRxOrchestratorAgent, a senior clinical pharmacologist
performing cross-domain risk synthesis.

You have received results from three independent specialist agents:
- VabGenRxSafetyAgent: drug-drug and drug-food interactions
- VabGenRxDiseaseAgent: drug-disease contraindications
- VabGenRxDosingAgent: FDA-based dosing adjustments

Your task is to reason across ALL of these findings together
and produce a unified clinical intelligence report.

ALL SPECIALIST FINDINGS:
{json.dumps(results_summary, indent=2)}

COMPOUNDING SIGNALS ALREADY DETECTED:
{json.dumps(compounding_signals, indent=2)}

PATIENT CONTEXT:
{json.dumps(patient_context, indent=2)}

YOUR TASK:
1. Review all findings holistically — not as separate lists
2. Identify the most clinically significant compounding patterns
   (the signals above are a starting point — you may identify
   additional patterns the signal extractor missed)
3. Prioritize clinical actions — what must happen first,
   what is urgent but not immediate, what is routine
4. Generate a clinical summary that a senior prescriber would
   find useful — not a list of findings but a clinical narrative
5. Determine risk level based on the COMBINED picture,
   not just individual severity counts

EVIDENCE-BASED REASONING:
- Only reason about findings that came from the specialist agents
- Do not introduce new interactions or contraindications
- If you identify a compounding pattern not in the signals,
  explain specifically which findings from the specialists
  support it

Return ONLY valid JSON:
{{
  "risk_level": "CRITICAL|HIGH|MODERATE|LOW",
  "clinical_summary": "narrative for prescriber — not a list",
  "compounding_patterns": [
    {{
      "pattern_name": "...",
      "organs_involved": [],
      "severity": "critical|high|moderate",
      "explanation": "...",
      "contributing_findings": []
    }}
  ],
  "priority_actions": [
    {{
      "rank":    1,
      "action":  "...",
      "reason":  "...",
      "urgency": "URGENT|HIGH|MODERATE|ROUTINE"
    }}
  ],
  "evidence_summary": {{
    "total_pubmed_papers":            0,
    "total_fda_reports":              0,
    "total_fda_serious_reports":      0,
    "total_fda_label_sections":       0,
    "drug_drug_pairs_analyzed":       0,
    "drug_disease_pairs_analyzed":    0,
    "dosing_adjustments_required":    0,
    "compounding_signals_detected":   0,
    "round2_updates":                 0
  }}
}}
"""

        content = (
            "Synthesize cross-domain clinical intelligence "
            "from all specialist agent results.\n"
            "Return JSON only."
        )

        result = self._run(
            "VabGenRxOrchestratorAgent",
            instructions,
            content
        )

        # Fallback — if orchestrator fails return basic summary
        if not result:
            # ── Alert 9: Orchestrator fallback triggered ───────────
            # When this fires, the doctor gets a basic risk summary
            # instead of full cross-domain clinical intelligence.
            # Compounding patterns and priority actions are empty.
            # This is a silent quality degradation — this alert
            # means you know when it happens.
            logger.error(
                "orchestrator_fallback",
                extra={"custom_dimensions": {
                    "event":         "orchestrator_fallback",
                    "ddi_count":     len(
                        safety_result.get("drug_drug", [])
                    ),
                    "disease_count": len(
                        disease_result.get("drug_disease", [])
                    ),
                    "dosing_count":  len(
                        dosing_result.get(
                            "dosing_recommendations", []
                        )
                    ),
                    "signals_count": len(compounding_signals),
                }}
            )
            print("   ⚠️  Orchestrator Agent failed — "
                  "returning basic risk summary")
            return self._build_fallback_summary(
                safety_result,
                disease_result,
                dosing_result,
                compounding_signals
            )

        return result

    # ── Results Summary Builder ───────────────────────────────────────────────

    def _build_results_summary(
        self,
        safety_result:       Dict,
        disease_result:      Dict,
        dosing_result:       Dict,
        counselling_result:  Dict,
        compounding_signals: Dict,
        patient_context:     Dict
    ) -> Dict:
        """
        Build compact summary of all specialist results.
        Strips large text fields to keep context focused.
        Includes key clinical data only.
        """

        # Drug-drug summary — key fields only
        ddi_summary = []
        for item in safety_result.get("drug_drug", []):
            ddi_summary.append({
                "pair":       f"{item.get('drug1')}+{item.get('drug2')}",
                "severity":   item.get("severity"),
                "mechanism":  item.get("mechanism", "")[:200],
                "confidence": item.get("confidence"),
                "evidence":   item.get("evidence", {}),
            })

        # Drug-disease summary
        dd_summary = []
        for item in disease_result.get("drug_disease", []):
            dd_summary.append({
                "pair":            (
                    f"{item.get('drug')}+{item.get('disease')}"
                ),
                "contraindicated": item.get("contraindicated"),
                "severity":        item.get("severity"),
                "evidence":        item.get("clinical_evidence",
                                            "")[:200],
                "round2_updated":  item.get("round2_updated", False),
                "confidence":      item.get("confidence"),
            })

        # Dosing summary
        dose_summary = []
        for item in dosing_result.get("dosing_recommendations", []):
            dose_summary.append({
                "drug":               item.get("drug"),
                "adjustment_required": item.get(
                    "adjustment_required"
                ),
                "adjustment_type":    item.get("adjustment_type"),
                "urgency":            item.get("urgency"),
                "current_dose":       item.get("current_dose"),
                "recommended_dose":   item.get("recommended_dose"),
                "round2_updated":     item.get("round2_updated",
                                               False),
                "patient_flags":      item.get(
                    "evidence", {}
                ).get("patient_flags_used", []),
            })

        return {
            "drug_drug":    ddi_summary,
            "drug_disease": dd_summary,
            "dosing":       dose_summary,
            "patient":      {
                "age":        patient_context.get("age"),
                "sex":        patient_context.get("sex"),
                "conditions": patient_context.get("conditions", []),
                "egfr":       patient_context.get("egfr"),
                "potassium":  patient_context.get("potassium"),
                "bilirubin":  patient_context.get("bilirubin"),
            },
        }

    # ── Fallback ──────────────────────────────────────────────────────────────

    def _build_fallback_summary(
        self,
        safety_result:       Dict,
        disease_result:      Dict,
        dosing_result:       Dict,
        compounding_signals: Dict
    ) -> Dict:
        """
        Basic risk summary if Orchestrator Agent fails.
        Same structure as original risk_summary.
        Ensures pipeline never fails because of orchestrator.
        """
        all_ddi  = safety_result.get("drug_drug", [])
        all_dd   = disease_result.get("drug_disease", [])
        all_dose = dosing_result.get("dosing_recommendations", [])

        severe_count   = sum(
            1 for r in all_ddi if r.get("severity") == "severe"
        )
        mod_count      = sum(
            1 for r in all_ddi if r.get("severity") == "moderate"
        )
        contra_count   = sum(
            1 for r in all_dd if r.get("contraindicated")
        )
        dose_adj_count = sum(
            1 for r in all_dose if r.get("adjustment_required")
        )

        risk_level = (
            "HIGH"     if severe_count > 0 or contra_count > 0 else
            "MODERATE" if mod_count > 0 else
            "LOW"
        )

        return {
            "risk_level":                  risk_level,
            "clinical_summary":            (
                "Analysis complete. Review specialist findings above."
            ),
            "compounding_patterns":        [],
            "priority_actions":            [],
            "evidence_summary": {
                "total_pubmed_papers":         0,
                "total_fda_reports":           0,
                "total_fda_serious_reports":   0,
                "total_fda_label_sections":    0,
                "drug_drug_pairs_analyzed":    len(all_ddi),
                "drug_disease_pairs_analyzed": len(all_dd),
                "dosing_adjustments_required": dose_adj_count,
                "compounding_signals_detected": len(
                    compounding_signals
                ),
                "round2_updates": sum(
                    1 for r in all_dd
                    if r.get("round2_updated")
                ),
            },
        }