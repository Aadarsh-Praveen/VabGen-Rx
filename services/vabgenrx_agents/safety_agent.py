"""
VabGenRx Safety Agent

Specialist clinical reasoning agent responsible for synthesizing
drug-drug and drug-food interaction risks using structured
clinical evidence.

Purpose
-------
The SafetyAgent analyzes interaction evidence gathered from
multiple sources and generates clinically actionable interaction
assessments for prescribers.

Evidence Sources
----------------
• PubMed scientific literature
• FDA FAERS adverse event reports
• FDA drug labeling sections
• Cached historical interaction analyses

Capabilities
------------
• Drug-drug interaction risk assessment
• Drug-food interaction synthesis
• Evidence-based severity classification
• Confidence scoring based on evidence tiers
• Parallel batch processing of interaction pairs

Architecture Role
-----------------
This agent operates in Phase 2 of the VabGenRx workflow:

Phase 1: Evidence gathering (Python services)
Phase 2: SafetyAgent synthesizes drug interaction risks
Phase 3: Signal extractor evaluates cross-domain patterns
Phase 4: Optional Round 2 re-evaluation if compounding signals exist

Design Highlights
-----------------
• Batch synthesis prevents Azure token limits
• Parallel processing improves throughput
• Global concurrency control prevents Azure agent quota failures
• Deterministic outputs ensured through temperature=0

Output
------
Produces structured interaction assessments including:
- severity classification
- confidence scores
- pharmacological mechanisms
- clinical effects
- prescriber recommendations
"""


import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Tuple

from azure.ai.agents import AgentsClient

from .base_agent import _BaseAgent

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

_SKIP = {
    "found", "drug", "brand_names",
    "generic_names", "manufacturer",
}

_ADMIN = {
    "package_label_principal_display_panel",
    "spl_product_data_elements", "spl_medguide",
    "recent_major_changes", "how_supplied",
    "dosage_forms_and_strengths", "description",
    "references",
}

