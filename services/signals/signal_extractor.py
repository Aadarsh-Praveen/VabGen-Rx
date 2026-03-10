"""
VabGenRx Signal Extractor

Analyzes outputs from Round-1 specialist agents and detects
cross-domain compounding clinical risks using GPT-4o reasoning.

Purpose
-------
The Signal Extractor acts as the decision layer between the
first and second analysis rounds in the VabGenRx multi-agent
clinical reasoning pipeline.

It reviews results from:
• SafetyAgent      – drug-drug interactions
• DiseaseAgent     – drug-disease contraindications
• DosingAgent      – dose adjustment recommendations

The service identifies situations where multiple independent
findings converge on the same organ system or physiological
pathway, indicating a compounding clinical risk.

Compounding Signal Logic
------------------------
A signal is detected when:

1. Two or more findings originate from different clinical
   domains (drug-drug, drug-disease, dosing)
2. The findings affect the same organ system or biological
   pathway
3. The combined risk exceeds the severity of any single finding

If signals are detected:
    → Round 2 specialist agents are re-executed with
      additional clinical context.

If no signals exist:
    → Round 2 is skipped to minimize latency.

Architecture Role
-----------------
This component enables adaptive multi-agent reasoning:

Round 1:
    SafetyAgent
    DiseaseAgent
    DosingAgent

Signal Extraction:
    Detect compounding risk patterns

Round 2 (only if needed):
    DiseaseAgent
    DosingAgent re-evaluate with injected context

Reliability Features
--------------------
• Robust JSON parsing for LLM responses
• Azure Application Insights logging for failures
• Graceful degradation — pipeline continues even if
  signal extraction fails

The Signal Extractor enables VabGenRx to perform
context-aware polypharmacy risk analysis without relying
on hardcoded rule sets or predefined organ-system lists.
"""

import os
import json
import logging
from typing import Dict, List
from openai import AzureOpenAI
from dotenv import load_dotenv

load_dotenv()

# Shared logger — Application Insights handler attached in app.py
logger = logging.getLogger("vabgenrx")


