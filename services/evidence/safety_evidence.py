"""
VabGenRx Safety Evidence Service

Collects and aggregates clinical evidence used by the
SafetyAgent to evaluate drug-drug and drug-food interaction risks.

Purpose
-------
This service gathers supporting scientific and regulatory
evidence from multiple authoritative sources to enable
evidence-based interaction analysis.

Evidence Sources
----------------
1. PubMed
   • Peer-reviewed scientific literature
   • Interaction mechanism studies
   • Clinical case reports

2. FDA FAERS (Adverse Event Reporting System)
   • Real-world pharmacovigilance reports
   • Serious adverse event counts
   • Severity ratios for interaction signals

3. FDA Drug Labels
   • Clinical pharmacology
   • Contraindications
   • Warnings and precautions
   • Dosage and administration guidance

Capabilities
------------
• Parallel evidence retrieval using thread pools
• Smart handling of combination drug names
• Cache-aware retrieval to reduce external API calls
• Evidence normalization across sources
• Automated extraction of clinically relevant FDA sections

Evidence Output
---------------
For each drug pair the service provides:

{
    pubmed_count
    pubmed_pmids
    abstracts
    fda_reports
    fda_serious
    severity_ratio
    fda_label_sections_count
}

Architecture Role
-----------------
This service supplies structured evidence to the
SafetyAgent synthesis process.

Pipeline:

Patient Medications
        ↓
SafetyEvidenceService
        ↓
SafetyAgent synthesis
        ↓
Drug interaction risk assessment

Caching Strategy
----------------
Interaction evidence is cached using Azure SQL to:

• Reduce PubMed API usage
• Reduce FDA API latency
• Improve system response time
• Maintain deterministic results for repeated queries

The patch_drug_drug_evidence() method ensures evidence
counts remain accurate even when agent outputs omit or
misreport evidence metrics.
"""

import re
import itertools
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Tuple

from services.pubmed_service   import PubMedService
from services.fda_service      import FDAService
from services.cache_service    import AzureSQLCacheService
from services.pubmed_semaphore import PUBMED_SEMAPHORE
from services.fda_semaphore    import FDA_SEMAPHORE

_SKIP = {
    "found", "drug", "brand_names",
    "generic_names", "manufacturer",
}

_ADMIN_SECTIONS = {
    "package_label_principal_display_panel",
    "spl_product_data_elements", "spl_medguide",
    "recent_major_changes", "how_supplied",
    "dosage_forms_and_strengths", "description",
    "references", "set_id", "id", "version", "effective_time",
}


def _extract_clinical_sections(label: dict) -> dict:
    return {
        k: v for k, v in label.items()
        if k not in _SKIP
        and k not in _ADMIN_SECTIONS
        and v
        and not k.endswith("_table")
    }


def _split_combination_drug(drug_name: str) -> list:
    """
    Split a combination drug name into individual components.

    The FDA adverse events API (FAERS) stores individual drug names,
    not combination product names. Searching for
    "rosiglitazone maleate/Metformin" returns ~1 report because no
    product is filed under that exact combined string in FAERS.

    Examples:
        "rosiglitazone maleate/Metformin"  → ["rosiglitazone maleate", "Metformin"]
        "rosiglitazone maleate\\Metformin" → ["rosiglitazone maleate", "Metformin"]
        "Levothyroxine"                    → ["Levothyroxine"]  (unchanged)
    """
    parts = re.split(r'\s*[/\\|+]\s*', drug_name.strip())
    return [p.strip() for p in parts if p.strip()]