_BATCH_SIZE = 5


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
        """
        Round 1 synthesis of all drug-drug and drug-food pairs.
        DDI pairs split into batches of ≤5, processed in parallel.
        Fully-cached batches bypass the Azure Agent entirely.
        Missing pairs after synthesis are filled from cache or flagged.
        """
        n_pairs  = len(evidence.get("drug_drug", {}))
        n_food   = len(evidence.get("drug_food", {}))
        meds_str = ', '.join(medications)

        print(f"\n   🔬 VabGenRxSafetyAgent: synthesizing "
              f"{n_pairs} drug-drug pairs, "
              f"{n_food} food interactions...")

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

        def _run_ddi_batch_with_retry(batch, meds_str, batch_num):
            # ── Cache bypass ───────────────────────────────────────
            all_cached = all(
                ev.get("cache_hit") and ev.get("cached_data")
                for ev in batch.values()
            )
            if all_cached:
                print(f"   ⚡ SafetyAgent DDI batch {batch_num} "
                      f"fully cached — bypassing agent")
                drug_drug = []
                for pair_key, ev in batch.items():
                    cached = ev["cached_data"]
                    cached["from_cache"] = True
                    if not cached.get("drug1"):
                        cached["drug1"] = pair_key[0]
                    if not cached.get("drug2"):
                        cached["drug2"] = pair_key[1]
                    drug_drug.append(cached)
                return {"drug_drug": drug_drug}

            # ── Fresh pairs — run agent ────────────────────────────
            result   = self._synthesize_ddi_batch(batch, meds_str, batch_num)
            expected = len(batch)
            returned = len(result.get("drug_drug", []))

            # ── Layer 1: count check + retry ───────────────────────
            if returned < expected:
                print(f"   ⚠️  SafetyAgent DDI batch {batch_num}: "
                      f"expected {expected} pairs, got {returned} "
                      f"— retrying...")
                import time; time.sleep(5)
                result   = self._synthesize_ddi_batch(batch, meds_str, batch_num)
                returned = len(result.get("drug_drug", []))
                if returned < expected:
                    print(f"   ❌ SafetyAgent DDI batch {batch_num}: "
                          f"still {returned}/{expected} after retry "
                          f"— filling missing pairs from cache")

            # ── Layer 3: fill missing pairs from cache ─────────────
            returned_pairs = {
                (
                    r.get("drug1", "").lower(),
                    r.get("drug2", "").lower()
                )
                for r in result.get("drug_drug", [])
            }

            for pair_key, ev in batch.items():
                drug1, drug2 = pair_key
                # Check both orderings since pairs can be stored either way
                key1 = (drug1.lower(), drug2.lower())
                key2 = (drug2.lower(), drug1.lower())
                if key1 not in returned_pairs and key2 not in returned_pairs:
                    if ev.get("cache_hit") and ev.get("cached_data"):
                        cached = ev["cached_data"]
                        cached["from_cache"] = True
                        cached["drug1"] = cached.get("drug1") or drug1
                        cached["drug2"] = cached.get("drug2") or drug2
                        result.setdefault("drug_drug", []).append(cached)
                        print(f"   🔄 Filled missing DDI from cache: "
                              f"{drug1}+{drug2}")
                    else:
                        result.setdefault("drug_drug", []).append({
                            "drug1":            drug1,
                            "drug2":            drug2,
                            "severity":         "unknown",
                            "confidence":       None,
                            "mechanism":        (
                                "Assessment unavailable — "
                                "agent did not return this pair."
                            ),
                            "clinical_effects": (
                                "Consult clinical pharmacist."
                            ),
                            "recommendation":   (
                                "Manual clinical review required."
                            ),
                            "from_cache":       False,
                            "insufficient_evidence": True,
                            "evidence": {
                                "pubmed_papers":            0,
                                "fda_reports":              0,
                                "fda_label_sections_count": 0,
                                "evidence_tier":            4,
                                "evidence_tier_name":       "UNAVAILABLE",
                                "evidence_summary":         "Agent truncation — pair not assessed",
                            },
                        })
                        print(f"   ⚠️  Added unknown placeholder: "
                              f"{drug1}+{drug2}")

            return result

        if n_batches == 0:
            pass
        elif n_batches == 1:
            result        = _run_ddi_batch_with_retry(
                batches[0], meds_str, batch_num=1
            )
            all_drug_drug = result.get("drug_drug", [])
        else:
            with ThreadPoolExecutor(max_workers=n_batches) as ex:
                futures = {
                    ex.submit(
                        _run_ddi_batch_with_retry,
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

        all_drug_food: List[Dict] = []
        if food_evidence:
            food_result   = self._synthesize_food(food_evidence, meds_str)
            all_drug_food = food_result.get("drug_food", [])

            # ── Layer 3: fill missing food pairs ──────────────────
            returned_drugs = {
                r.get("drug", "").lower()
                for r in all_drug_food
            }
            for drug, ev in food_evidence.items():
                if drug.lower() not in returned_drugs:
                    if ev.get("cache_hit") and ev.get("cached_data"):
                        cached = ev["cached_data"]
                        cached["from_cache"] = True
                        all_drug_food.append(cached)
                        print(f"   🔄 Filled missing food from cache: {drug}")
                    else:
                        all_drug_food.append({
                            "drug":                        drug,
                            "foods_to_avoid":              [],
                            "foods_to_separate":           [],
                            "foods_to_monitor":            [],
                            "mechanism":                   "Assessment unavailable.",
                            "no_significant_interactions": True,
                            "from_cache":                  False,
                            "evidence": {
                                "pubmed_papers":      0,
                                "evidence_tier":      4,
                                "evidence_tier_name": "UNAVAILABLE",
                                "evidence_summary":   "Agent truncation",
                            },
                        })
                        print(f"   ⚠️  Added food placeholder: {drug}")

        print(f"   ✅ SafetyAgent complete — "
              f"{len(all_drug_drug)}/{n_pairs} DDI pairs, "
              f"{len(all_drug_food)}/{n_food} food interactions synthesized")

        return {
            "drug_drug": all_drug_drug,
            "drug_food": all_drug_food,
        }

    # ── DDI Batch Synthesizer ─────────────────────────────────────────────────

    def _synthesize_ddi_batch(
        self,
        ddi_evidence: Dict,
        meds_str:     str,
        batch_num:    int = 1
    ) -> Dict:
        """
        Synthesize one batch of ≤5 drug-drug pairs.
        Concurrency enforced by client-level semaphore in _BaseAgent._run().
        """
        ddi_evidence_text = self._build_ddi_evidence_text(ddi_evidence)

        instructions = f"""
You are VabGenRxSafetyAgent, a board-certified clinical pharmacologist.
Synthesize drug-drug interactions from the evidence provided in the message.

MEDICATIONS: {meds_str}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL OUTPUT RULES — READ CAREFULLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. FIELD CONTENT RULES:
   mechanism:        pharmacological reason — no PMIDs
   clinical_effects: what happens to the patient — no PMIDs, never empty
   recommendation:   specific clinical action — never empty

2. EVIDENCE-ONLY SYNTHESIS:
   → Base severity and confidence strictly on evidence provided

3. SEVERITY:
   SEVERE   — contraindication, serious harm, or death
   MODERATE — requires dose adjustment or monitoring
   MINOR    — commonly prescribed together safely
   UNKNOWN  — absolutely no evidence of any kind

4. CONFIDENCE — STRICTLY ENFORCED:
   → 20+ papers OR 1000+ FDA reports  → 0.90–0.98
   → 5–20 papers OR 100–1000 reports  → 0.80–0.90
   → 1–5 papers OR 10–100 reports     → 0.70–0.85
   → FDA label content only           → 0.65–0.75
   → Zero evidence                    → null (severity=unknown)

5. MANDATORY COMPLETENESS — CRITICAL:
   → Return ALL {len(ddi_evidence)} pairs listed in evidence
   → Never omit a pair

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
        "pubmed_papers":            0,
        "pubmed_pmids":             [],
        "fda_reports":              0,
        "fda_serious":              0,
        "severity_ratio":           0.0,
        "fda_label_sections_count": 0,
        "evidence_tier":            1,
        "evidence_tier_name":       "...",
        "evidence_summary":         "one sentence about evidence quality"
      }}
    }}
  ]
}}
"""

        content = (
            f"MEDICATIONS: {meds_str}\n"
            f"\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"DRUG-DRUG EVIDENCE (batch {batch_num}, "
            f"{len(ddi_evidence)} pairs):\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"{ddi_evidence_text}\n"
            f"\n"
            f"Return ALL {len(ddi_evidence)} drug-drug pairs.\n"
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
        Synthesize drug-food interactions in a single agent call.
        Concurrency enforced by client-level semaphore in _BaseAgent._run().
        """
        food_evidence_text = self._build_food_evidence_text(food_evidence)

        instructions = f"""
You are VabGenRxSafetyAgent, a board-certified clinical pharmacologist.
Synthesize drug-food interactions from the evidence provided.

MEDICATIONS: {meds_str}

mechanism: pharmacological reason — no PMIDs

CACHED RESULTS: If cache_hit=true — use cached data, mark from_cache=true

MANDATORY COMPLETENESS:
→ Return ALL {len(food_evidence)} drugs listed in evidence

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
        "pubmed_papers":      0,
        "evidence_tier":      1,
        "evidence_tier_name": "...",
        "evidence_summary":   "one sentence about evidence quality"
      }}
    }}
  ]
}}
"""

        content = (
            f"MEDICATIONS: {meds_str}\n"
            f"\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"DRUG-FOOD EVIDENCE ({len(food_evidence)} drugs):\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"{food_evidence_text}\n"
            f"\n"
            f"Return ALL {len(food_evidence)} drugs.\n"
            f"Return JSON only."
        )

        return self._run(
            "VabGenRxSafetyAgent_food",
            instructions,
            content
        )

    # ── Evidence Text Builders ────────────────────────────────────────────────

    def _build_ddi_evidence_text(self, drug_drug_evidence: Dict) -> str:
        """
        Build DDI evidence text for the agent prompt.
        Injects full core FDA sections for both drugs (up to 500 chars each).
        Lists remaining sections as a character-count index.
        """
        if not drug_drug_evidence:
            return "No drug-drug pairs to analyze."

        parts = []
        for pair, ev in drug_drug_evidence.items():
            drug1, drug2 = pair

            if ev.get("cache_hit") and ev.get("cached_data"):
                cached    = ev["cached_data"]
                cached_ev = cached.get("evidence", {})
                parts.append(
                    f"PAIR: {drug1} + {drug2}\n"
                    f"  Status: CACHED — use this result directly\n"
                    f"  Severity:         {cached.get('severity', 'unknown')}\n"
                    f"  Confidence:       {cached.get('confidence', 0)}\n"
                    f"  Mechanism:        {cached.get('mechanism', '')}\n"
                    f"  Clinical effects: {cached.get('clinical_effects', '')}\n"
                    f"  Recommendation:   {cached.get('recommendation', '')}\n"
                    f"  Evidence pubmed_papers:            {cached_ev.get('pubmed_papers', 0)}\n"
                    f"  Evidence fda_reports:              {cached_ev.get('fda_reports', 0)}\n"
                    f"  Evidence fda_label_sections_count: {cached_ev.get('fda_label_sections_count', 0)}\n"
                    f"  Evidence evidence_tier:            {cached_ev.get('evidence_tier', 1)}\n"
                    f"  Evidence evidence_tier_name:       {cached_ev.get('evidence_tier_name', '')}\n"
                    f"  Evidence evidence_summary:         {cached_ev.get('evidence_summary', '')}\n"
                    f"  Mark from_cache=true. Copy ALL fields exactly."
                )
                continue

            fda_l1 = ev.get("fda_label_drug1", {})
            fda_l2 = ev.get("fda_label_drug2", {})

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

            def _remaining_index(drug_name, label, injected):
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
                return "\n".join(
                    f"    {drug_name} — {k} ({chars} chars)"
                    for k, chars in sorted(
                        rem.items(), key=lambda x: x[1], reverse=True
                    )
                ) + "\n"

            index_text = (
                _remaining_index(drug1, fda_l1, injected1) +
                _remaining_index(drug2, fda_l2, injected2)
            )

            abstracts_text = "".join(
                f"  Research finding {i}: {ab}\n"
                for i, ab in enumerate(ev.get("abstracts", []), 1)
            )

            has_any_evidence = (
                ev.get("pubmed_count", 0) > 0 or
                ev.get("fda_reports",  0) > 0 or
                bool(fda_l1) or bool(fda_l2)
            )

            fda_reports    = ev.get("fda_reports",  0)
            pubmed_count   = ev.get("pubmed_count", 0)
            fda_serious    = ev.get("fda_serious",  0)
            severity_ratio = ev.get("severity_ratio", 0)

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

            fda_signal = (
                f"  ⚠️  FDA ADVERSE EVENT SIGNAL: "
                f"{fda_reports:,} total reports, "
                f"{fda_serious:,} serious "
                f"({severity_ratio:.1%} serious ratio)\n"
                f"  This is REAL EVIDENCE — factor into severity and confidence.\n"
            ) if fda_reports > 0 else ""

            parts.append(
                f"PAIR: {drug1} + {drug2}\n"
                f"  {tier_note}\n"
                f"  PubMed papers: {pubmed_count}\n"
                f"  FDA adverse reports: {fda_reports}\n"
                f"  FDA serious reports: {fda_serious}\n"
                f"{fda_signal}"
                f"\n"
                f"  ── CORE FDA CONTENT ──\n"
                f"{core_text or '  No core FDA sections found.\n'}"
                f"\n"
                f"  ── ADDITIONAL SECTIONS (index) ──\n"
                f"{index_text or '  None.\n'}"
                f"\n"
                f"  Research abstracts:\n"
                f"{abstracts_text or '  None found.\n'}"
                f"  INSTRUCTION: "
                f"{'Synthesize clinical assessment. Do NOT return insufficient evidence or null confidence when fda_reports > 0.' if has_any_evidence else 'Return severity=unknown confidence=null — zero evidence'}\n"
            )

        return "\n\n".join(parts)

    def _build_food_evidence_text(self, drug_food_evidence: Dict) -> str:
        """Build drug-food evidence text for the agent prompt."""
        if not drug_food_evidence:
            return "No food interactions to analyze."

        parts = []
        for drug, ev in drug_food_evidence.items():
            if ev.get("cache_hit") and ev.get("cached_data"):
                cached = ev["cached_data"]
                parts.append(
                    f"DRUG: {drug}\n"
                    f"  Status: CACHED — use this result directly\n"
                    f"  Foods to avoid:    {cached.get('foods_to_avoid', [])}\n"
                    f"  Foods to separate: {cached.get('foods_to_separate', [])}\n"
                    f"  Foods to monitor:  {cached.get('foods_to_monitor', [])}\n"
                    f"  Mark from_cache=true."
                )
                continue

            abstracts_text = "".join(
                f"  Research finding {i}: {ab}\n"
                for i, ab in enumerate(ev.get("abstracts", []), 1)
            )
            parts.append(
                f"DRUG: {drug}\n"
                f"  PubMed papers found: {ev.get('pubmed_count', 0)}\n"
                f"  Research abstracts:\n{abstracts_text or '  None.\n'}"
            )

        return "\n\n".join(parts)