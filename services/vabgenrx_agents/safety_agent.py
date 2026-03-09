'''
"""
VabGenRx — Safety Agent
Specialist agent for drug-drug and drug-food interaction synthesis.

CHANGES:
- _build_ddi_evidence_text uses doc-1 approach:
    • Injects FULL CONTENT of core clinical FDA sections into the prompt
    • Lists remaining non-admin sections as a character-count index
    • Fixes "Insufficient evidence" for DDI pairs that have FDA label
      data but 0 PubMed papers
"""

import json
from typing import Dict, List, Tuple

from azure.ai.agents import AgentsClient

from .base_agent import _BaseAgent

# ── Section lists ─────────────────────────────────────────────────────────────

_CORE_SECTIONS = [
    "boxed_warning",
    "contraindications",
    "warnings",
    "warnings_and_cautions",
    "warnings_and_precautions",
    "drug_interactions",
    "adverse_reactions",
    "use_in_specific_populations",
    "indications_and_usage",
    "clinical_pharmacology",
    "mechanism_of_action",
]

# Keys that are metadata, not clinical content
_SKIP = {
    "found", "drug", "brand_names",
    "generic_names", "manufacturer",
}

# Administrative / formatting sections — index-only, never injected
_ADMIN = {
    "package_label_principal_display_panel",
    "spl_product_data_elements", "spl_medguide",
    "recent_major_changes", "how_supplied",
    "dosage_forms_and_strengths", "description",
    "references",
}


class VabGenRxSafetyAgent(_BaseAgent):

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

4. CONFIDENCE CALIBRATION — STRICTLY ENFORCED:
   FDA adverse event reports (fda_reports) ARE real evidence.
   Never return null confidence when fda_reports > 0.

   → 20+ papers OR 1000+ FDA reports  → 0.90–0.98  MANDATORY
   → 5–20 papers OR 100–1000 reports  → 0.80–0.90  MANDATORY
   → 1–5 papers OR 10–100 reports     → 0.70–0.85  MANDATORY
   → FDA label content only           → 0.65–0.75  MANDATORY
   → Zero evidence of ANY kind        → null (severity=unknown)

   Each pair has a pre-computed EVIDENCE TIER label — your
   confidence MUST fall within that tier's range.
   Returning null when tier is HIGH/MEDIUM/LOW is a violation.

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
        "pubmed_papers":          0,
        "pubmed_pmids":           [],
        "fda_reports":            0,
        "fda_serious":            0,
        "severity_ratio":         0.0,
        "fda_label_sections_count": 0,
        "evidence_tier":          1,
        "evidence_tier_name":     "...",
        "evidence_summary":       "one sentence about evidence quality"
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

    # ── Evidence Text Builders ────────────────────────────────────────────────

    def _build_ddi_evidence_text(
        self,
        drug_drug_evidence: Dict
    ) -> str:
        """
        For each drug-drug pair, inject FULL CONTENT of core clinical
        FDA sections for both drugs directly into the prompt, then list
        remaining non-admin sections as a character-count index.

        Fixes "Insufficient evidence" for DDI pairs that have FDA label
        data but 0 PubMed papers.
        """
        if not drug_drug_evidence:
            return "No drug-drug pairs to analyze."

        parts = []
        for pair, ev in drug_drug_evidence.items():
            drug1, drug2 = pair

            # ── Cached pair — pass through untouched ─────────────────────────
            if ev.get("cache_hit") and ev.get("cached_data"):
                cached = ev["cached_data"]
                cached_ev = cached.get("evidence", {})
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
                    f"  Evidence pubmed_papers: "
                    f"{cached_ev.get('pubmed_papers', 0)}\n"
                    f"  Evidence fda_reports: "
                    f"{cached_ev.get('fda_reports', 0)}\n"
                    f"  Evidence fda_label_sections_count: "
                    f"{cached_ev.get('fda_label_sections_count', 0)}\n"
                    f"  Evidence evidence_tier: "
                    f"{cached_ev.get('evidence_tier', 1)}\n"
                    f"  Evidence evidence_tier_name: "
                    f"{cached_ev.get('evidence_tier_name', '')}\n"
                    f"  Evidence evidence_summary: "
                    f"{cached_ev.get('evidence_summary', '')}\n"
                    f"  Mark from_cache=true. "
                    f"Copy ALL fields exactly including all evidence fields above."
                )
                continue

            fda_l1 = ev.get("fda_label_drug1", {})
            fda_l2 = ev.get("fda_label_drug2", {})

            # ── Inject core sections in full (up to 500 chars each) ───────────
            def _inject_core(drug_name: str, label: dict) -> tuple:
                """Return (text, injected_set) for core sections."""
                lines    = []
                injected = set()
                for section in _CORE_SECTIONS:
                    content = label.get(section, "")
                    if content:
                        sec_label = section.replace("_", " ").upper()
                        lines.append(
                            f"  {drug_name} FDA {sec_label}:\n"
                            f"  {str(content)[:500]}\n"
                        )
                        injected.add(section)
                return "".join(lines), injected

            core_text1, injected1 = _inject_core(drug1, fda_l1)
            core_text2, injected2 = _inject_core(drug2, fda_l2)
            core_text = core_text1 + core_text2

            # ── List remaining sections as a character-count index ────────────
            def _remaining_index(
                drug_name: str, label: dict, injected: set
            ) -> str:
                rem = {
                    k: len(str(v))
                    for k, v in label.items()
                    if k not in injected
                    and k not in _SKIP
                    and k not in _ADMIN
                    and v
                    and not k.endswith("_table")
                }
                if not rem:
                    return ""
                lines = "\n".join(
                    f"    {drug_name} — {k} ({chars} chars)"
                    for k, chars in sorted(
                        rem.items(), key=lambda x: x[1], reverse=True
                    )
                )
                return lines + "\n"

            index_text = (
                _remaining_index(drug1, fda_l1, injected1) +
                _remaining_index(drug2, fda_l2, injected2)
            )

            # ── Research abstracts ────────────────────────────────────────────
            abstracts_text = ""
            for i, ab in enumerate(ev.get("abstracts", []), 1):
                abstracts_text += f"  Research finding {i}: {ab}\n"

            has_any_evidence = (
                ev.get("pubmed_count", 0) > 0 or
                ev.get("fda_reports",  0) > 0 or
                bool(fda_l1) or bool(fda_l2)
            )

            # ── Build evidence signal summary ──────────────────────
            # Explicitly tell the agent what evidence tier applies
            # so it cannot ignore high FDA report counts.
            fda_reports   = ev.get("fda_reports",  0)
            pubmed_count  = ev.get("pubmed_count", 0)
            fda_serious   = ev.get("fda_serious",  0)

            if pubmed_count >= 20 or fda_reports >= 1000:
                tier_note = (
                    f"EVIDENCE TIER: HIGH — "
                    f"confidence MUST be 0.90–0.98"
                )
            elif pubmed_count >= 5 or fda_reports >= 100:
                tier_note = (
                    f"EVIDENCE TIER: MEDIUM — "
                    f"confidence MUST be 0.80–0.90"
                )
            elif pubmed_count >= 1 or fda_reports >= 10:
                tier_note = (
                    f"EVIDENCE TIER: LOW — "
                    f"confidence MUST be 0.70–0.85"
                )
            elif core_text:
                tier_note = (
                    f"EVIDENCE TIER: FDA LABEL ONLY — "
                    f"confidence MUST be 0.65–0.75"
                )
            else:
                tier_note = (
                    f"EVIDENCE TIER: NONE — "
                    f"severity=unknown confidence=null"
                )

            severity_ratio = ev.get("severity_ratio", 0)
            fda_signal = ""
            if fda_reports > 0:
                fda_signal = (
                    f"  ⚠️  FDA ADVERSE EVENT SIGNAL: "
                    f"{fda_reports:,} total reports, "
                    f"{fda_serious:,} serious "
                    f"({severity_ratio:.1%} serious ratio)\n"
                    f"  This is REAL EVIDENCE — factor into "
                    f"severity and confidence.\n"
                )

            parts.append(
                f"PAIR: {drug1} + {drug2}\n"
                f"  {tier_note}\n"
                f"  PubMed papers found: {pubmed_count}\n"
                f"  FDA adverse reports: {fda_reports}\n"
                f"  FDA serious reports: {fda_serious}\n"
                f"{fda_signal}"
                f"\n"
                f"  ── CORE FDA CONTENT (read and use this) ──\n"
                f"{core_text if core_text else '  No core FDA sections found.\n'}"
                f"\n"
                f"  ── ADDITIONAL SECTIONS (index only) ──\n"
                f"{index_text if index_text else '  None.\n'}"
                f"\n"
                f"  Research abstracts:\n"
                f"{abstracts_text if abstracts_text else '  None found.\n'}"
                f"  INSTRUCTION: "
                f"{'Synthesize clinical assessment. FDA adverse event reports ARE evidence — use them to set confidence. Do NOT return insufficient evidence or null confidence when fda_reports > 0.' if has_any_evidence else 'Return severity=unknown confidence=null — zero evidence'}\n"
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

        return "\n\n".join(parts)'''


