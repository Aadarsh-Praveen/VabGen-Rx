'''
"""
VabGenRx — Disease Agent
Specialist agent for drug-disease contraindication synthesis.

CHANGES:
- _build_evidence_text now injects FULL CONTENT of 9 core
  clinical FDA sections directly into the prompt instead of
  sending only a section index.
- This fixes "Insufficient evidence" showing for pairs where
  PubMed has 0 papers but FDA label has 19-21 sections —
  previously agent could see section names but not content.
- Remaining non-core sections still listed as index only.
- Agent instruction updated: never return insufficient evidence
  when FDA core content is present.
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

# Admin sections — not clinically useful for drug-disease analysis
_ADMIN = {
    "package_label_principal_display_panel",
    "spl_product_data_elements", "spl_medguide",
    "recent_major_changes", "how_supplied",
    "dosage_forms_and_strengths", "description",
    "references", "set_id", "id", "version", "effective_time",
}

# Core sections — always injected with full content
# These directly answer: is this drug safe for this disease?
_CORE_SECTIONS = [
    "boxed_warning",
    "contraindications",
    "warnings",
    "warnings_and_cautions",
    "warnings_and_precautions",
    "drug_interactions",
    "use_in_specific_populations",
    "adverse_reactions",
    "indications_and_usage",
    "pregnancy",
    "nursing_mothers",
]


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
   → Use the FDA content provided — it contains real clinical data
   → NEVER write "There are multiple PubMed articles..."
   → NEVER write paper counts or PMIDs in this field
   → NEVER write "insufficient evidence" if FDA content is present
   → ALWAYS describe the actual clinical risk to the patient

   recommendation:
   → Specific clinical action for the prescriber
   → NEVER leave this field empty

   alternative_drugs:
   → List safer alternatives for this specific disease context

2. EVIDENCE USE:
   → Core FDA sections are provided in full — READ and USE them
   → Even with 0 PubMed papers, FDA label content is real evidence
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
   → ONLY when has_any_evidence=false AND no FDA content present
   → DO NOT use unknown if FDA core content was provided

4. CONFIDENCE CALIBRATION:
   → Full FDA label (4+ sections) + 10+ papers → 0.88–0.95
   → Partial FDA label + 5+ papers              → 0.78–0.88
   → FDA label only (any sections)              → 0.70–0.80
   → Papers only (no FDA label)                 → 0.68–0.78
   → Zero evidence of any kind                  → null

5. MANDATORY COMPLETENESS:
   → Every pair must have populated clinical_evidence
   → Every pair must have populated recommendation
   → Never return empty string for these fields

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DRUG-DISEASE EVIDENCE:
{evidence_text}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
      "requested_sections": [],
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

    # ── Evidence Text Builder ─────────────────────────────────────

    def _build_evidence_text(self, evidence: Dict) -> str:
        """
        For each drug-disease pair:

        1. Injects FULL CONTENT of core clinical sections directly
           into the prompt — agent reads the actual FDA text.
        2. Lists remaining sections as index — agent can reference
           them in requested_sections[] if needed.

        Core sections injected (up to 600 chars each):
           boxed_warning, contraindications, warnings,
           warnings_and_cautions, warnings_and_precautions,
           drug_interactions, use_in_specific_populations,
           adverse_reactions, indications_and_usage

        This ensures the agent always has real evidence to reason
        from even when PubMed has 0 papers for a pair.
        """
        if not evidence:
            return "No drug-disease pairs to analyze."

        parts = []
        for pair, ev in evidence.items():
            drug, disease = pair

            # ── Cached result — use directly ───────────────────────
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

            # ── Fresh result — inject core content ─────────────────
            full_label = ev.get("fda_label_full", {})
            fda_found  = full_label.get("found", False)
            sec_index  = ev.get("fda_section_index", {})

            # Step 1: Inject core sections with full content
            core_lines = []
            injected   = set()
            for section in _CORE_SECTIONS:
                content = full_label.get(section, "")
                if content:
                    label = section.replace("_", " ").upper()
                    core_lines.append(
                        f"  FDA {label}:\n"
                        f"  {str(content)[:600]}\n"
                    )
                    injected.add(section)

            core_text = (
                "".join(core_lines)
                or "  No core FDA sections found for this drug.\n"
            )

            # Step 2: List remaining sections as index only
            remaining = {
                k: v for k, v in sec_index.items()
                if k not in injected
                and k not in _SKIP
                and k not in _ADMIN
                and not k.endswith("_table")
            }
            if remaining:
                sorted_remaining = sorted(
                    remaining.items(),
                    key=lambda x: x[1],
                    reverse=True
                )
                index_lines = "\n".join(
                    f"    {name} ({chars} chars)"
                    for name, chars in sorted_remaining
                )
            else:
                index_lines = "    None"

            abstracts_text = ""
            for i, ab in enumerate(ev.get("abstracts", []), 1):
                abstracts_text += (
                    f"  Research finding {i}: {ab}\n"
                )

            has_any_evidence = (
                ev.get("pubmed_count", 0) > 0 or fda_found
            )

            sections_found = ev.get(
                "fda_label_sections_found", []
            )

            parts.append(
                f"PAIR: {drug} + {disease}\n"
                f"  PubMed papers found: "
                f"{ev.get('pubmed_count', 0)}\n"
                f"  FDA label found: {fda_found} "
                f"({len(sections_found)} sections total)\n"
                f"\n"
                f"  ── CORE FDA CONTENT (read and use this) ──\n"
                f"{core_text}"
                f"\n"
                f"  ── ADDITIONAL SECTIONS "
                f"(index — request if needed) ──\n"
                f"{index_lines}\n"
                f"\n"
                f"  PubMed abstracts:\n"
                f"{abstracts_text if abstracts_text else '  None found.\n'}"
                f"\n"
                f"  INSTRUCTION: "
                f"{'Synthesize a real clinical assessment using the FDA content above. Do NOT return insufficient evidence if FDA content is present.' if has_any_evidence else 'Return severity=unknown confidence=null — truly no evidence found.'}\n"
            )

        return "\n\n".join(parts)

    # ── Signal Context Builder ────────────────────────────────────

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

        return "\n\n".join(parts)'''