class SafetyEvidenceService:

    def __init__(self):
        self.pubmed = PubMedService()
        self.fda    = FDAService()
        self.cache  = AzureSQLCacheService()

    def gather(self, medications: List[str]) -> Dict:
        pairs = list(itertools.combinations(medications, 2))
        print(f"\n   📦 SafetyEvidenceService: "
              f"{len(pairs)} drug-drug pairs, "
              f"{len(medications)} food checks")

        drug_drug_evidence = self._gather_drug_drug(pairs)
        drug_food_evidence = self._gather_drug_food(medications)

        return {
            "drug_drug": drug_drug_evidence,
            "drug_food": drug_food_evidence,
        }

    # ── Smart adverse events search ───────────────────────────────────────────

    def _search_adverse_events_smart(
        self, drug1: str, drug2: str
    ) -> Dict:
        """
        Search FDA adverse events handling combination drug names.

        The FAERS database stores individual drug names, not
        combination product names. Searching for
        "rosiglitazone maleate/Metformin" returns ~1 report because
        no product is filed under that exact combined name.

        Strategy:
        1. Split each drug into components if it's a combination.
        2. Search all component pairs and take the MAX total_reports
           result — this finds the most clinically relevant signal.

        Example:
            drug1 = "Levothyroxine"
            drug2 = "rosiglitazone maleate/Metformin"
            → searches:
                Levothyroxine × rosiglitazone maleate → N reports
                Levothyroxine × Metformin             → N reports
            → returns whichever has highest total_reports
        """
        components1 = _split_combination_drug(drug1)
        components2 = _split_combination_drug(drug2)

        # Both single drugs — standard search, no overhead
        if len(components1) == 1 and len(components2) == 1:
            return self.fda.search_adverse_events(drug1, drug2)

        # Combination drug — search all component pairs
        best_result = {"found": False, "total_reports": 0}

        for c1 in components1:
            for c2 in components2:
                result = self.fda.search_adverse_events(c1, c2)
                print(
                    f"      📊 FAERS: {c1} × {c2} → "
                    f"{result.get('total_reports', 0):,} reports"
                )
                if result.get("total_reports", 0) > best_result.get("total_reports", 0):
                    best_result = result

        print(
            f"      ✅ FAERS best: {drug1} × {drug2} → "
            f"{best_result.get('total_reports', 0):,} total, "
            f"{best_result.get('serious_reports', 0):,} serious "
            f"({best_result.get('severity_ratio', 0):.1%})"
        )
        return best_result

    # ── Public patch method ───────────────────────────────────────────────────

    def patch_drug_drug_evidence(
        self,
        agent_result: Dict,
        raw_evidence: Dict
    ) -> Dict:
        """
        Stamp correct evidence counts onto ALL drug-drug pairs —
        both cached and fresh.

        Why ALL pairs (not just cached):
          For fresh pairs the agent reads fda_reports from the prompt
          and writes it into evidence{}. But the agent can write the
          seriousness term flag (1 or 2) instead of the actual total
          count. Stamping from raw_evidence for ALL pairs is the
          safest approach — raw_evidence["fda_reports"] always holds
          the correct total_reports from _search_adverse_events_smart.

          For cached pairs the cached blob may have been written with
          fda_reports=1 (the seriousness term flag). The fix detects
          this by treating values of 0, 1, or 2 as flags and falling
          back to raw_fda_total instead.
        """
        ddi_results = agent_result.get("drug_drug", [])
        if not ddi_results:
            return agent_result

        # Build lookup for ALL pairs (cached and fresh)
        ev_lookup = {}
        for pair_key, ev in raw_evidence.items():
            d1, d2 = sorted([
                str(pair_key[0]).lower(),
                str(pair_key[1]).lower()
            ])
            ev_lookup[(d1, d2)] = ev

        for item in ddi_results:
            d1  = str(item.get("drug1", "")).lower()
            d2  = str(item.get("drug2", "")).lower()
            key = tuple(sorted([d1, d2]))

            raw_ev = ev_lookup.get(key)
            if not raw_ev:
                continue

            is_cached   = raw_ev.get("cache_hit", False)
            cached_data = raw_ev.get("cached_data", {}) if is_cached else {}
            cached_ev   = cached_data.get("evidence", {})

            # ── fda_reports: always use total from raw FDA call ───────
            # raw_ev["fda_reports"] = fda_ev.get("total_reports") from
            # _search_adverse_events_smart — always the correct total.
            # For cached pairs check cached_data but treat 0/1/2 as
            # seriousness flags and ignore them.
            raw_fda_total = raw_ev.get("fda_reports", 0)

            cached_fda = (
                cached_ev.get("fda_reports")
                or cached_data.get("fda_reports")
                or 0
            )
            if cached_fda in (0, 1, 2):
                cached_fda = 0

            fda_reports = raw_fda_total or cached_fda

            # Other evidence fields
            pubmed_papers = (
                cached_ev.get("pubmed_papers")
                or cached_data.get("pubmed_papers")
                or raw_ev.get("pubmed_count", 0)
            )
            fda_sections = (
                cached_ev.get("fda_label_sections_count")
                or cached_data.get("fda_label_sections_count")
                or raw_ev.get("fda_label_sections_count", 0)
            )
            fda_serious    = raw_ev.get("fda_serious",    0)
            severity_ratio = raw_ev.get("severity_ratio", 0.0)

            # Stamp ALL evidence counts directly
            ev_out = item.get("evidence", {})
            if not isinstance(ev_out, dict):
                ev_out = {}

            ev_out["fda_reports"]              = fda_reports
            ev_out["fda_serious"]              = fda_serious
            ev_out["severity_ratio"]           = severity_ratio
            ev_out["pubmed_papers"]            = pubmed_papers
            ev_out["fda_label_sections_count"] = fda_sections
            item["evidence"]                   = ev_out

            # For cached pairs: also stamp clinical fields
            if is_cached and cached_data:
                if cached_data.get("confidence") is not None:
                    item["confidence"] = cached_data["confidence"]
                if cached_data.get("severity"):
                    item["severity"] = cached_data["severity"]
                if cached_data.get("mechanism"):
                    item["mechanism"] = cached_data["mechanism"]
                if cached_data.get("clinical_effects"):
                    item["clinical_effects"] = (
                        cached_data["clinical_effects"]
                    )
                if cached_data.get("recommendation"):
                    item["recommendation"] = (
                        cached_data["recommendation"]
                    )

            print(
                f"   🔧 {'Cached' if is_cached else 'Fresh'} DDI patched: "
                f"{item.get('drug1')}+{item.get('drug2')} — "
                f"fda_reports={fda_reports:,} "
                f"(serious={fda_serious:,}, ratio={severity_ratio:.1%}) "
                f"pubmed={pubmed_papers} fda_sections={fda_sections}"
            )

        return agent_result

    # ── Core gather methods ───────────────────────────────────────────────────

    def _gather_drug_drug(
        self, pairs: List[Tuple[str, str]]
    ) -> Dict:
        if not pairs:
            return {}

        print(f"      Checking {len(pairs)} drug-drug caches "
              f"in parallel...")
        cache_results = {}

        with ThreadPoolExecutor(
            max_workers=min(len(pairs), 10)
        ) as ex:
            futures = {
                ex.submit(self.cache.get_drug_drug, p[0], p[1]): p
                for p in pairs
            }
            for future in as_completed(futures):
                pair                = futures[future]
                cache_results[pair] = future.result()

        hits   = sum(1 for v in cache_results.values() if v is not None)
        misses = len(pairs) - hits
        print(f"      Cache: {hits} hits, {misses} misses")

        evidence = {}

        for pair, cached in cache_results.items():
            if cached is not None:
                cached_ev        = cached.get("evidence", {})
                cached_sec_count = (
                    cached_ev.get("fda_label_sections_count")
                    or cached.get("fda_label_sections_count", 0)
                )
                cached_fda = (
                    cached_ev.get("fda_reports")
                    or cached.get("fda_reports", 0)
                )
                evidence[pair] = {
                    "cache_hit":                True,
                    "cached_data":              cached,
                    "pubmed_count":             cached.get("pubmed_papers", 0),
                    "pubmed_pmids":             cached.get("pmids", []),
                    "abstracts":                cached.get("abstracts", []),
                    "fda_reports":              cached_fda,
                    "fda_serious":              cached.get("fda_serious_reports", 0),
                    "severity_ratio":           cached.get("severity_ratio", 0),
                    "fda_label_sections_count": cached_sec_count,
                    "fda_label_drug1":          {},
                    "fda_label_drug2":          {},
                }

        miss_pairs   = [p for p, r in cache_results.items() if r is None]
        unique_drugs = list({d for p in miss_pairs for d in p})

        if not miss_pairs:
            return evidence

        print(f"      Fetching evidence for "
              f"{len(miss_pairs)} pairs in parallel...")

        dosing_labels = {}
        contra_labels = {}

        def _get_dosing(d):
            with FDA_SEMAPHORE:
                return self.fda.get_dosing_label(d)

        def _get_contra(d):
            with FDA_SEMAPHORE:
                return self.fda.get_drug_contraindications(d)

        with ThreadPoolExecutor(
            max_workers=min(len(unique_drugs) * 2, 10)
        ) as ex:
            dl_futures = {
                ex.submit(_get_dosing, d): d
                for d in unique_drugs
            }
            cl_futures = {
                ex.submit(_get_contra, d): d
                for d in unique_drugs
            }
            all_f = {**dl_futures, **cl_futures}
            for future in as_completed(all_f):
                try:
                    result = future.result()
                    if future in dl_futures:
                        dosing_labels[dl_futures[future]] = result
                    else:
                        contra_labels[cl_futures[future]] = result
                except Exception as e:
                    drug = all_f[future]
                    print(f"      ⚠️  FDA label error {drug}: {e}")
                    if future in dl_futures:
                        dosing_labels[drug] = {"found": False}
                    else:
                        contra_labels[drug] = {"found": False}

        def _pubmed_search(d1, d2):
            with PUBMED_SEMAPHORE:
                return self.pubmed.search_drug_interaction(d1, d2)

        def _merge_labels(drug: str) -> dict:
            dl = dosing_labels.get(drug, {})
            cl = contra_labels.get(drug, {})
            merged = {"found": (
                dl.get("found", False) or cl.get("found", False)
            )}
            for k, v in dl.items():
                if k not in _SKIP and v:
                    merged[k] = v
            for k, v in cl.items():
                if k not in _SKIP and v and not merged.get(k):
                    merged[k] = v
            return merged

        with ThreadPoolExecutor(
            max_workers=min(len(miss_pairs) * 2, 15)
        ) as ex:
            futures_map = {}
            for pair in miss_pairs:
                d1, d2 = pair
                futures_map[
                    ex.submit(_pubmed_search, d1, d2)
                ] = ("pubmed", pair)
                # ── Use smart search — handles combination drug names ──
                futures_map[
                    ex.submit(self._search_adverse_events_smart, d1, d2)
                ] = ("fda_events", pair)

            raw = {p: {} for p in miss_pairs}
            for future in as_completed(futures_map):
                kind, pair = futures_map[future]
                try:
                    raw[pair][kind] = future.result()
                except Exception as e:
                    print(f"      ⚠️  Evidence fetch error "
                          f"{kind} {pair}: {e}")
                    raw[pair][kind] = {}

        for pair in miss_pairs:
            d1, d2 = pair
            r      = raw[pair]
            pubmed = r.get("pubmed",     {})
            fda_ev = r.get("fda_events", {})

            merged_d1   = _merge_labels(d1)
            merged_d2   = _merge_labels(d2)
            clinical_d1 = _extract_clinical_sections(merged_d1)
            clinical_d2 = _extract_clinical_sections(merged_d2)

            fda_sections_count = len(clinical_d1) + len(clinical_d2)

            evidence[pair] = {
                "cache_hit":                False,
                "cached_data":              None,
                "pubmed_count":             pubmed.get("count",          0),
                "pubmed_pmids":             pubmed.get("pmids",          [])[:5],
                "abstracts":               [
                    a["text"][:400]
                    for a in pubmed.get("abstracts", [])[:2]
                ],
                # Always total_reports — never serious_reports
                "fda_reports":              fda_ev.get("total_reports",  0),
                "fda_serious":              fda_ev.get("serious_reports", 0),
                "severity_ratio":           fda_ev.get("severity_ratio", 0),
                "fda_label_sections_count": fda_sections_count,
                "fda_label_drug1":          clinical_d1,
                "fda_label_drug2":          clinical_d2,
            }

            if fda_sections_count:
                print(
                    f"      📋 {d1}+{d2}: "
                    f"{len(clinical_d1)} + {len(clinical_d2)} = "
                    f"{fda_sections_count} FDA sections, "
                    f"fda_reports={fda_ev.get('total_reports', 0):,}"
                )

        return evidence

    def _gather_drug_food(self, medications: List[str]) -> Dict:
        if not medications:
            return {}

        print(f"      Checking {len(medications)} food caches "
              f"in parallel...")

        cache_results = {}
        with ThreadPoolExecutor(
            max_workers=min(len(medications), 10)
        ) as ex:
            futures = {
                ex.submit(self.cache.get_food, drug): drug
                for drug in medications
            }
            for future in as_completed(futures):
                drug                = futures[future]
                cache_results[drug] = future.result()

        hits   = sum(1 for v in cache_results.values() if v is not None)
        misses = len(medications) - hits
        print(f"      Food cache: {hits} hits, {misses} misses")

        evidence = {}
        for drug, cached in cache_results.items():
            if cached is not None:
                evidence[drug] = {
                    "cache_hit":    True,
                    "cached_data":  cached,
                    "pubmed_count": cached.get("pubmed_count", 0),
                    "abstracts":    cached.get("abstracts", []),
                }

        miss_drugs = [d for d, r in cache_results.items() if r is None]

        if not miss_drugs:
            return evidence

        print(f"      Fetching food evidence for "
              f"{len(miss_drugs)} drugs in parallel...")

        def _food_search(drug):
            with PUBMED_SEMAPHORE:
                return self.pubmed.search_all_food_interactions_for_drug(
                    drug, 5
                )

        with ThreadPoolExecutor(
            max_workers=min(len(miss_drugs), 7)
        ) as ex:
            futures = {
                ex.submit(_food_search, drug): drug
                for drug in miss_drugs
            }
            for future in as_completed(futures):
                drug = futures[future]
                try:
                    result = future.result()
                    evidence[drug] = {
                        "cache_hit":    False,
                        "cached_data":  None,
                        "pubmed_count": result.get("count", 0),
                        "pubmed_pmids": result.get("pmids", [])[:5],
                        "abstracts":    [
                            a["text"][:400]
                            for a in result.get("abstracts", [])[:2]
                        ],
                    }
                except Exception as e:
                    print(f"      ⚠️  Food evidence error {drug}: {e}")
                    evidence[drug] = {
                        "cache_hit":    False,
                        "cached_data":  None,
                        "pubmed_count": 0,
                        "pubmed_pmids": [],
                        "abstracts":    [],
                    }

        return evidence