"""
VabGenRx — Safety Agent
Specialist agent for drug-drug and drug-food interaction synthesis.

CHANGES:
- _build_ddi_evidence_text iterates all FDA sections dynamically
  No hardcoded section names anywhere
"""

import json
from typing import Dict, List, Tuple

from azure.ai.agents import AgentsClient

from .base_agent import _BaseAgent

# Keys that are metadata, not clinical content
_SKIP = {
    "found", "drug", "brand_names",
    "generic_names", "manufacturer",
}


class VabGenRxSafetyAgent(_BaseAgent):

    def __init__(
        self,
        client:   AgentsClient,
        model:    str,
        endpoint: str
    ):
        super().__init__(client, model, endpoint)

    # ── Public ────────────────────────────────────────────────────

    def synthesize(
        self,
        evidence:    Dict,
        medications: List[str]
    ) -> Dict:
        n_pairs  = len(evidence.get("drug_drug", {}))
        n_food   = len(evidence.get("drug_food", {}))
        meds_str = ', '.join(medications)

        print(f"\n   🔬 VabGenRxSafetyAgent: synthesizing "
              f"{n_pairs} drug-drug pairs, "
              f"{n_food} food interactions...")

        ddi_evidence_text  = self._build_ddi_evidence_text(
            evidence.get("drug_drug", {})
        )
        food_evidence_text = self._build_food_evidence_text(
            evidence.get("drug_food", {})
        )

        instructions = f"""
You are VabGenRxSafetyAgent, a board-certified clinical pharmacologist.
Synthesize drug-drug and drug-food interactions from the evidence below.

MEDICATIONS: {meds_str}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL OUTPUT RULES — READ CAREFULLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. FIELD CONTENT RULES — strictly enforced:

   mechanism:
   → Explain the pharmacological reason why the interaction occurs
   → NEVER put paper counts, PMIDs, or evidence metadata here

   clinical_effects:
   → Describe what actually happens to the PATIENT
   → Use plain clinical language a prescriber understands
   → NEVER put paper counts, PMIDs, or evidence provenance here
   → NEVER leave this field empty

   recommendation:
   → Specific clinical action for the prescriber
   → NEVER leave this field empty

2. EVIDENCE-ONLY SYNTHESIS:
   → Base severity and confidence strictly on evidence provided
   → Do NOT use general knowledge beyond what evidence shows

3. SEVERITY CLASSIFICATION:
   SEVERE   — documented contraindication, serious harm, or death
   MODERATE — requires dose adjustment or monitoring
   MINOR    — commonly prescribed together safely
   UNKNOWN  — absolutely no evidence of any kind exists

4. CONFIDENCE CALIBRATION:
   → 20+ papers OR 1000+ FDA reports  → 0.90–0.98
   → 5–20 papers OR 100–1000 reports  → 0.80–0.90
   → 1–5 papers OR 10–100 reports     → 0.70–0.85
   → FDA label warnings only          → 0.65–0.75
   → Zero evidence of any kind        → null (severity=unknown)

5. CACHED RESULTS:
   → If cache_hit=true — use cached data exactly as provided
   → Mark from_cache=true

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DRUG-DRUG EVIDENCE:
{ddi_evidence_text}

DRUG-FOOD EVIDENCE:
{food_evidence_text}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return ONLY valid JSON:
{{
  "drug_drug": [
    {{
      "drug1": "...",
      "drug2": "...",
      "severity": "severe|moderate|minor|unknown",
      "confidence": 0.00,
      "mechanism": "pharmacological explanation — no PMIDs",
      "clinical_effects": "what happens to the patient — no PMIDs",
      "recommendation": "specific clinical action for prescriber",
      "compounding_flag": false,
      "compounding_organs": [],
      "round2_updated": false,
      "from_cache": false,
      "evidence": {{
        "pubmed_papers":    0,
        "pubmed_pmids":     [],
        "fda_reports":      0,
        "fda_serious":      0,
        "severity_ratio":   0.0,
        "evidence_tier":    1,
        "evidence_tier_name": "...",
        "evidence_summary": "one sentence about evidence quality"
      }}
    }}
  ],
  "drug_food": [
    {{
      "drug": "...",
      "foods_to_avoid":    [],
      "foods_to_separate": [],
      "foods_to_monitor":  [],
      "mechanism": "pharmacological explanation — no PMIDs",
      "no_significant_interactions": false,
      "from_cache": false,
      "evidence": {{
        "pubmed_papers":    0,
        "evidence_tier":    1,
        "evidence_tier_name": "...",
        "evidence_summary": "one sentence about evidence quality"
      }}
    }}
  ]
}}
"""

        content = (
            f"Synthesize drug-drug and food interactions.\n"
            f"MEDICATIONS: {meds_str}\n"
            f"Use only the evidence provided in instructions.\n"
            f"Return JSON only."
        )

        return self._run(
            "VabGenRxSafetyAgent",
            instructions,
            content
        )

    # ── Evidence Text Builders ────────────────────────────────────

    def _build_ddi_evidence_text(
        self,
        drug_drug_evidence: Dict
    ) -> str:
        if not drug_drug_evidence:
            return "No drug-drug pairs to analyze."

        parts = []
        for pair, ev in drug_drug_evidence.items():
            drug1, drug2 = pair

            if ev.get("cache_hit") and ev.get("cached_data"):
                cached = ev["cached_data"]
                parts.append(
                    f"PAIR: {drug1} + {drug2}\n"
                    f"  Status: CACHED — use this result directly\n"
                    f"  Severity:   {cached.get('severity', 'unknown')}\n"
                    f"  Confidence: {cached.get('confidence', 0)}\n"
                    f"  Mechanism:  {cached.get('mechanism', '')}\n"
                    f"  Clinical effects: "
                    f"{cached.get('clinical_effects', '')}\n"
                    f"  Recommendation: "
                    f"{cached.get('recommendation', '')}\n"
                    f"  Mark from_cache=true. "
                    f"Copy all fields exactly."
                )
                continue

            fda_l1 = ev.get("fda_label_drug1", {})
            fda_l2 = ev.get("fda_label_drug2", {})

            # ── Build FDA text dynamically from ALL returned sections
            def _fda_lines(drug_name: str, label: dict) -> str:
                lines = []
                for key, value in label.items():
                    if key in _SKIP or not value:
                        continue
                    section_label = key.replace("_", " ").upper()
                    lines.append(
                        f"  {drug_name} FDA {section_label}:\n"
                        f"  {str(value)[:400]}\n"
                    )
                return "".join(lines)

            fda_text = (
                _fda_lines(drug1, fda_l1) +
                _fda_lines(drug2, fda_l2)
            )

            abstracts_text = ""
            for i, ab in enumerate(ev.get("abstracts", []), 1):
                abstracts_text += (
                    f"  Research finding {i}: {ab}\n"
                )

            has_any_evidence = (
                ev.get("pubmed_count", 0) > 0 or
                ev.get("fda_reports",  0) > 0 or
                bool(fda_l1) or bool(fda_l2)
            )

            parts.append(
                f"PAIR: {drug1} + {drug2}\n"
                f"  PubMed papers found: {ev.get('pubmed_count', 0)}\n"
                f"  FDA adverse reports: {ev.get('fda_reports', 0)}\n"
                f"  FDA serious reports: {ev.get('fda_serious', 0)}\n"
                f"  Has any evidence: {has_any_evidence}\n"
                f"  Research abstracts:\n{abstracts_text}"
                f"  FDA label data:\n"
                f"{fda_text if fda_text else '  No FDA label data found.\n'}"
                f"  INSTRUCTION: "
                f"{'Synthesize clinical assessment.' if has_any_evidence else 'Return severity=unknown confidence=null — zero evidence'}\n"
            )

        return "\n\n".join(parts)

    def _build_food_evidence_text(
        self,
        drug_food_evidence: Dict
    ) -> str:
        if not drug_food_evidence:
            return "No food interactions to analyze."

        parts = []
        for drug, ev in drug_food_evidence.items():

            if ev.get("cache_hit") and ev.get("cached_data"):
                cached = ev["cached_data"]
                parts.append(
                    f"DRUG: {drug}\n"
                    f"  Status: CACHED — use this result directly\n"
                    f"  Foods to avoid:    "
                    f"{cached.get('foods_to_avoid', [])}\n"
                    f"  Foods to separate: "
                    f"{cached.get('foods_to_separate', [])}\n"
                    f"  Foods to monitor:  "
                    f"{cached.get('foods_to_monitor', [])}\n"
                    f"  Mark from_cache=true."
                )
                continue

            abstracts_text = ""
            for i, ab in enumerate(ev.get("abstracts", []), 1):
                abstracts_text += f"  Research finding {i}: {ab}\n"

            parts.append(
                f"DRUG: {drug}\n"
                f"  PubMed papers found: {ev.get('pubmed_count', 0)}\n"
                f"  Research abstracts:\n{abstracts_text}"
            )

        return "\n\n".join(parts)