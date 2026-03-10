"""
VabGenRx Disease Agent

Specialist agent for drug-disease contraindication synthesis.
Operates in Phase 2 of the VabGenRx pipeline.

Responsibilities
----------------
• Synthesize drug-disease contraindication risks from FDA and PubMed evidence
• Classify severity and confidence for each drug-disease pair
• Support Round 2 re-evaluation when compounding signals are detected
• Batch synthesis for scalability (≤15 pairs per agent call)

Round 2
-------
When the SignalExtractor detects cross-domain compounding risks,
this agent re-evaluates its Round 1 conclusions with the
additional clinical context.
"""

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List

from azure.ai.agents import AgentsClient

from .base_agent import _BaseAgent

_SKIP = {
    "found", "drug", "brand_names",
    "generic_names", "manufacturer",
}

_ADMIN = {
    "package_label_principal_display_panel",
    "spl_product_data_elements", "spl_medguide",
    "recent_major_changes", "how_supplied",
    "dosage_forms_and_strengths", "description",
    "references", "set_id", "id", "version", "effective_time",
}

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

# Reduced from 15 to 8 — prevents Azure Agent output token truncation.
# Full FDA label content per pair is ~5k chars. 8 pairs × 5k = ~40k
# output chars, safely under the Azure Agent response limit.
_BATCH_SIZE = 8


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
        """
        Round 1 synthesis of all drug-disease pairs.
        Splits evidence into batches of ≤8 and processes in parallel.
        Fully-cached batches bypass the Azure Agent entirely.
        Missing pairs after synthesis are filled from cache or flagged.
        """
        n_pairs  = len(evidence)
        meds_str = ', '.join(medications)
        dis_str  = ', '.join(diseases)

        print(f"\n   🔬 VabGenRxDiseaseAgent Round 1: "
              f"synthesizing {n_pairs} drug-disease pairs...")

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

        def _run_batch_with_retry(batch, meds_str, dis_str, batch_num):
            # ── Cache bypass ───────────────────────────────────────
            all_cached = all(
                ev.get("cache_hit") and ev.get("cached_data")
                for ev in batch.values()
            )
            if all_cached:
                print(f"   ⚡ DiseaseAgent batch {batch_num} "
                      f"fully cached — bypassing agent")
                drug_disease = []
                for pair_key, ev in batch.items():
                    cached = ev["cached_data"]
                    cached["from_cache"] = True
                    if not cached.get("drug"):
                        cached["drug"] = pair_key[0]
                    if not cached.get("disease"):
                        cached["disease"] = pair_key[1]
                    drug_disease.append(cached)
                return {"drug_disease": drug_disease}

            # ── Fresh pairs — run agent ────────────────────────────
            result   = self._synthesize_batch(batch, meds_str, dis_str, batch_num)
            expected = len(batch)
            returned = len(result.get("drug_disease", []))

            # ── Layer 1: count check + retry ───────────────────────
            # If the agent silently dropped pairs (LLM truncation),
            # retry once before falling back to Layer 3.
            if returned < expected:
                print(f"   ⚠️  DiseaseAgent batch {batch_num}: "
                      f"expected {expected} pairs, got {returned} "
                      f"— retrying...")
                import time; time.sleep(5)
                result   = self._synthesize_batch(batch, meds_str, dis_str, batch_num)
                returned = len(result.get("drug_disease", []))
                if returned < expected:
                    print(f"   ❌ DiseaseAgent batch {batch_num}: "
                          f"still {returned}/{expected} after retry "
                          f"— filling missing pairs from cache")

            # ── Layer 3: fill missing pairs from cache ─────────────
            # After retry, check which pairs are still missing.
            # Fill from cached data if available, otherwise flag unknown.
            returned_pairs = {
                (
                    r.get("drug",    "").lower(),
                    r.get("disease", "").lower()
                )
                for r in result.get("drug_disease", [])
            }

            for pair_key, ev in batch.items():
                drug, disease = pair_key
                key = (drug.lower(), disease.lower())
                if key not in returned_pairs:
                    if ev.get("cache_hit") and ev.get("cached_data"):
                        cached = ev["cached_data"]
                        cached["from_cache"] = True
                        cached["drug"]    = cached.get("drug")    or drug
                        cached["disease"] = cached.get("disease") or disease
                        result.setdefault("drug_disease", []).append(cached)
                        print(f"   🔄 Filled missing pair from cache: "
                              f"{drug}+{disease}")
                    else:
                        # No cache — append unknown placeholder so
                        # the pair is never silently dropped from the
                        # doctor's view.
                        result.setdefault("drug_disease", []).append({
                            "drug":              drug,
                            "disease":           disease,
                            "contraindicated":   False,
                            "severity":          "unknown",
                            "confidence":        None,
                            "clinical_evidence": (
                                "Assessment unavailable — "
                                "agent did not return this pair. "
                                "Consult clinical pharmacist."
                            ),
                            "recommendation":    (
                                "Manual clinical review required."
                            ),
                            "alternative_drugs": [],
                            "from_cache":        False,
                            "insufficient_evidence": True,
                            "evidence": {
                                "pubmed_papers":            0,
                                "fda_label_sections_count": 0,
                                "evidence_tier":            4,
                                "evidence_tier_name":       "UNAVAILABLE",
                                "evidence_summary":         "Agent truncation — pair not assessed",
                            },
                        })
                        print(f"   ⚠️  Added unknown placeholder: "
                              f"{drug}+{disease}")

            return result

        if n_batches == 1:
            result           = _run_batch_with_retry(
                batches[0], meds_str, dis_str, batch_num=1
            )
            all_drug_disease = result.get("drug_disease", [])
        else:
            with ThreadPoolExecutor(max_workers=n_batches) as ex:
                futures = {
                    ex.submit(
                        _run_batch_with_retry,
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
              f"{len(all_drug_disease)}/{n_pairs} pairs synthesized")

        return {"drug_disease": all_drug_disease}

    def _synthesize_batch(
        self,
        evidence:  Dict,
        meds_str:  str,
        dis_str:   str,
        batch_num: int = 1
    ) -> Dict:
        """
        Synthesize one batch of ≤8 drug-disease pairs.
        Concurrency enforced by client-level semaphore in _BaseAgent._run().
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

3. SEVERITY CLASSIFICATION:
   SEVERE / contraindicated=true:
   → FDA label explicitly lists this disease as contraindication
   MODERATE / contraindicated=false:
   → Increased monitoring required
   MINOR / contraindicated=false:
   → Low clinical significance
   UNKNOWN / contraindicated=false:
   → ONLY when no FDA content AND no PubMed present

4. CONFIDENCE CALIBRATION:
   → Full FDA label (4+ sections) + 10+ papers → 0.88–0.95
   → Partial FDA label + 5+ papers              → 0.78–0.88
   → FDA label only (any sections)              → 0.70–0.80
   → Papers only (no FDA label)                 → 0.68–0.78
   → Zero evidence of any kind                  → null

5. MANDATORY COMPLETENESS — CRITICAL:
   → You MUST return EVERY pair listed in the evidence
   → Never omit a pair — return all {len(evidence)} pairs
   → Every pair must have populated clinical_evidence and recommendation

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
            f"DRUG-DISEASE EVIDENCE (batch {batch_num}, "
            f"{len(evidence)} pairs):\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"{evidence_text}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"\n"
            f"Return ALL {len(evidence)} drug-disease pairs.\n"
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
        """
        Round 2 re-evaluation using compounding signal context.
        Falls back to Round 1 results if the agent fails.
        """
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

clinical_evidence: plain language clinical risk — no PMIDs
recommendation: specific clinical action — never empty
All text fields must be populated — never empty strings

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
            f"Re-evaluate Round 1 in light of compounding signals.\n"
            f"Set round2_updated=true and explain in round2_note if changed.\n"
            f"Return ALL {len(round1_list)} pairs. "
            f"Unchanged pairs return Round 1 exactly with round2_updated=false.\n"
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
        Build evidence text for the agent prompt.
        Injects full core FDA section content and lists remaining
        sections as a character-count index.
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
                    f"  Contraindicated: {cached.get('contraindicated', False)}\n"
                    f"  Severity: {cached.get('severity', 'unknown')}\n"
                    f"  Clinical evidence: {cached.get('clinical_evidence', '')}\n"
                    f"  Recommendation: {cached.get('recommendation', '')}\n"
                    f"  Mark from_cache=true. Copy all fields exactly."
                )
                continue

            full_label = ev.get("fda_label_full", {})
            fda_found  = full_label.get("found", False)
            sec_index  = ev.get("fda_section_index", {})

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

            remaining = {
                k: v for k, v in sec_index.items()
                if k not in injected
                and k not in _SKIP
                and k not in _ADMIN
                and not k.endswith("_table")
            }
            index_lines = "\n".join(
                f"    {name} ({chars} chars)"
                for name, chars in sorted(
                    remaining.items(), key=lambda x: x[1], reverse=True
                )
            ) if remaining else "    None"

            abstracts_text = "".join(
                f"  Research finding {i}: {ab}\n"
                for i, ab in enumerate(ev.get("abstracts", []), 1)
            )

            has_any_evidence = ev.get("pubmed_count", 0) > 0 or fda_found
            sections_found   = ev.get("fda_label_sections_found", [])

            parts.append(
                f"PAIR: {drug} + {disease}\n"
                f"  PubMed papers found: {ev.get('pubmed_count', 0)}\n"
                f"  FDA label found: {fda_found} "
                f"({len(sections_found)} sections total)\n"
                f"\n"
                f"  ── CORE FDA CONTENT (read and use this) ──\n"
                f"{core_text}"
                f"\n"
                f"  ── ADDITIONAL SECTIONS (index) ──\n"
                f"{index_lines}\n"
                f"\n"
                f"  PubMed abstracts:\n"
                f"{abstracts_text or '  None found.\n'}"
                f"\n"
                f"  INSTRUCTION: "
                f"{'Synthesize a real clinical assessment. Do NOT return insufficient evidence if FDA content is present.' if has_any_evidence else 'Return severity=unknown confidence=null — truly no evidence found.'}\n"
            )

        return "\n\n".join(parts)

    # ── Signal Context Builder ────────────────────────────────────

    def _build_signal_context(self, compounding_signals: Dict) -> str:
        """Format compounding signals for the Round 2 agent prompt."""
        if not compounding_signals:
            return "No compounding signals."

        parts = []
        for organ_system, signal_data in compounding_signals.items():
            sources_text = "".join(
                f"    - [{src.get('domain', '').upper()}] "
                f"{src.get('drug', '')} — {src.get('finding', '')}\n"
                for src in signal_data.get("sources", [])
            )
            parts.append(
                f"COMPOUNDING SIGNAL — {organ_system.upper()}:\n"
                f"  Severity:     {signal_data.get('severity', '')}\n"
                f"  Signal count: {signal_data.get('signal_count', 0)}\n"
                f"  Explanation:  {signal_data.get('explanation', '')}\n"
                f"  Sources:\n{sources_text}"
                f"  Re-evaluation guidance:\n"
                f"    {signal_data.get('round2_instructions', '')}"
            )

        return "\n\n".join(parts)