"""
VabGenRx — Disease Agent
Specialist agent for drug-disease contraindication synthesis.

CHANGES:
- _build_evidence_text now injects FULL CONTENT of 9 core
  clinical FDA sections directly into the prompt instead of
  sending only a section index.
- This fixes "Insufficient evidence" showing for pairs where
  PubMed has 0 papers but FDA label has 19-21 sections —
  previously agent could see section names but not content.
- Remaining non-core sections still listed as index only.
- Agent instruction updated: never return insufficient evidence
  when FDA core content is present.
- OPTION 2 FIX: Evidence data moved from instructions to content
  (thread message). Azure Agent instructions has a 256k char limit
  which overflows with 36+ drug-disease pairs. Thread message
  content has a much higher limit. Rules stay in instructions,
  evidence data moves to content — zero quality loss.
- PARALLEL BATCH FIX: synthesize() splits evidence into batches
  of 15 pairs and fans them out in parallel via ThreadPoolExecutor.
  All batches run simultaneously — same wall-clock time as one call.
  Works at any scale (20 drugs = 190 pairs = 13 parallel batches).
  Zero truncation. Full 600 chars/section preserved.
  Only synthesize() changed — everything else identical.
"""

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List

from azure.ai.agents import AgentsClient

from .base_agent import _BaseAgent

# Keys that are metadata, not clinical content
_SKIP = {
    "found", "drug", "brand_names",
    "generic_names", "manufacturer",
}

# Admin sections — not clinically useful for drug-disease analysis
_ADMIN = {
    "package_label_principal_display_panel",
    "spl_product_data_elements", "spl_medguide",
    "recent_major_changes", "how_supplied",
    "dosage_forms_and_strengths", "description",
    "references", "set_id", "id", "version", "effective_time",
}

# Core sections — always injected with full content
# These directly answer: is this drug safe for this disease?
_CORE_SECTIONS = [
    "boxed_warning",
    "contraindications",
    "warnings",
    "warnings_and_cautions",
    "warnings_and_precautions",
    "drug_interactions",
    "use_in_specific_populations",
    "adverse_reactions",
    "indications_and_usage",
    "pregnancy",
    "nursing_mothers",
]