"""
VabGenRx — Safety Agent
Specialist agent for drug-drug and drug-food interaction synthesis.

CHANGES:
- _build_ddi_evidence_text uses doc-1 approach:
    • Injects FULL CONTENT of core clinical FDA sections into the prompt
    • Lists remaining non-admin sections as a character-count index
    • Fixes "Insufficient evidence" for DDI pairs that have FDA label
      data but 0 PubMed papers
- OPTION 2 FIX: Evidence data moved from instructions to content
  (thread message). Azure Agent instructions has a 256k char limit
  which overflows with 36+ drug-drug pairs. Thread message content
  has a much higher limit. Rules stay in instructions, evidence data
  moves to content — zero quality loss.
- PARALLEL BATCH FIX: synthesize() splits drug-drug pairs into
  batches of 15 and fans them out in parallel via ThreadPoolExecutor.
  All batches run simultaneously — same wall-clock time as one call.
  Works at any scale (20 drugs = 190 pairs = 13 parallel batches).
  Food interactions are always small (one per drug) — single call.
  Zero truncation. Full 500 chars/section preserved.
  Only synthesize() changed — everything else identical.
"""

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Tuple

from azure.ai.agents import AgentsClient

from .base_agent import _BaseAgent

# ── Section lists ─────────────────────────────────────────────────────────────

