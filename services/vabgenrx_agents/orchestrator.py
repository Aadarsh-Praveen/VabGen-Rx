"""
VabGenRx Orchestrator

Central coordination layer for the VabGenRx multi-agent
clinical reasoning system.

Purpose
-------
The orchestrator manages the full clinical analysis pipeline,
coordinating evidence services, specialist agents, and
cross-domain reasoning.

Workflow Architecture
---------------------
The system executes six phases:

Phase 1 — Evidence Gathering
    Parallel retrieval of interaction and contraindication
    evidence from PubMed and FDA sources.

Phase 2 — Round 1 Specialist Analysis
    SafetyAgent, DiseaseAgent, and DosingAgent independently
    synthesize their domain-specific findings.

Phase 3 — Signal Extraction
    Python-based analysis detects compounding risk patterns
    across specialist outputs.

Phase 4 — Round 2 Re-evaluation
    Specialists re-analyze cases when compounding signals
    indicate elevated clinical risk.

Phase 5 — Patient Counseling
    Drug and condition counseling services generate
    patient-specific guidance.

Phase 6 — Orchestrator Synthesis
    Cross-domain reasoning produces the final clinical
    intelligence report. Output is scanned through Azure AI
    Content Safety before reaching the prescriber. A session_id
    UUID is attached for OpenTelemetry trace correlation.

Architecture Benefits
---------------------
• Parallel evidence gathering improves latency
• Modular specialist agents improve maintainability
• Conditional Round 2 analysis reduces unnecessary computation
• Cross-domain orchestration enables detection of complex
  polypharmacy risks
"""

import os
import uuid
import itertools
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List

from azure.ai.agents import AgentsClient
from azure.identity  import DefaultAzureCredential
from dotenv          import load_dotenv

from services.evidence.safety_evidence  import SafetyEvidenceService
from services.evidence.disease_evidence import DiseaseEvidenceService
from services.signals.signal_extractor  import SignalExtractor

from .safety_agent       import VabGenRxSafetyAgent
from .disease_agent      import VabGenRxDiseaseAgent
from .dosing_agent       import VabGenRxDosingAgent
from .counselling_agent  import VabGenRxCounsellingAgent
from .orchestrator_agent import VabGenRxOrchestratorAgent

load_dotenv()