class SignalExtractor:
    """
    Reads Round 1 specialist agent outputs and identifies
    compounding organ system risk patterns using GPT-4o.

    This is the bridge between Round 1 and Round 2.
    Runs in milliseconds for simple cases (no signals).
    One GPT-4o call when signals need to be identified.
    """

    def __init__(self):
        self.llm = AzureOpenAI(
            api_key        = os.getenv("AZURE_OPENAI_KEY"),
            api_version    = os.getenv("AZURE_OPENAI_API_VERSION"),
            azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        )
        self.deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT")

    # ── Public ────────────────────────────────────────────────────────────────

    def extract(
        self,
        safety_result:  Dict,
        disease_result: Dict,
        dosing_result:  Dict,
        patient_data:   Dict
    ) -> Dict:
        """
        Identify compounding organ system signals across all
        Round 1 specialist outputs.

        Returns empty dict if no compounding signals found.
        Round 2 is only triggered when this returns non-empty.

        Returns:
        {
            "organ_system_name": {
                "signal_count": int,
                "severity":     "critical|high|moderate",
                "explanation":  str,
                "sources": [
                    {
                        "domain":  "drug_drug|drug_disease|dosing",
                        "finding": str,
                        "drug":    str,
                        "agent":   str
                    }
                ],
                "round2_instructions": str,
                "agents_to_rerun": ["DiseaseAgent", "DosingAgent"]
            }
        }
        """

        # Build summary of all Round 1 findings for GPT-4o
        findings = self._build_findings_summary(
            safety_result,
            disease_result,
            dosing_result,
            patient_data
        )

        # Quick check — if no findings at all skip LLM call
        if not findings["has_findings"]:
            print("   ⚡ Signal Extractor: no findings to analyze")
            return {}

        print("   ⚡ Signal Extractor: analyzing Round 1 findings "
              "for compounding patterns...")

        signals = self._call_llm(findings, patient_data)

        if signals:
            print(f"   ⚡ Signal Extractor: found {len(signals)} "
                  f"compounding signal(s) — "
                  f"{list(signals.keys())}")
        else:
            print("   ⚡ Signal Extractor: no compounding signals "
                  "detected — Round 2 skipped")

        return signals

    # ── Build Findings Summary ────────────────────────────────────────────────

    def _build_findings_summary(
        self,
        safety_result:  Dict,
        disease_result: Dict,
        dosing_result:  Dict,
        patient_data:   Dict
    ) -> Dict:
        """
        Builds a clean structured summary of all Round 1 findings
        for GPT-4o to reason about.
        Strips large fields to keep context focused.
        """

        drug_drug    = safety_result.get("drug_drug", [])
        drug_disease = disease_result.get("drug_disease", [])
        dosing_recs  = dosing_result.get("dosing_recommendations", [])

        has_findings = bool(drug_drug or drug_disease or dosing_recs)

        # Summarise drug-drug findings
        ddi_summary = []
        for item in drug_drug:
            ddi_summary.append({
                "drug1":            item.get("drug1", ""),
                "drug2":            item.get("drug2", ""),
                "severity":         item.get("severity", ""),
                "mechanism":        item.get("mechanism", ""),
                "clinical_effects": item.get("clinical_effects", ""),
                "confidence":       item.get("confidence", 0),
            })

        # Summarise drug-disease findings
        dd_summary = []
        for item in drug_disease:
            dd_summary.append({
                "drug":              item.get("drug", ""),
                "disease":           item.get("disease", ""),
                "severity":          item.get("severity", ""),
                "contraindicated":   item.get("contraindicated", False),
                "clinical_evidence": item.get("clinical_evidence", ""),
                "confidence":        item.get("confidence", 0),
            })

        # Summarise dosing findings
        dose_summary = []
        for item in dosing_recs:
            if item.get("adjustment_required"):
                dose_summary.append({
                    "drug":              item.get("drug", ""),
                    "adjustment_type":   item.get("adjustment_type", ""),
                    "urgency":           item.get("urgency", ""),
                    "adjustment_reason": item.get("adjustment_reason", ""),
                    "current_dose":      item.get("current_dose", ""),
                    "recommended_dose":  item.get("recommended_dose", ""),
                })

        # Summarise relevant patient data
        patient_summary = {
            "age":        patient_data.get("age"),
            "sex":        patient_data.get("sex"),
            "conditions": patient_data.get("conditions", []),
            "egfr":       patient_data.get("egfr"),
            "potassium":  patient_data.get("potassium"),
            "bilirubin":  patient_data.get("bilirubin"),
            "tsh":        patient_data.get("tsh"),
            "pulse":      patient_data.get("pulse"),
        }
        other = patient_data.get("other_investigations", {})
        if other:
            patient_summary["other_investigations"] = other

        return {
            "has_findings":  has_findings,
            "drug_drug":     ddi_summary,
            "drug_disease":  dd_summary,
            "dosing":        dose_summary,
            "patient":       patient_summary,
        }

    # ── LLM Call ──────────────────────────────────────────────────────────────

    def _call_llm(
        self,
        findings:     Dict,
        patient_data: Dict
    ) -> Dict:
        """
        Ask GPT-4o to identify organ system overlap patterns
        across all Round 1 findings.

        No hardcoded organ systems — GPT-4o determines what
        organ systems are involved based on clinical reasoning.

        Uses robust JSON parsing (raw_decode) to handle trailing
        commas, comments, or extra text that json.loads() rejects.
        """

        prompt = f"""
You are a senior clinical pharmacologist reviewing findings from
three independent specialist analyses of a patient's medications.

PATIENT:
{json.dumps(findings["patient"], indent=2)}

DRUG-DRUG INTERACTION FINDINGS (Safety Agent Round 1):
{json.dumps(findings["drug_drug"], indent=2)}

DRUG-DISEASE CONTRAINDICATION FINDINGS (Disease Agent Round 1):
{json.dumps(findings["drug_disease"], indent=2)}

DOSING ADJUSTMENT FINDINGS (Dosing Agent Round 1):
{json.dumps(findings["dosing"], indent=2)}

TASK:
Review all findings above and identify any organ systems or
physiological pathways where MULTIPLE INDEPENDENT findings
converge on the same risk.

A compounding signal exists when:
- 2 or more findings from DIFFERENT domains (drug-drug,
  drug-disease, dosing) involve the same organ system
  or physiological mechanism
- The combination creates a risk greater than any single
  finding alone
- A specialist agent re-evaluating with this context would
  likely change or strengthen its assessment

IMPORTANT RULES:
- Only flag GENUINE compounding risks
- Do not flag findings that are independent with no shared
  mechanism even if they involve the same drug
- Do not flag minor findings unless they compound with
  a severe finding
- The organ system name should be clinically precise
  (e.g. "renal" not "kidney problems")
- If no compounding signals exist return empty signals object

For each compounding signal found, specify:
- Which agents should re-evaluate (DiseaseAgent, DosingAgent,
  or both) — SafetyAgent does not re-evaluate in Round 2
- What specific context should be injected into Round 2
  agent instructions to guide re-evaluation
- How severe the compounding risk is overall

Return ONLY valid JSON:
{{
  "signals": {{
    "<organ_system_name>": {{
      "signal_count": <int>,
      "severity": "critical|high|moderate",
      "explanation": "<why these findings compound each other>",
      "sources": [
        {{
          "domain":  "drug_drug|drug_disease|dosing",
          "finding": "<brief description of finding>",
          "drug":    "<drug name(s) involved>",
          "agent":   "<SafetyAgent|DiseaseAgent|DosingAgent>"
        }}
      ],
      "round2_instructions": "<specific context to inject into
                               Round 2 agent instructions —
                               what to look for and why>",
      "agents_to_rerun": ["DiseaseAgent", "DosingAgent"]
    }}
  }}
}}

If no compounding signals:
{{
  "signals": {{}}
}}
"""

        try:
            response = self.llm.chat.completions.create(
                model    = self.deployment,
                messages = [
                    {
                        "role":    "system",
                        "content": (
                            "You are a senior clinical pharmacologist "
                            "specializing in polypharmacy risk assessment. "
                            "Identify genuine compounding risks where "
                            "multiple independent clinical findings "
                            "converge on the same organ system or pathway. "
                            "Be conservative — only flag real compounding "
                            "risks, not coincidental overlaps. "
                            "Return only valid JSON."
                        )
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature     = 0,
                max_tokens      = 1000,
                response_format = {"type": "json_object"}
            )

            raw = response.choices[0].message.content

            # ── Robust JSON parsing ───────────────────────────────
            # json.loads() fails on trailing commas or comments that
            # GPT-4o occasionally emits. raw_decode() finds the first
            # valid JSON object and stops — ignores surrounding text.
            try:
                start = raw.find('{')
                if start < 0:
                    print("   ⚠️  Signal Extractor: no JSON in response")
                    return {}
                decoder      = json.JSONDecoder()
                obj, _end    = decoder.raw_decode(raw, start)
                return obj.get("signals", {})
            except json.JSONDecodeError as e:
                # raw_decode also failed — log and return empty
                logger.error(
                    "llm_failure",
                    extra={"custom_dimensions": {
                        "event":     "llm_failure",
                        "service":   "signal_extractor",
                        "stage":     "json_parse",
                        "ddi_count": len(findings.get("drug_drug", [])),
                        "dd_count":  len(findings.get("drug_disease", [])),
                        "error":     str(e)[:200],
                        "raw":       raw[:200],
                    }}
                )
                print(f"   ⚠️  Signal Extractor JSON parse error: {e}")
                return {}

        except Exception as e:
            # ── Alert 8: LLM failure ──────────────────────────────
            # When signal extractor fails, Round 2 is silently
            # skipped — compounding risks go undetected.
            # This alert tells you when that silent skip happens
            # so you can investigate why GPT-4o failed.
            logger.error(
                "llm_failure",
                extra={"custom_dimensions": {
                    "event":     "llm_failure",
                    "service":   "signal_extractor",
                    "stage":     "llm_call",
                    "ddi_count": len(findings.get("drug_drug", [])),
                    "dd_count":  len(findings.get("drug_disease", [])),
                    "error":     str(e)[:200],
                }}
            )
            print(f"   ⚠️  Signal Extractor LLM error: {e}")
            # On error — return empty, Round 2 simply won't run
            # Never fail the main pipeline because of signal extraction
            return {}