_CORE_SECTIONS = [
    "boxed_warning",
    "contraindications",
    "warnings",
    "warnings_and_cautions",
    "warnings_and_precautions",
    "drug_interactions",
    "adverse_reactions",
    "use_in_specific_populations",
    "indications_and_usage",
    "clinical_pharmacology",
    "mechanism_of_action",
]

# Keys that are metadata, not clinical content
_SKIP = {
    "found", "drug", "brand_names",
    "generic_names", "manufacturer",
}

# Administrative / formatting sections — index-only, never injected
_ADMIN = {
    "package_label_principal_display_panel",
    "spl_product_data_elements", "spl_medguide",
    "recent_major_changes", "how_supplied",
    "dosage_forms_and_strengths", "description",
    "references",
}

# Max DDI pairs per agent batch — keeps content well under 256k
_BATCH_SIZE = 15


class VabGenRxSafetyAgent(_BaseAgent):

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
        evidence:    Dict,
        medications: List[str]
    ) -> Dict:
        n_pairs  = len(evidence.get("drug_drug", {}))
        n_food   = len(evidence.get("drug_food", {}))
        meds_str = ', '.join(medications)

        print(f"\n   🔬 VabGenRxSafetyAgent: synthesizing "
              f"{n_pairs} drug-drug pairs, "
              f"{n_food} food interactions...")

        # ── PARALLEL BATCH FIX — DDI pairs ───────────────────────
        # Split drug-drug evidence into batches of _BATCH_SIZE.
        # All batches run simultaneously in parallel threads.
        # Food interactions are always small — single call after.
        # ─────────────────────────────────────────────────────────
        ddi_evidence  = evidence.get("drug_drug", {})
        food_evidence = evidence.get("drug_food", {})

        pairs     = list(ddi_evidence.items())
        batches   = [
            dict(pairs[i : i + _BATCH_SIZE])
            for i in range(0, len(pairs), _BATCH_SIZE)
        ]
        n_batches = len(batches)

        print(f"   📐 SafetyAgent DDI evidence: "
              f"{n_pairs} pairs → {n_batches} parallel batches "
              f"of ≤{_BATCH_SIZE}")

        all_drug_drug: List[Dict] = []

        if n_batches == 0:
            pass  # No DDI pairs — skip
        elif n_batches == 1:
            # Single batch — no thread overhead
            result = self._synthesize_ddi_batch(
                batches[0], meds_str, batch_num=1
            )
            all_drug_drug = result.get("drug_drug", [])
        else:
            # Multiple batches — fan out in parallel
            with ThreadPoolExecutor(max_workers=n_batches) as ex:
                futures = {
                    ex.submit(
                        self._synthesize_ddi_batch,
                        batch, meds_str, idx + 1
                    ): idx
                    for idx, batch in enumerate(batches)
                }
                for future in as_completed(futures):
                    idx = futures[future]
                    try:
                        result = future.result()
                        all_drug_drug.extend(
                            result.get("drug_drug", [])
                        )
                    except Exception as e:
                        print(f"   ❌ SafetyAgent DDI batch "
                              f"{idx + 1} failed: {e}")

        # ── Food interactions — always a single call ───────────────
        # One entry per drug, never overflows — no batching needed.
        all_drug_food: List[Dict] = []
        if food_evidence:
            food_result = self._synthesize_food(
                food_evidence, meds_str
            )
            all_drug_food = food_result.get("drug_food", [])

        print(f"   ✅ SafetyAgent complete — "
              f"{len(all_drug_drug)} DDI pairs, "
              f"{len(all_drug_food)} food interactions synthesized")

        return {
            "drug_drug":  all_drug_drug,
            "drug_food":  all_drug_food,
        }

    # ── DDI Batch Synthesizer ─────────────────────────────────────────────────

    def _synthesize_ddi_batch(
        self,
        ddi_evidence: Dict,
        meds_str:     str,
        batch_num:    int = 1
    ) -> Dict:
        """
        Synthesize one batch of ≤15 drug-drug pairs.
        Called in parallel by synthesize() for each DDI batch.
        Instructions = rules only. Content = evidence data.
        Both well under 256k for any batch of 15 pairs.
        """
        ddi_evidence_text = self._build_ddi_evidence_text(ddi_evidence)

        instructions = f"""
You are VabGenRxSafetyAgent, a board-certified clinical pharmacologist.
Synthesize drug-drug interactions from the evidence provided in the message.

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

4. CONFIDENCE CALIBRATION — STRICTLY ENFORCED:
   FDA adverse event reports (fda_reports) ARE real evidence.
   Never return null confidence when fda_reports > 0.

   → 20+ papers OR 1000+ FDA reports  → 0.90–0.98  MANDATORY
   → 5–20 papers OR 100–1000 reports  → 0.80–0.90  MANDATORY
   → 1–5 papers OR 10–100 reports     → 0.70–0.85  MANDATORY
   → FDA label content only           → 0.65–0.75  MANDATORY
   → Zero evidence of ANY kind        → null (severity=unknown)

   Each pair has a pre-computed EVIDENCE TIER label — your
   confidence MUST fall within that tier's range.
   Returning null when tier is HIGH/MEDIUM/LOW is a violation.

5. CACHED RESULTS:
   → If cache_hit=true — use cached data exactly as provided
   → Mark from_cache=true

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
        "pubmed_papers":          0,
        "pubmed_pmids":           [],
        "fda_reports":            0,
        "fda_serious":            0,
        "severity_ratio":         0.0,
        "fda_label_sections_count": 0,
        "evidence_tier":          1,
        "evidence_tier_name":     "...",
        "evidence_summary":       "one sentence about evidence quality"
      }}
    }}
  ]
}}
"""

        content = (
            f"MEDICATIONS: {meds_str}\n"
            f"\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"DRUG-DRUG EVIDENCE (batch {batch_num}):\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"{ddi_evidence_text}\n"
            f"\n"
            f"Synthesize drug-drug interactions.\n"
            f"Use only the evidence provided above.\n"
            f"Return JSON only."
        )

        return self._run(
            f"VabGenRxSafetyAgent_ddi_b{batch_num}",
            instructions,
            content
        )

    # ── Food Synthesizer ──────────────────────────────────────────────────────

    def _synthesize_food(
        self,
        food_evidence: Dict,
        meds_str:      str
    ) -> Dict:
        """
        Synthesize food interactions — always a single call.
        One entry per drug so never overflows 256k.
        """
        food_evidence_text = self._build_food_evidence_text(
            food_evidence
        )

        instructions = f"""
You are VabGenRxSafetyAgent, a board-certified clinical pharmacologist.
Synthesize drug-food interactions from the evidence provided in the message.

MEDICATIONS: {meds_str}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL OUTPUT RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

mechanism:
→ Explain the pharmacological reason — no PMIDs

CACHED RESULTS:
→ If cache_hit=true — use cached data exactly as provided
→ Mark from_cache=true

Return ONLY valid JSON:
{{
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
            f"MEDICATIONS: {meds_str}\n"
            f"\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"DRUG-FOOD EVIDENCE:\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"{food_evidence_text}\n"
            f"\n"
            f"Synthesize drug-food interactions.\n"
            f"Use only the evidence provided above.\n"
            f"Return JSON only."
        )

        return self._run(
            "VabGenRxSafetyAgent_food",
            instructions,
            content
        )

    # ── Evidence Text Builders ────────────────────────────────────────────────

    def _build_ddi_evidence_text(
        self,
        drug_drug_evidence: Dict
    ) -> str:
        """
        For each drug-drug pair, inject FULL CONTENT of core clinical
        FDA sections for both drugs directly into the prompt, then list
        remaining non-admin sections as a character-count index.

        Fixes "Insufficient evidence" for DDI pairs that have FDA label
        data but 0 PubMed papers.
        """
        if not drug_drug_evidence:
            return "No drug-drug pairs to analyze."

        parts = []
        for pair, ev in drug_drug_evidence.items():
            drug1, drug2 = pair

            # ── Cached pair — pass through untouched ──────────────
            if ev.get("cache_hit") and ev.get("cached_data"):
                cached    = ev["cached_data"]
                cached_ev = cached.get("evidence", {})
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
                    f"  Evidence pubmed_papers: "
                    f"{cached_ev.get('pubmed_papers', 0)}\n"
                    f"  Evidence fda_reports: "
                    f"{cached_ev.get('fda_reports', 0)}\n"
                    f"  Evidence fda_label_sections_count: "
                    f"{cached_ev.get('fda_label_sections_count', 0)}\n"
                    f"  Evidence evidence_tier: "
                    f"{cached_ev.get('evidence_tier', 1)}\n"
                    f"  Evidence evidence_tier_name: "
                    f"{cached_ev.get('evidence_tier_name', '')}\n"
                    f"  Evidence evidence_summary: "
                    f"{cached_ev.get('evidence_summary', '')}\n"
                    f"  Mark from_cache=true. "
                    f"Copy ALL fields exactly including all evidence fields above."
                )
                continue

            fda_l1 = ev.get("fda_label_drug1", {})
            fda_l2 = ev.get("fda_label_drug2", {})

            # ── Inject core sections in full (up to 500 chars each) ─
            def _inject_core(drug_name: str, label: dict) -> tuple:
                lines    = []
                injected = set()
                for section in _CORE_SECTIONS:
                    content = label.get(section, "")
                    if content:
                        sec_label = section.replace("_", " ").upper()
                        lines.append(
                            f"  {drug_name} FDA {sec_label}:\n"
                            f"  {str(content)[:500]}\n"
                        )
                        injected.add(section)
                return "".join(lines), injected

            core_text1, injected1 = _inject_core(drug1, fda_l1)
            core_text2, injected2 = _inject_core(drug2, fda_l2)
            core_text = core_text1 + core_text2

            # ── List remaining sections as a character-count index ──
            def _remaining_index(
                drug_name: str, label: dict, injected: set
            ) -> str:
                rem = {
                    k: len(str(v))
                    for k, v in label.items()
                    if k not in injected
                    and k not in _SKIP
                    and k not in _ADMIN
                    and v
                    and not k.endswith("_table")
                }
                if not rem:
                    return ""
                lines = "\n".join(
                    f"    {drug_name} — {k} ({chars} chars)"
                    for k, chars in sorted(
                        rem.items(), key=lambda x: x[1], reverse=True
                    )
                )
                return lines + "\n"

            index_text = (
                _remaining_index(drug1, fda_l1, injected1) +
                _remaining_index(drug2, fda_l2, injected2)
            )

            abstracts_text = ""
            for i, ab in enumerate(ev.get("abstracts", []), 1):
                abstracts_text += f"  Research finding {i}: {ab}\n"

            has_any_evidence = (
                ev.get("pubmed_count", 0) > 0 or
                ev.get("fda_reports",  0) > 0 or
                bool(fda_l1) or bool(fda_l2)
            )

            fda_reports  = ev.get("fda_reports",  0)
            pubmed_count = ev.get("pubmed_count", 0)
            fda_serious  = ev.get("fda_serious",  0)

            if pubmed_count >= 20 or fda_reports >= 1000:
                tier_note = "EVIDENCE TIER: HIGH — confidence MUST be 0.90–0.98"
            elif pubmed_count >= 5 or fda_reports >= 100:
                tier_note = "EVIDENCE TIER: MEDIUM — confidence MUST be 0.80–0.90"
            elif pubmed_count >= 1 or fda_reports >= 10:
                tier_note = "EVIDENCE TIER: LOW — confidence MUST be 0.70–0.85"
            elif core_text:
                tier_note = "EVIDENCE TIER: FDA LABEL ONLY — confidence MUST be 0.65–0.75"
            else:
                tier_note = "EVIDENCE TIER: NONE — severity=unknown confidence=null"

            severity_ratio = ev.get("severity_ratio", 0)
            fda_signal = ""
            if fda_reports > 0:
                fda_signal = (
                    f"  ⚠️  FDA ADVERSE EVENT SIGNAL: "
                    f"{fda_reports:,} total reports, "
                    f"{fda_serious:,} serious "
                    f"({severity_ratio:.1%} serious ratio)\n"
                    f"  This is REAL EVIDENCE — factor into "
                    f"severity and confidence.\n"
                )

            parts.append(
                f"PAIR: {drug1} + {drug2}\n"
                f"  {tier_note}\n"
                f"  PubMed papers found: {pubmed_count}\n"
                f"  FDA adverse reports: {fda_reports}\n"
                f"  FDA serious reports: {fda_serious}\n"
                f"{fda_signal}"
                f"\n"
                f"  ── CORE FDA CONTENT (read and use this) ──\n"
                f"{core_text if core_text else '  No core FDA sections found.\n'}"
                f"\n"
                f"  ── ADDITIONAL SECTIONS (index only) ──\n"
                f"{index_text if index_text else '  None.\n'}"
                f"\n"
                f"  Research abstracts:\n"
                f"{abstracts_text if abstracts_text else '  None found.\n'}"
                f"  INSTRUCTION: "
                f"{'Synthesize clinical assessment. FDA adverse event reports ARE evidence — use them to set confidence. Do NOT return insufficient evidence or null confidence when fda_reports > 0.' if has_any_evidence else 'Return severity=unknown confidence=null — zero evidence'}\n"
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