class VabGenRxOrchestrator:
    """
    Coordinates the VabGenRx multi-agent system.
    - Evidence gathering in Python (parallel, no agent overhead)
    - Specialist agents do synthesis only (no tool calls)
    - Signal extractor detects compounding risks
    - Round 2 re-evaluation when signals found
    - Orchestrator agent produces cross-domain clinical intelligence
    """

    def __init__(self):
        endpoint = os.getenv("AZURE_AI_PROJECT_ENDPOINT")
        if not endpoint:
            raise ValueError(
                "AZURE_AI_PROJECT_ENDPOINT not set in .env"
            )

        self.client   = AgentsClient(
            endpoint   = endpoint,
            credential = DefaultAzureCredential()
        )
        self.model    = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")
        self.endpoint = endpoint.rstrip('/')

        # ── Specialist agents ──────────────────────────────────────
        self.safety_agent       = VabGenRxSafetyAgent(
            self.client, self.model, self.endpoint
        )
        self.disease_agent      = VabGenRxDiseaseAgent(
            self.client, self.model, self.endpoint
        )
        self.dosing_agent       = VabGenRxDosingAgent(
            self.client, self.model, self.endpoint
        )
        self.counselling_agent  = VabGenRxCounsellingAgent(
            self.client, self.model, self.endpoint
        )
        self.orchestrator_agent = VabGenRxOrchestratorAgent(
            self.client, self.model, self.endpoint
        )

        # ── Evidence services ──────────────────────────────────────
        self.safety_evidence  = SafetyEvidenceService()
        self.disease_evidence = DiseaseEvidenceService()

        # ── Signal extractor ───────────────────────────────────────
        self.signal_extractor = SignalExtractor()

        print("✅ VabGenRx Multi-Agent System initialized")
        print(f"   Endpoint : {endpoint}")
        print(f"   Model    : {self.model}")
        print(
            f"   Agents   : SafetyAgent | DiseaseAgent | "
            f"DosingAgent | CounsellingAgent | OrchestratorAgent"
        )

    # ── Main Entry Point ──────────────────────────────────────────────────────

    def analyze(
        self,
        medications:     List[str],
        diseases:        List[str] = None,
        foods:           List[str] = None,
        age:             int       = 45,
        sex:             str       = "unknown",
        dose_map:        Dict      = None,
        patient_profile: Dict      = None,
        patient_data:    Dict      = None,
        session_id:      str       = ""
    ) -> Dict:
        """
        Full multi-agent clinical analysis.

        Args:
            medications:     List of medication names.
            diseases:        List of disease/condition names.
            foods:           List of foods to check.
            age:             Patient age in years.
            sex:             Patient sex (male/female/unknown).
            dose_map:        Dict of drug → current dose string.
            patient_profile: Confirmed lifestyle habits dict.
            patient_data:    Patient lab values dict.
            session_id:      UUID for trace correlation. Not PHI.
                             Generated per request in agentApi.js.

        Executes six phases:
        1. Evidence gathering      (parallel Python)
        2. Round 1 synthesis       (parallel agents)
        3. Signal extraction       (instant Python)
        4. Round 2 re-evaluation   (conditional)
        5. Counselling             (parallel services)
        6. Orchestrator synthesis  (cross-domain reasoning)
        """
        diseases        = diseases        or []
        foods           = foods           or []
        dose_map        = dose_map        or {}
        patient_profile = patient_profile or {}
        patient_data    = patient_data    or {}

        # Generate session_id if not provided
        if not session_id:
            session_id = str(uuid.uuid4())

        full_patient_data = {
            **patient_data,
            "age":        age,
            "sex":        sex,
            "conditions": diseases,
        }

        meds_str = ', '.join(medications)
        dis_str  = ', '.join(diseases) if diseases else 'None'

        print(f"\n🤖 VabGenRx Orchestrator — Starting Analysis...")
        print(f"   Medications : {meds_str}")
        print(f"   Conditions  : {dis_str}")
        print(f"   Patient     : {age}yo {sex}")
        print(f"   Session     : {session_id[:8]}")
        print(
            f"   Labs        : "
            f"eGFR={patient_data.get('egfr','?')}  "
            f"K+={patient_data.get('potassium','?')}  "
            f"TSH={patient_data.get('tsh','?')}"
        )

        workflow = self._decide_workflow(medications, diseases)
        print(f"\n   📋 Workflow: {workflow}")

        # ── Phase 1 — Evidence gathering ──────────────────────────
        print(f"\n   ⚡ Phase 1 — Evidence Gathering (parallel)")

        safety_evidence  = {}
        disease_evidence = {}

        def gather_safety():
            if workflow["run_safety_evidence"]:
                return self.safety_evidence.gather(medications)
            return {"drug_drug": {}, "drug_food": {}}

        def gather_disease():
            if workflow["run_disease_evidence"]:
                return self.disease_evidence.gather(medications, diseases)
            return {}

        with ThreadPoolExecutor(max_workers=2) as ex:
            sf = ex.submit(gather_safety)
            df = ex.submit(gather_disease)
            safety_evidence  = sf.result()
            disease_evidence = df.result()

        print("   ✅ Phase 1 complete")

        # ── Phase 2 — Round 1 specialist synthesis ─────────────────
        print(f"\n   ⚡ Phase 2 — Round 1 Specialist Synthesis (parallel)")

        safety_r1  = {"drug_drug": [], "drug_food": []}
        disease_r1 = {"drug_disease": []}
        dosing_r1  = {"dosing_recommendations": []}

        def run_safety_r1():
            if workflow["run_safety_agent"]:
                return self.safety_agent.synthesize(safety_evidence, medications)
            return {"drug_drug": [], "drug_food": []}

        def run_disease_r1():
            if workflow["run_disease_agent"]:
                return self.disease_agent.synthesize(
                    disease_evidence, medications, diseases
                )
            return {"drug_disease": []}

        def run_dosing_r1():
            if workflow["run_dosing_agent"]:
                return self.dosing_agent.analyze(
                    medications, full_patient_data, dose_map
                )
            return {"dosing_recommendations": []}

        with ThreadPoolExecutor(max_workers=3) as ex:
            futures = {
                ex.submit(run_safety_r1):  "safety",
                ex.submit(run_disease_r1): "disease",
                ex.submit(run_dosing_r1):  "dosing",
            }
            for future in as_completed(futures):
                label = futures[future]
                try:
                    result = future.result()
                    if label == "safety":
                        safety_r1 = (
                            self.safety_evidence
                            .patch_drug_drug_evidence(
                                result,
                                safety_evidence.get("drug_drug", {})
                            )
                        )
                        print("   ✅ SafetyAgent Round 1 complete "
                              "(evidence patched)")
                    elif label == "disease":
                        disease_r1 = (
                            self.disease_evidence
                            .patch_drug_disease_evidence(
                                result, disease_evidence
                            )
                        )
                        print("   ✅ DiseaseAgent Round 1 complete "
                              "(evidence patched)")
                    elif label == "dosing":
                        dosing_r1 = result
                        print("   ✅ DosingAgent Round 1 complete")
                except Exception as e:
                    print(f"   ❌ Round 1 {label} failed: {e}")

        print("   ✅ Phase 2 complete")

        # ── Phase 3 — Signal extraction ───────────────────────────
        print(f"\n   ⚡ Phase 3 — Signal Extraction")

        compounding_signals = self.signal_extractor.extract(
            safety_r1,
            disease_r1,
            dosing_r1,
            full_patient_data
        )

        print("   ✅ Phase 3 complete")

        # ── Phase 4 — Round 2 re-evaluation (conditional) ─────────
        safety_final  = safety_r1
        disease_final = disease_r1
        dosing_final  = dosing_r1

        if compounding_signals:
            print(
                f"\n   ⚡ Phase 4 — Round 2 Re-evaluation "
                f"(signals: {list(compounding_signals.keys())})"
            )

            agents_to_rerun = set()
            for signal_data in compounding_signals.values():
                for agent in signal_data.get("agents_to_rerun", []):
                    agents_to_rerun.add(agent)

            def run_disease_r2():
                if "DiseaseAgent" in agents_to_rerun:
                    return self.disease_agent.re_evaluate(
                        disease_r1, compounding_signals,
                        medications, diseases
                    )
                return disease_r1

            def run_dosing_r2():
                if "DosingAgent" in agents_to_rerun:
                    return self.dosing_agent.re_evaluate(
                        dosing_r1, compounding_signals,
                        medications, full_patient_data, dose_map
                    )
                return dosing_r1

            with ThreadPoolExecutor(max_workers=2) as ex:
                d2f = ex.submit(run_disease_r2)
                r2f = ex.submit(run_dosing_r2)
                disease_final = d2f.result()
                dosing_final  = r2f.result()
                print("   ✅ Round 2 Disease complete")
                print("   ✅ Round 2 Dosing complete")

            print("   ✅ Phase 4 complete")
        else:
            print(f"\n   ⚡ Phase 4 — Skipped (no compounding signals)")

        # ── Phase 5 — Counselling ─────────────────────────────────
        print(f"\n   ⚡ Phase 5 — Counselling")

        counselling_result = {
            "drug_counseling":      [],
            "condition_counseling": [],
        }

        if workflow["run_counselling"]:
            counselling_result = self.counselling_agent.analyze(
                medications         = medications,
                diseases            = diseases,
                age                 = age,
                sex                 = sex,
                dose_map            = dose_map,
                patient_profile     = patient_profile,
                compounding_signals = compounding_signals,
                safety_result       = safety_final,
                disease_result      = disease_final,
            )

        print("   ✅ Phase 5 complete")

        # ── Phase 6 — Orchestrator synthesis ──────────────────────
        print(f"\n   ⚡ Phase 6 — Orchestrator Agent Synthesis")

        orchestrator_result = self.orchestrator_agent.synthesize(
            safety_result       = safety_final,
            disease_result      = disease_final,
            dosing_result       = dosing_final,
            counselling_result  = counselling_result,
            compounding_signals = compounding_signals,
            patient_context     = {
                "age":        age,
                "sex":        sex,
                "conditions": diseases,
                "egfr":       patient_data.get("egfr"),
                "potassium":  patient_data.get("potassium"),
                "bilirubin":  patient_data.get("bilirubin"),
                "tsh":        patient_data.get("tsh"),
                "pulse":      patient_data.get("pulse"),
            },
            session_id          = session_id,   # UUID — not PHI
        )

        print("   ✅ Phase 6 complete")

        final = self._merge_results(
            safety_final,
            disease_final,
            dosing_final,
            counselling_result,
            orchestrator_result,
            compounding_signals
        )

        print(f"\n   📊 Analysis complete:")
        print(f"      drug_drug:            {len(final['drug_drug'])}")
        print(f"      drug_disease:         {len(final['drug_disease'])}")
        print(f"      drug_food:            {len(final['drug_food'])}")
        print(f"      drug_counseling:      {len(final['drug_counseling'])}")
        print(f"      condition_counseling: {len(final['condition_counseling'])}")
        print(f"      dosing_recs:          {len(final['dosing_recommendations'])}")
        print(f"      compounding_signals:  {len(compounding_signals)}")
        print(f"      risk_level:           {final['risk_summary']['level']}")

        return {"status": "completed", "analysis": final}

    # ── Workflow Decision ─────────────────────────────────────────────────────

    def _decide_workflow(
        self,
        medications: List[str],
        diseases:    List[str]
    ) -> Dict:
        """Decide which phases to run based on input data."""
        return {
            "run_safety_evidence":  len(medications) >= 2,
            "run_disease_evidence": len(medications) >= 1 and len(diseases) >= 1,
            "run_safety_agent":     len(medications) >= 2,
            "run_disease_agent":    len(medications) >= 1 and len(diseases) >= 1,
            "run_dosing_agent":     len(medications) >= 1,
            "run_counselling":      len(medications) >= 1 or len(diseases) >= 1,
        }

    # ── Merge Results ─────────────────────────────────────────────────────────

    def _merge_results(
        self,
        safety_result:       Dict,
        disease_result:      Dict,
        dosing_result:       Dict,
        counselling_result:  Dict,
        orchestrator_result: Dict,
        compounding_signals: Dict
    ) -> Dict:
        """Merge all specialist results into the final output dict."""
        all_ddi  = safety_result.get("drug_drug", [])
        all_dd   = disease_result.get("drug_disease", [])
        all_dose = dosing_result.get("dosing_recommendations", [])

        severe_count   = sum(1 for r in all_ddi if r.get("severity") == "severe")
        mod_count      = sum(1 for r in all_ddi if r.get("severity") == "moderate")
        contra_count   = sum(1 for r in all_dd  if r.get("contraindicated"))
        dose_adj_count = sum(1 for r in all_dose if r.get("adjustment_required"))
        round2_updates = (
            sum(1 for r in all_dd   if r.get("round2_updated")) +
            sum(1 for r in all_dose if r.get("round2_updated"))
        )

        risk_level = orchestrator_result.get("risk_level") or (
            "HIGH"     if severe_count > 0 or contra_count > 0 else
            "MODERATE" if mod_count > 0 else
            "LOW"
        )

        return {
            "drug_drug":              all_ddi,
            "drug_disease":           all_dd,
            "drug_food":              safety_result.get("drug_food", []),
            "drug_counseling":        counselling_result.get("drug_counseling", []),
            "condition_counseling":   counselling_result.get("condition_counseling", []),
            "dosing_recommendations": all_dose,
            "compounding_signals":    compounding_signals,
            "risk_summary": {
                "level":                         risk_level,
                "severe_count":                  severe_count,
                "moderate_count":                mod_count,
                "contraindicated_count":         contra_count,
                "dosing_adjustments_required":   dose_adj_count,
                "compounding_patterns_detected": len(compounding_signals),
                "round2_updates":                round2_updates,
                "clinical_summary":              orchestrator_result.get("clinical_summary", ""),
                "compounding_patterns":          orchestrator_result.get("compounding_patterns", []),
                "priority_actions":              orchestrator_result.get("priority_actions", []),
                "evidence_summary":              orchestrator_result.get("evidence_summary", {}),
                "trace_session_id":              orchestrator_result.get("trace_session_id", ""),
            },
        }


# ── Backward Compatibility ────────────────────────────────────────────────────
VabGenRxAgentService = VabGenRxOrchestrator