"""
FIX: _gather_drug_drug now fetches get_dosing_label() per unique
drug in addition to get_drug_contraindications().

CHANGES (this version):
- fda_label_sections_count added to miss_pairs evidence dict
  (counts clinical sections across both drug labels combined).
- patch_drug_drug_evidence() — new public method.
  Called by the orchestrator AFTER safety_agent.synthesize()
  returns. For every cached pair, copies pubmed_papers,
  fda_reports, and fda_label_sections_count from the raw
  cached_data directly into the agent result's evidence{} object.
  This is the reliable fix — never depends on the agent correctly
  transcribing evidence numbers from the prompt.
- fda_label_sections_count stored on cache-hit evidence entries
  so patch_drug_drug_evidence() has the values to copy.
"""

import threading
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

    # ── Public patch method ───────────────────────────────────────────────────

    def patch_drug_drug_evidence(
        self,
        agent_result:    Dict,
        raw_evidence:    Dict
    ) -> Dict:
        """
        After safety_agent.synthesize() returns, patch evidence
        counts on cached pairs directly from raw cached_data.

        Why this is needed:
          For cache hits, the agent is told to copy the cached
          result. But the evidence{} sub-object (pubmed_papers,
          fda_reports, fda_label_sections_count) is not reliably
          transcribed by the agent — it often writes zeros.
          This method bypasses the agent for evidence counts on
          cached pairs and stamps the correct values in directly.

        For non-cached pairs the agent populated evidence{} itself
        from the prompt — those are left untouched.
        """
        ddi_results = agent_result.get("drug_drug", [])
        if not ddi_results:
            return agent_result

        # Build lookup: (drug1, drug2) sorted → raw evidence entry
        # raw_evidence keys are tuples — normalise to sorted strings
        ev_lookup = {}
        for pair_key, ev in raw_evidence.items():
            if not ev.get("cache_hit"):
                continue
            d1, d2 = sorted([str(pair_key[0]).lower(),
                              str(pair_key[1]).lower()])
            ev_lookup[(d1, d2)] = ev

        for item in ddi_results:
            d1 = str(item.get("drug1", "")).lower()
            d2 = str(item.get("drug2", "")).lower()
            key = tuple(sorted([d1, d2]))

            raw_ev = ev_lookup.get(key)
            if not raw_ev:
                # Not a cache hit — agent populated evidence itself
                continue

            cached_data = raw_ev.get("cached_data", {})
            cached_ev   = cached_data.get("evidence", {})

            # Values in priority order:
            # 1. nested evidence{} in cached blob  (new format)
            # 2. top-level fields in cached blob   (old format)
            # 3. raw evidence dict fields           (safety_evidence)
            pubmed_papers = (
                cached_ev.get("pubmed_papers")
                or cached_data.get("pubmed_papers")
                or raw_ev.get("pubmed_count", 0)
            )
            fda_reports = (
                cached_ev.get("fda_reports")
                or cached_data.get("fda_reports")
                or raw_ev.get("fda_reports", 0)
            )
            fda_sections = (
                cached_ev.get("fda_label_sections_count")
                or cached_data.get("fda_label_sections_count")
                or raw_ev.get("fda_label_sections_count", 0)
            )

            # ── Patch evidence counts ──────────────────────────
            ev_out = item.get("evidence", {})
            if not isinstance(ev_out, dict):
                ev_out = {}

            ev_out["pubmed_papers"]            = pubmed_papers
            ev_out["fda_reports"]              = fda_reports
            ev_out["fda_label_sections_count"] = fda_sections
            item["evidence"]                   = ev_out

            # ── Patch clinical fields from cached_data ─────────
            # Agent recalculates confidence/severity even for
            # cached pairs despite temperature=0. Stamp all
            # clinical fields directly from cached_data so the
            # response always matches the original synthesis.
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
                f"   🔧 Patched cached DDI: "
                f"{item.get('drug1')}+{item.get('drug2')} — "
                f"confidence={item.get('confidence')} "
                f"severity={item.get('severity')} "
                f"pubmed={pubmed_papers} "
                f"fda_reports={fda_reports} "
                f"fda_sections={fda_sections}"
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
                # Pull fda_label_sections_count from cached blob
                # so patch_drug_drug_evidence() has it available.
                cached_ev        = cached.get("evidence", {})
                cached_sec_count = (
                    cached_ev.get("fda_label_sections_count")
                    or cached.get("fda_label_sections_count", 0)
                )
                evidence[pair] = {
                    "cache_hit":                True,
                    "cached_data":              cached,
                    "pubmed_count":             cached.get("pubmed_papers", 0),
                    "pubmed_pmids":             cached.get("pmids", []),
                    "abstracts":                cached.get("abstracts", []),
                    "fda_reports":              cached.get("fda_reports", 0),
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
                futures_map[
                    ex.submit(self.fda.search_adverse_events, d1, d2)
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
                "pubmed_count":             pubmed.get("count", 0),
                "pubmed_pmids":             pubmed.get("pmids", [])[:5],
                "abstracts":               [
                    a["text"][:400]
                    for a in pubmed.get("abstracts", [])[:2]
                ],
                "fda_reports":              fda_ev.get("total_reports", 0),
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
                    f"{fda_sections_count} FDA sections"
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