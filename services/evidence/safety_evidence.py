"""
VabGenRx — Safety Evidence Service
Gathers drug-drug and drug-food evidence in parallel.

CHANGES:
- PubMed semaphore caps concurrent requests at 7
  (safely under 10/s NCBI rate limit)
- fda_label_drug1 / fda_label_drug2 copy ALL sections
  fda_service returned — no hardcoded key list
- Section index approach used for DDI labels too
  (agent sees index, requests what it needs)
"""

import itertools
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Tuple

from services.pubmed_service   import PubMedService
from services.fda_service      import FDAService
from services.cache_service    import AzureSQLCacheService
from services.pubmed_semaphore import PUBMED_SEMAPHORE


# ── Constants ─────────────────────────────────────────────────────────────────

_SKIP = {
    "found", "drug", "brand_names",
    "generic_names", "manufacturer",
}

_ADMIN_SECTIONS = {
    "package_label_principal_display_panel",
    "spl_product_data_elements",
    "spl_medguide",
    "recent_major_changes",
    "how_supplied",
    "dosage_forms_and_strengths",
    "description",
    "references",
    "set_id",
    "id",
    "version",
    "effective_time",
}


# ── Helper ────────────────────────────────────────────────────────────────────

def _extract_clinical_sections(label: dict) -> dict:
    """
    Extract all non-admin, non-metadata sections from a label.
    Used for DDI labels where the full content is passed through
    to the safety agent (DDI labels are per drug pair, not per
    drug-disease pair, so context load is lower).
    """
    return {
        k: v
        for k, v in label.items()
        if k not in _SKIP
        and k not in _ADMIN_SECTIONS
        and v
        and not k.endswith("_table")
    }


# ── Service ───────────────────────────────────────────────────────────────────

class SafetyEvidenceService:

    def __init__(self):
        self.pubmed = PubMedService()
        self.fda    = FDAService()
        self.cache  = AzureSQLCacheService()

    # ── Public ────────────────────────────────────────────────────

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

    # ── Drug-Drug ─────────────────────────────────────────────────

    def _gather_drug_drug(
        self, pairs: List[Tuple[str, str]]
    ) -> Dict:
        if not pairs:
            return {}

        # ── Cache checks ───────────────────────────────────────────
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

        # Cache hits
        for pair, cached in cache_results.items():
            if cached is not None:
                evidence[pair] = {
                    "cache_hit":       True,
                    "cached_data":     cached,
                    "pubmed_count":    cached.get("pubmed_papers", 0),
                    "pubmed_pmids":    cached.get("pmids", []),
                    "abstracts":       cached.get("abstracts", []),
                    "fda_reports":     cached.get("fda_reports", 0),
                    "fda_serious":     cached.get(
                        "fda_serious_reports", 0
                    ),
                    "severity_ratio":  cached.get("severity_ratio", 0),
                    "fda_label_drug1": {},
                    "fda_label_drug2": {},
                }

        miss_pairs = [
            p for p, r in cache_results.items() if r is None
        ]

        if not miss_pairs:
            return evidence

        print(f"      Fetching evidence for "
              f"{len(miss_pairs)} pairs in parallel...")

        # Rate-limited PubMed wrapper
        def _pubmed_search(d1, d2):
            with PUBMED_SEMAPHORE:
                return self.pubmed.search_drug_interaction(d1, d2)

        with ThreadPoolExecutor(
            max_workers=min(len(miss_pairs) * 3, 15)
        ) as ex:
            futures_map = {}
            for pair in miss_pairs:
                d1, d2 = pair
                futures_map[
                    ex.submit(_pubmed_search, d1, d2)
                ] = ("pubmed", pair)
                futures_map[
                    ex.submit(self.fda.search_adverse_events, d1, d2)
                ] = ("fda_events", pair)
                futures_map[
                    ex.submit(self.fda.get_drug_contraindications, d1)
                ] = ("fda_label_1", pair)
                futures_map[
                    ex.submit(self.fda.get_drug_contraindications, d2)
                ] = ("fda_label_2", pair)

            raw = {p: {} for p in miss_pairs}
            for future in as_completed(futures_map):
                kind, pair = futures_map[future]
                try:
                    raw[pair][kind] = future.result()
                except Exception as e:
                    print(f"      ⚠️  Evidence fetch error "
                          f"{kind} {pair}: {e}")
                    raw[pair][kind] = {}

        # Build evidence dict — clinical sections only, no admin
        for pair in miss_pairs:
            r      = raw[pair]
            pubmed = r.get("pubmed",      {})
            fda_ev = r.get("fda_events",  {})
            fda_l1 = r.get("fda_label_1", {})
            fda_l2 = r.get("fda_label_2", {})

            evidence[pair] = {
                "cache_hit":       False,
                "cached_data":     None,
                "pubmed_count":    pubmed.get("count", 0),
                "pubmed_pmids":    pubmed.get("pmids", [])[:5],
                "abstracts":       [
                    a["text"][:400]
                    for a in pubmed.get("abstracts", [])[:2]
                ],
                "fda_reports":     fda_ev.get("total_reports", 0),
                "fda_serious":     fda_ev.get("serious_reports", 0),
                "severity_ratio":  fda_ev.get("severity_ratio", 0),
                # Clinical sections only — admin stripped
                "fda_label_drug1": _extract_clinical_sections(fda_l1),
                "fda_label_drug2": _extract_clinical_sections(fda_l2),
            }

        return evidence

    # ── Drug-Food ─────────────────────────────────────────────────

    def _gather_drug_food(self, medications: List[str]) -> Dict:
        if not medications:
            return {}

        print(f"      Checking {len(medications)} food caches "
              f"in parallel...")

        # ── Cache checks ───────────────────────────────────────────
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

        miss_drugs = [
            d for d, r in cache_results.items() if r is None
        ]

        if not miss_drugs:
            return evidence

        print(f"      Fetching food evidence for "
              f"{len(miss_drugs)} drugs in parallel...")

        # Rate-limited PubMed wrapper
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