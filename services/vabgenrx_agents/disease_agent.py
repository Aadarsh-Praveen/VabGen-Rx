"""
VabGenRx — Disease Agent
Specialist agent for drug-disease contraindication synthesis.

CHANGES:
- _build_evidence_text iterates all FDA sections dynamically
  No hardcoded section names anywhere
"""

import json
from typing import Dict, List

from azure.ai.agents import AgentsClient

from .base_agent import _BaseAgent

# Keys that are metadata, not clinical content
_SKIP = {
    "found", "drug", "brand_names",
    "generic_names", "manufacturer",
}


class VabGenRxDiseaseAgent(_BaseAgent):

    def __init__(
        self,
        client:   AgentsClient,
        model:    str,
        endpoint: str
    ):
        super().__init__(client, model, endpoint)

    # ── Round 1 ───────────────────────────────────────────────────

    def synthesize(
        self,
        evidence:    Dict,
        medications: List[str],
        diseases:    List[str]
    ) -> Dict:
        n_pairs  = len(evidence)
        meds_str = ', '.join(medications)
        dis_str  = ', '.join(diseases)

        print(f"\n   🔬 VabGenRxDiseaseAgent Round 1: "
              f"synthesizing {n_pairs} drug-disease pairs...")

        evidence_text = self._build_evidence_text(evidence)

        instructions = f"""
You are VabGenRxDiseaseAgent, a board-certified clinical pharmacologist
specializing in drug-disease contraindications.
Synthesize drug-disease contraindications from the evidence below.

MEDICATIONS: {meds_str}
CONDITIONS:  {dis_str}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL OUTPUT RULES — READ CAREFULLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. FIELD CONTENT RULES — strictly enforced:

   clinical_evidence:
   → Describe the CLINICAL RISK to the patient in plain language
   → Explain why this drug is concerning in this disease state
   → NEVER write "There are multiple PubMed articles..."
   → NEVER write paper counts or PMIDs in this field
   → ALWAYS describe the actual clinical risk to the patient

   recommendation:
   → Specific clinical action for the prescriber
   → NEVER leave this field empty

   alternative_drugs:
   → List safer alternatives for this specific disease context

2. EVIDENCE USE:
   → Use evidence to determine severity and confidence
   → PMIDs and paper counts belong ONLY in evidence sub-object
   → Never mention evidence provenance in clinical fields

3. SEVERITY CLASSIFICATION:
   SEVERE / contraindicated=true:
   → FDA label explicitly lists this disease as contraindication
   → Documented serious harm in published evidence

   MODERATE / contraindicated=false:
   → Increased monitoring required
   → Dose adjustment may be needed

   MINOR / contraindicated=false:
   → Low clinical significance
   → Commonly used together safely

   UNKNOWN / contraindicated=false:
   → Zero evidence — only when has_any_evidence=false

4. CONFIDENCE CALIBRATION:
   → Full FDA label (4+ sections) + 10+ papers → 0.88–0.95
   → Partial FDA label + 5+ papers              → 0.78–0.88
   → FDA label only (any sections)              → 0.70–0.80
   → Papers only (no FDA label)                 → 0.68–0.78
   → Zero evidence                              → null

5. MANDATORY COMPLETENESS:
   → Every pair must have populated clinical_evidence
   → Every pair must have populated recommendation
   → Never return empty string for these fields

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DRUG-DISEASE EVIDENCE:
{evidence_text}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For each pair you will see a list of available FDA sections
with their character counts. Declare the sections you need
in requested_sections[] — only the most clinically relevant
ones for THIS specific drug-disease combination.
Typically 3–6 sections are sufficient.

Return ONLY valid JSON:
{{
  "drug_disease": [
    {{
      "drug":            "...",
      "disease":         "...",
      "contraindicated": false,
      "severity":        "severe|moderate|minor|unknown",
      "confidence":      0.00,
      "clinical_evidence": "plain language clinical risk — no PMIDs",
      "recommendation":  "specific clinical action — never empty",
      "alternative_drugs": [],
      "requested_sections": ["boxed_warning", "contraindications"],
      "compounding_flag":    false,
      "compounding_organs":  [],
      "round2_updated":      false,
      "round2_note":         null,
      "from_cache":          false,
      "evidence": {{
        "pubmed_papers":              0,
        "pubmed_pmids":               [],
        "fda_label_sections_found":   [],
        "fda_label_sections_count":   0,
        "evidence_tier":              1,
        "evidence_tier_name":         "...",
        "evidence_summary":           "one sentence about quality"
      }}
    }}
  ]
}}
"""

        content = (
            f"Synthesize drug-disease contraindications.\n"
            f"MEDICATIONS: {meds_str}\n"
            f"CONDITIONS:  {dis_str}\n"
            f"Return JSON only."
        )

        return self._run(
            "VabGenRxDiseaseAgent",
            instructions,
            content
        )

    # ── Round 2 ───────────────────────────────────────────────────

    def re_evaluate(
        self,
        round1_results:      Dict,
        compounding_signals: Dict,
        medications:         List[str],
        diseases:            List[str]
    ) -> Dict:
        meds_str    = ', '.join(medications)
        dis_str     = ', '.join(diseases)
        round1_list = round1_results.get("drug_disease", [])

        print(f"\n   🔬 VabGenRxDiseaseAgent Round 2: "
              f"re-evaluating with compounding context...")

        signal_text = self._build_signal_context(compounding_signals)
        round1_text = json.dumps(round1_list, indent=2)

        instructions = f"""
You are VabGenRxDiseaseAgent performing Round 2 re-evaluation.

MEDICATIONS: {meds_str}
CONDITIONS:  {dis_str}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL OUTPUT RULES — same as Round 1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

clinical_evidence: plain language clinical risk — no PMIDs
recommendation: specific clinical action — never empty
All text fields must be populated — never empty strings

Return a single valid JSON object only.
Do not include any text before or after the JSON.
Do not include multiple JSON objects.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMPOUNDING SIGNALS DETECTED:
{signal_text}

YOUR ROUND 1 ASSESSMENTS:
{round1_text}

TASK:
Re-evaluate Round 1 in light of compounding signals.
Set round2_updated=true and explain in round2_note if changed.
Return ALL pairs. Unchanged pairs return Round 1 exactly
with round2_updated=false.

Return ONLY a single valid JSON object:
{{
  "drug_disease": [ ... all pairs ... ]
}}
"""

        content = (
            f"Re-evaluate drug-disease contraindications.\n"
            f"MEDICATIONS: {meds_str}\n"
            f"CONDITIONS:  {dis_str}\n"
            f"Return ALL pairs in a single JSON object only."
        )

        result = self._run(
            "VabGenRxDiseaseAgent_Round2",
            instructions,
            content
        )

        if not result or not result.get("drug_disease"):
            print("   ⚠️  Disease Agent Round 2 failed — "
                  "keeping Round 1 results")
            return round1_results

        return result

    # ── Evidence Text Builder — fully dynamic ─────────────────────

    def _build_evidence_text(self, evidence: Dict) -> str:
        """
        Sends the agent a compact section INDEX per pair,
        not the full FDA content.

        The index shows { section_name: char_count } so the agent
        knows what exists and how substantial each section is.
        The agent declares requested_sections[] in its JSON output.
        Full content of only those sections is available via
        inject_requested_sections() for targeted second passes.

        This keeps the prompt size proportional to the number of
        pairs, not to the total size of all FDA label sections.
        """
        if not evidence:
            return "No drug-disease pairs to analyze."

        parts = []
        for pair, ev in evidence.items():
            drug, disease = pair

            if ev.get("cache_hit") and ev.get("cached_data"):
                cached = ev["cached_data"]
                parts.append(
                    f"PAIR: {drug} + {disease}\n"
                    f"  Status: CACHED — use this result directly\n"
                    f"  Contraindicated: "
                    f"{cached.get('contraindicated', False)}\n"
                    f"  Severity: "
                    f"{cached.get('severity', 'unknown')}\n"
                    f"  Clinical evidence: "
                    f"{cached.get('clinical_evidence', '')}\n"
                    f"  Recommendation: "
                    f"{cached.get('recommendation', '')}\n"
                    f"  Mark from_cache=true. Copy all fields exactly."
                )
                continue

            fda_found  = ev.get(
                "fda_label_full", {}
            ).get("found", False)
            sec_index  = ev.get("fda_section_index", {})

            # ── Compact index — section name + char count ──────────
            # Agent uses this to decide which sections to request.
            # Sections ordered by size descending so most substantial
            # content is visible first in the index.
            sorted_index = sorted(
                sec_index.items(),
                key=lambda x: x[1],
                reverse=True
            )
            index_lines = "\n".join(
                f"    {name} ({chars} chars)"
                for name, chars in sorted_index
            ) or "    No FDA sections available"

            abstracts_text = ""
            for i, ab in enumerate(ev.get("abstracts", []), 1):
                abstracts_text += (
                    f"  Research finding {i}: {ab}\n"
                )

            has_any_evidence = (
                ev.get("pubmed_count", 0) > 0 or fda_found
            )

            parts.append(
                f"PAIR: {drug} + {disease}\n"
                f"  PubMed papers found: {ev.get('pubmed_count', 0)}\n"
                f"  FDA label found: {fda_found}\n"
                f"  FDA sections available "
                f"({len(sec_index)} sections):\n"
                f"{index_lines}\n"
                f"  Research abstracts:\n{abstracts_text}"
                f"  INSTRUCTION: "
                f"{'Synthesize clinical assessment.' if has_any_evidence else 'Return severity=unknown confidence=null.'} "
                f"Declare which FDA sections you need in "
                f"requested_sections[] — the full content of "
                f"those sections will be retrieved for you.\n"
            )

        return "\n\n".join(parts)

    def _build_signal_context(
        self,
        compounding_signals: Dict
    ) -> str:
        if not compounding_signals:
            return "No compounding signals."

        parts = []
        for organ_system, signal_data in compounding_signals.items():
            sources_text = ""
            for src in signal_data.get("sources", []):
                sources_text += (
                    f"    - [{src.get('domain', '').upper()}] "
                    f"{src.get('drug', '')} — "
                    f"{src.get('finding', '')}\n"
                )

            parts.append(
                f"COMPOUNDING SIGNAL — "
                f"{organ_system.upper()}:\n"
                f"  Severity:     "
                f"{signal_data.get('severity', '')}\n"
                f"  Signal count: "
                f"{signal_data.get('signal_count', 0)}\n"
                f"  Explanation:  "
                f"{signal_data.get('explanation', '')}\n"
                f"  Sources:\n{sources_text}"
                f"  Re-evaluation guidance:\n"
                f"    "
                f"{signal_data.get('round2_instructions', '')}"
            )

        return "\n\n".join(parts)