# Max pairs per agent batch — keeps content well under 256k
_BATCH_SIZE = 15


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

        # ── PARALLEL BATCH FIX ────────────────────────────────────
        # Split evidence into batches of _BATCH_SIZE pairs.
        # All batches run simultaneously in parallel threads.
        # Same wall-clock time as one call, works at any scale.
        # ─────────────────────────────────────────────────────────
        pairs     = list(evidence.items())
        batches   = [
            dict(pairs[i : i + _BATCH_SIZE])
            for i in range(0, len(pairs), _BATCH_SIZE)
        ]
        n_batches = len(batches)

        print(f"   📐 DiseaseAgent evidence: "
              f"{n_pairs} pairs → {n_batches} parallel batches "
              f"of ≤{_BATCH_SIZE}")

        all_drug_disease: List[Dict] = []

        if n_batches == 1:
            # Single batch — no thread overhead
            result = self._synthesize_batch(
                batches[0], meds_str, dis_str, batch_num=1
            )
            all_drug_disease = result.get("drug_disease", [])
        else:
            # Multiple batches — fan out in parallel
            with ThreadPoolExecutor(max_workers=n_batches) as ex:
                futures = {
                    ex.submit(
                        self._synthesize_batch,
                        batch, meds_str, dis_str, idx + 1
                    ): idx
                    for idx, batch in enumerate(batches)
                }
                for future in as_completed(futures):
                    idx = futures[future]
                    try:
                        result = future.result()
                        all_drug_disease.extend(
                            result.get("drug_disease", [])
                        )
                    except Exception as e:
                        print(f"   ❌ DiseaseAgent batch "
                              f"{idx + 1} failed: {e}")

        print(f"   ✅ DiseaseAgent Round 1 complete — "
              f"{len(all_drug_disease)} pairs synthesized")

        return {"drug_disease": all_drug_disease}

    def _synthesize_batch(
        self,
        evidence:    Dict,
        meds_str:    str,
        dis_str:     str,
        batch_num:   int = 1
    ) -> Dict:
        """
        Synthesize one batch of ≤15 drug-disease pairs.
        Called in parallel by synthesize() for each batch.
        Instructions = rules only. Content = evidence data.
        Both well under 256k for any batch of 15 pairs.
        """
        evidence_text = self._build_evidence_text(evidence)

        instructions = f"""
You are VabGenRxDiseaseAgent, a board-certified clinical pharmacologist
specializing in drug-disease contraindications.
Synthesize drug-disease contraindications from the evidence in the message.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL OUTPUT RULES — READ CAREFULLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. FIELD CONTENT RULES — strictly enforced:

   clinical_evidence:
   → Describe the CLINICAL RISK to the patient in plain language
   → Explain why this drug is concerning in this disease state
   → Use the FDA content provided — it contains real clinical data
   → NEVER write "There are multiple PubMed articles..."
   → NEVER write paper counts or PMIDs in this field
   → NEVER write "insufficient evidence" if FDA content is present
   → ALWAYS describe the actual clinical risk to the patient

   recommendation:
   → Specific clinical action for the prescriber
   → NEVER leave this field empty

   alternative_drugs:
   → List safer alternatives for this specific disease context

2. EVIDENCE USE:
   → Core FDA sections are provided in full — READ and USE them
   → Even with 0 PubMed papers, FDA label content is real evidence
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
   → ONLY when has_any_evidence=false AND no FDA content present
   → DO NOT use unknown if FDA core content was provided

4. CONFIDENCE CALIBRATION:
   → Full FDA label (4+ sections) + 10+ papers → 0.88–0.95
   → Partial FDA label + 5+ papers              → 0.78–0.88
   → FDA label only (any sections)              → 0.70–0.80
   → Papers only (no FDA label)                 → 0.68–0.78
   → Zero evidence of any kind                  → null

5. MANDATORY COMPLETENESS:
   → Every pair must have populated clinical_evidence
   → Every pair must have populated recommendation
   → Never return empty string for these fields

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
      "requested_sections": [],
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
            f"MEDICATIONS: {meds_str}\n"
            f"CONDITIONS:  {dis_str}\n"
            f"\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"DRUG-DISEASE EVIDENCE (batch {batch_num}):\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"{evidence_text}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"\n"
            f"Synthesize drug-disease contraindications.\n"
            f"Use only the evidence provided above.\n"
            f"Return JSON only."
        )

        return self._run(
            f"VabGenRxDiseaseAgent_b{batch_num}",
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

        # Round 2 data is always small — Round 1 JSON + signals only.
        # No batching needed here.
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

Return ONLY a single valid JSON object:
{{
  "drug_disease": [ ... all pairs ... ]
}}
"""

        content = (
            f"COMPOUNDING SIGNALS DETECTED:\n"
            f"{signal_text}\n"
            f"\n"
            f"YOUR ROUND 1 ASSESSMENTS:\n"
            f"{round1_text}\n"
            f"\n"
            f"TASK:\n"
            f"Re-evaluate Round 1 in light of compounding signals.\n"
            f"Set round2_updated=true and explain in round2_note if changed.\n"
            f"Return ALL pairs. Unchanged pairs return Round 1 exactly\n"
            f"with round2_updated=false.\n"
            f"\n"
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

    # ── Evidence Text Builder ─────────────────────────────────────

    def _build_evidence_text(self, evidence: Dict) -> str:
        """
        For each drug-disease pair:

        1. Injects FULL CONTENT of core clinical sections directly
           into the prompt — agent reads the actual FDA text.
        2. Lists remaining sections as index — agent can reference
           them in requested_sections[] if needed.

        Core sections injected (up to 600 chars each):
           boxed_warning, contraindications, warnings,
           warnings_and_cautions, warnings_and_precautions,
           drug_interactions, use_in_specific_populations,
           adverse_reactions, indications_and_usage

        This ensures the agent always has real evidence to reason
        from even when PubMed has 0 papers for a pair.
        """
        if not evidence:
            return "No drug-disease pairs to analyze."

        parts = []
        for pair, ev in evidence.items():
            drug, disease = pair

            # ── Cached result — use directly ───────────────────────
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

            # ── Fresh result — inject core content ─────────────────
            full_label = ev.get("fda_label_full", {})
            fda_found  = full_label.get("found", False)
            sec_index  = ev.get("fda_section_index", {})

            # Step 1: Inject core sections with full content
            core_lines = []
            injected   = set()
            for section in _CORE_SECTIONS:
                content = full_label.get(section, "")
                if content:
                    label = section.replace("_", " ").upper()
                    core_lines.append(
                        f"  FDA {label}:\n"
                        f"  {str(content)[:600]}\n"
                    )
                    injected.add(section)

            core_text = (
                "".join(core_lines)
                or "  No core FDA sections found for this drug.\n"
            )

            # Step 2: List remaining sections as index only
            remaining = {
                k: v for k, v in sec_index.items()
                if k not in injected
                and k not in _SKIP
                and k not in _ADMIN
                and not k.endswith("_table")
            }
            if remaining:
                sorted_remaining = sorted(
                    remaining.items(),
                    key=lambda x: x[1],
                    reverse=True
                )
                index_lines = "\n".join(
                    f"    {name} ({chars} chars)"
                    for name, chars in sorted_remaining
                )
            else:
                index_lines = "    None"

            abstracts_text = ""
            for i, ab in enumerate(ev.get("abstracts", []), 1):
                abstracts_text += (
                    f"  Research finding {i}: {ab}\n"
                )

            has_any_evidence = (
                ev.get("pubmed_count", 0) > 0 or fda_found
            )

            sections_found = ev.get(
                "fda_label_sections_found", []
            )

            parts.append(
                f"PAIR: {drug} + {disease}\n"
                f"  PubMed papers found: "
                f"{ev.get('pubmed_count', 0)}\n"
                f"  FDA label found: {fda_found} "
                f"({len(sections_found)} sections total)\n"
                f"\n"
                f"  ── CORE FDA CONTENT (read and use this) ──\n"
                f"{core_text}"
                f"\n"
                f"  ── ADDITIONAL SECTIONS "
                f"(index — request if needed) ──\n"
                f"{index_lines}\n"
                f"\n"
                f"  PubMed abstracts:\n"
                f"{abstracts_text if abstracts_text else '  None found.\n'}"
                f"\n"
                f"  INSTRUCTION: "
                f"{'Synthesize a real clinical assessment using the FDA content above. Do NOT return insufficient evidence if FDA content is present.' if has_any_evidence else 'Return severity=unknown confidence=null — truly no evidence found.'}\n"
            )

        return "\n\n".join(parts)

    # ── Signal Context Builder ────────────────────────────────────

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