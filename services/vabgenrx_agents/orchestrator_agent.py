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
• Azure AI Content Safety scan on all output text
• OpenTelemetry trace correlation via session_id

Architecture Role
-----------------
The OrchestratorAgent executes in the final phase of the
VabGenRx workflow:

Phase 1: Evidence gathering
Phase 2: Specialist agent synthesis
Phase 3: Compounding signal detection
Phase 4: Optional Round 2 specialist re-evaluation
Phase 5: Patient counseling
Phase 6: Orchestrator synthesis + Content Safety scan

Output
------
Produces a unified clinical intelligence report including:

• risk_level classification
• prescriber clinical summary (Content Safety scanned)
• detected compounding patterns
• prioritized clinical actions (Content Safety scanned)
• aggregated evidence metrics
• trace_session_id for OpenTelemetry correlation

HIPAA Note on Trace Correlation
--------------------------------
session_id is a UUID generated per analysis request in
agentApi.js. It is not PHI — it contains no patient
identifiers. It is safe to include in traces and logs.
Raw patient IDs (IP_No / OP_No) are never passed here —
they are SHA-256 hashed in the HIPAA audit middleware
before any storage.
"""

import json
import logging
from typing import Dict, List

from azure.ai.agents import AgentsClient

from .base_agent          import _BaseAgent
from services.content_safety import ClinicalContentSafety

logger = logging.getLogger("vabgenrx")


class VabGenRxOrchestratorAgent(_BaseAgent):
    """
    Cross-domain clinical reasoning agent.

    Receives all specialist agent results and:
    - Identifies compounding risk patterns across domains
    - Prioritizes clinical actions by urgency
    - Generates unified clinical summary
    - Scans all output through Azure AI Content Safety (single call)
    - Correlates traces via session_id for observability
    """

    def __init__(
        self,
        client:   AgentsClient,
        model:    str,
        endpoint: str
    ):
        super().__init__(client, model, endpoint)
        self.content_safety = ClinicalContentSafety()

    # ── Public ────────────────────────────────────────────────────────────────

    def synthesize(
        self,
        safety_result:       Dict,
        disease_result:      Dict,
        dosing_result:       Dict,
        counselling_result:  Dict,
        compounding_signals: Dict,
        patient_context:     Dict,
        session_id:          str = ""
    ) -> Dict:
        """
        Synthesize cross-domain clinical intelligence from all
        specialist agent results.

        Args:
            safety_result:       Drug-drug and food interaction results.
            disease_result:      Drug-disease contraindication results.
            dosing_result:       FDA-based dosing recommendations.
            counselling_result:  Patient counselling outputs.
            compounding_signals: Organ-system overlap signals.
            patient_context:     Age, sex, labs, conditions.
            session_id:          UUID for trace correlation. Not PHI.

        Returns:
            Enhanced risk_summary with clinical_summary,
            compounding_patterns, priority_actions, risk_level,
            evidence_summary, and trace_session_id.
        """
        print(f"\n   🧠 VabGenRxOrchestratorAgent: "
              f"cross-domain synthesis "
              f"[session={session_id[:8] if session_id else 'none'}]")

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
3. Prioritize clinical actions — what must happen first
4. Generate a clinical summary for a senior prescriber
5. Determine risk level based on the COMBINED picture

EVIDENCE-BASED REASONING:
- Only reason about findings from the specialist agents
- Do not introduce new interactions or contraindications

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

        if not result:
            logger.error(
                "orchestrator_fallback",
                extra={"custom_dimensions": {
                    "event":         "orchestrator_fallback",
                    "session_id":    session_id,
                    "ddi_count":     len(safety_result.get("drug_drug", [])),
                    "disease_count": len(disease_result.get("drug_disease", [])),
                    "dosing_count":  len(dosing_result.get("dosing_recommendations", [])),
                    "signals_count": len(compounding_signals),
                }}
            )
            print("   ⚠️  Orchestrator Agent failed — "
                  "returning basic risk summary")
            return self._build_fallback_summary(
                safety_result,
                disease_result,
                dosing_result,
                compounding_signals,
                session_id
            )

        # ── Azure AI Content Safety scan ──────────────────────────
        # Combines clinical_summary and priority_actions into one
        # API call to reduce latency. session_id is a UUID — not PHI.
        clinical_summary = result.get("clinical_summary", "")
        priority_actions = result.get("priority_actions", [])

        actions_text = " ".join([
            f"{a.get('action', '')} {a.get('reason', '')}"
            for a in priority_actions
        ])
        combined_text = f"{clinical_summary} {actions_text}".strip()

        if combined_text:
            is_safe, _ = self.content_safety.scan_clinical_summary(
                combined_text, session_id
            )
            if not is_safe:
                print("   🚫 Content Safety blocked output "
                      "— using fallback")
                return self._build_fallback_summary(
                    safety_result,
                    disease_result,
                    dosing_result,
                    compounding_signals,
                    session_id
                )

        # ── Attach trace correlation ID ───────────────────────────
        # session_id is a UUID — not PHI. Allows matching this
        # orchestrator output to the originating request trace
        # in Application Insights and Foundry portal.
        result["trace_session_id"] = session_id

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
        Strips large text fields to keep LLM context focused.
        """
        ddi_summary = []
        for item in safety_result.get("drug_drug", []):
            ddi_summary.append({
                "pair":       f"{item.get('drug1')}+{item.get('drug2')}",
                "severity":   item.get("severity"),
                "mechanism":  item.get("mechanism", "")[:200],
                "confidence": item.get("confidence"),
                "evidence":   item.get("evidence", {}),
            })

        dd_summary = []
        for item in disease_result.get("drug_disease", []):
            dd_summary.append({
                "pair":            f"{item.get('drug')}+{item.get('disease')}",
                "contraindicated": item.get("contraindicated"),
                "severity":        item.get("severity"),
                "evidence":        item.get("clinical_evidence", "")[:200],
                "round2_updated":  item.get("round2_updated", False),
                "confidence":      item.get("confidence"),
            })

        dose_summary = []
        for item in dosing_result.get("dosing_recommendations", []):
            dose_summary.append({
                "drug":                item.get("drug"),
                "adjustment_required": item.get("adjustment_required"),
                "adjustment_type":     item.get("adjustment_type"),
                "urgency":             item.get("urgency"),
                "current_dose":        item.get("current_dose"),
                "recommended_dose":    item.get("recommended_dose"),
                "round2_updated":      item.get("round2_updated", False),
                "patient_flags":       item.get("evidence", {}).get(
                    "patient_flags_used", []
                ),
            })

        return {
            "drug_drug":    ddi_summary,
            "drug_disease": dd_summary,
            "dosing":       dose_summary,
            "patient": {
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
        compounding_signals: Dict,
        session_id:          str = ""
    ) -> Dict:
        """
        Basic risk summary used when OrchestratorAgent fails or
        Content Safety blocks the generated output.
        Ensures the pipeline always returns a valid response.
        """
        all_ddi  = safety_result.get("drug_drug", [])
        all_dd   = disease_result.get("drug_disease", [])
        all_dose = dosing_result.get("dosing_recommendations", [])

        severe_count   = sum(1 for r in all_ddi if r.get("severity") == "severe")
        mod_count      = sum(1 for r in all_ddi if r.get("severity") == "moderate")
        contra_count   = sum(1 for r in all_dd  if r.get("contraindicated"))
        dose_adj_count = sum(1 for r in all_dose if r.get("adjustment_required"))

        risk_level = (
            "HIGH"     if severe_count > 0 or contra_count > 0 else
            "MODERATE" if mod_count > 0 else
            "LOW"
        )

        return {
            "risk_level":           risk_level,
            "clinical_summary":     (
                "Analysis complete. Review specialist findings above."
            ),
            "compounding_patterns": [],
            "priority_actions":     [],
            "trace_session_id":     session_id,
            "evidence_summary": {
                "total_pubmed_papers":          0,
                "total_fda_reports":            0,
                "total_fda_serious_reports":    0,
                "total_fda_label_sections":     0,
                "drug_drug_pairs_analyzed":     len(all_ddi),
                "drug_disease_pairs_analyzed":  len(all_dd),
                "dosing_adjustments_required":  dose_adj_count,
                "compounding_signals_detected": len(compounding_signals),
                "round2_updates": sum(
                    1 for r in all_dd if r.get("round2_updated")
                ),
            },
        }