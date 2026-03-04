"""
VabGenRx — Disease Evidence Service
Gathers drug-disease contraindication evidence in parallel.

CHANGES:
- No hardcoded section tiers or lists anywhere
- FDA labels stored in full in memory (fda_label_full)
- Only a compact section INDEX sent to the agent
  { section_name: char_count } — agent declares what it needs
- Admin/non-clinical sections excluded from index automatically
- Section count printed once per drug, not once per pair
- PubMed semaphore caps concurrent requests at 7 (under 10/s limit)
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Tuple

from services.pubmed_service    import PubMedService
from services.fda_service       import FDAService
from services.cache_service     import AzureSQLCacheService
from services.pubmed_semaphore  import PUBMED_SEMAPHORE


# ── Constants ─────────────────────────────────────────────────────────────────

# Keys that are metadata, not clinical content
_SKIP = {
    "found", "drug", "brand_names",
    "generic_names", "manufacturer",
}

# Sections that are never clinically useful for drug-disease analysis
# Excluded from the index sent to the agent
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


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_section_index(label: dict) -> dict:
    """
    Build a compact index of available clinical sections.
    Returns { section_name: character_count }.

    Agent uses this index to decide which sections to request.
    Administrative sections and table variants excluded.
    No hardcoded list — built purely from what fda_service returned.
    """
    return {
        k: len(str(v))
        for k, v in label.items()
        if k not in _SKIP
        and k not in _ADMIN_SECTIONS
        and v
        and not k.endswith("_table")
    }


def _get_section_content(
    label: dict,
    sections: list,
    limit: int = 800
) -> dict:
    """
    Return full content of requested sections, truncated at limit.
    Used after agent declares which sections it needs.
    """
    return {
        s: str(label.get(s, ""))[:limit]
        for s in sections
        if label.get(s)
    }


# ── Service ───────────────────────────────────────────────────────────────────

class DiseaseEvidenceService:

    def __init__(self):
        self.pubmed = PubMedService()
        self.fda    = FDAService()
        self.cache  = AzureSQLCacheService()

    # ── Public ────────────────────────────────────────────────────

    def gather(
        self,
        medications: List[str],
        diseases:    List[str]
    ) -> Dict:
        if not medications or not diseases:
            return {}

        pairs = [
            (drug, disease)
            for drug    in medications
            for disease in diseases
        ]

        print(f"\n   📦 DiseaseEvidenceService: "
              f"{len(pairs)} drug-disease pairs")

        return self._gather_drug_disease(pairs)

    # ── Core ──────────────────────────────────────────────────────

    def _gather_drug_disease(
        self, pairs: List[Tuple[str, str]]
    ) -> Dict:

        # ── Step 1: Parallel cache checks ─────────────────────────
        print(f"      Checking {len(pairs)} drug-disease caches "
              f"in parallel...")
        cache_results = {}

        with ThreadPoolExecutor(
            max_workers=min(len(pairs), 10)
        ) as ex:
            futures = {
                ex.submit(
                    self.cache.get_drug_disease, p[0], p[1]
                ): p
                for p in pairs
            }
            for future in as_completed(futures):
                pair                = futures[future]
                cache_results[pair] = future.result()

        hits   = sum(1 for v in cache_results.values() if v is not None)
        misses = len(pairs) - hits
        print(f"      Cache: {hits} hits, {misses} misses")

        evidence = {}

        # Cache hits — no need to rebuild FDA content
        for pair, cached in cache_results.items():
            if cached is not None:
                sections_found = cached.get(
                    "fda_label_sections_found", []
                )
                evidence[pair] = {
                    "cache_hit":                True,
                    "cached_data":              cached,
                    "pubmed_count":             cached.get("pubmed_count", 0),
                    "pubmed_pmids":             cached.get("pmids", []),
                    "abstracts":                cached.get("abstracts", []),
                    "fda_label":                {},
                    "fda_label_full":           {},
                    "fda_section_index":        {},
                    "fda_label_sections_found": sections_found,
                    "fda_label_sections_count": len(sections_found),
                }

        miss_pairs   = [
            p for p, r in cache_results.items() if r is None
        ]
        unique_drugs = list({p[0] for p in miss_pairs})

        if not miss_pairs:
            return evidence

        print(f"      Fetching evidence for "
              f"{len(miss_pairs)} pairs, "
              f"{len(unique_drugs)} unique drugs in parallel...")

        # ── Step 2: FDA labels — one fetch per unique drug ─────────
        # Not one per pair — fda_service in-memory cache handles
        # deduplication but we avoid redundant calls entirely here
        contra_labels = {}
        dosing_labels = {}

        with ThreadPoolExecutor(
            max_workers=min(len(unique_drugs) * 2, 10)
        ) as ex:
            cf = {
                ex.submit(
                    self.fda.get_drug_contraindications, d
                ): d
                for d in unique_drugs
            }
            df = {
                ex.submit(
                    self.fda.get_dosing_label, d
                ): d
                for d in unique_drugs
            }
            all_futures = {**cf, **df}

            for future in as_completed(all_futures):
                try:
                    result = future.result()
                    if future in cf:
                        contra_labels[cf[future]] = result
                    else:
                        dosing_labels[df[future]] = result
                except Exception as e:
                    drug = all_futures[future]
                    print(f"      ⚠️  FDA label error {drug}: {e}")
                    if future in cf:
                        contra_labels[drug] = {"found": False}
                    else:
                        dosing_labels[drug] = {"found": False}

        # ── Step 3: Merge labels + build section index per drug ────
        # Printed ONCE per drug, not once per pair
        merged_labels   = {}
        section_indexes = {}

        for drug in unique_drugs:
            cl = contra_labels.get(drug, {})
            dl = dosing_labels.get(drug, {})

            # Merge — dosing label takes priority (richer content)
            merged = {
                "found": (
                    cl.get("found", False) or
                    dl.get("found", False)
                )
            }
            for k, v in dl.items():
                if k not in _SKIP and v:
                    merged[k] = v
            # Fill gaps from contraindication label
            for k, v in cl.items():
                if k not in _SKIP and v and not merged.get(k):
                    merged[k] = v

            merged_labels[drug]   = merged
            section_indexes[drug] = _build_section_index(merged)

            # Print once per drug
            print(
                f"      📋 {drug}: "
                f"{len(section_indexes[drug])} clinical sections "
                f"in index — "
                f"{', '.join(section_indexes[drug].keys())}"
            )

        # ── Step 4: PubMed — rate-limited semaphore ────────────────
        pubmed_results = {}

        def _pubmed_search(pair):
            with PUBMED_SEMAPHORE:
                return self.pubmed.search_disease_contraindication(
                    pair[0], pair[1]
                )

        with ThreadPoolExecutor(
            max_workers=min(len(miss_pairs), 7)
        ) as ex:
            futures = {
                ex.submit(_pubmed_search, p): p
                for p in miss_pairs
            }
            for future in as_completed(futures):
                pair = futures[future]
                try:
                    pubmed_results[pair] = future.result()
                except Exception as e:
                    print(f"      ⚠️  PubMed error {pair}: {e}")
                    pubmed_results[pair] = {
                        "count": 0, "pmids": [], "abstracts": []
                    }

        # ── Step 5: Build evidence dict per pair ───────────────────
        for pair in miss_pairs:
            drug, disease = pair
            pubmed        = pubmed_results.get(pair, {})
            full_label    = merged_labels.get(drug, {})
            sec_index     = section_indexes.get(drug, {})

            evidence[pair] = {
                "cache_hit":    False,
                "cached_data":  None,
                "pubmed_count": pubmed.get("count", 0),
                "pubmed_pmids": pubmed.get("pmids", [])[:5],
                "abstracts":    [
                    a["text"][:400]
                    for a in pubmed.get("abstracts", [])[:2]
                ],
                # Full label stored in memory — agent requests
                # specific sections it needs via section index
                "fda_label_full":            full_label,
                # Only index sent to agent in evidence text
                "fda_section_index":         sec_index,
                # fda_label populated per-section on agent request
                "fda_label":                 {},
                "fda_label_sections_found":  list(sec_index.keys()),
                "fda_label_sections_count":  len(sec_index),
            }

        return evidence

    # ── Public helper — inject section content after agent request ─
    def inject_requested_sections(
        self,
        evidence:           Dict,
        drug:               str,
        disease:            str,
        requested_sections: List[str],
        limit:              int = 800
    ) -> Dict:
        """
        After the agent declares which sections it needs,
        inject their full content into the evidence dict.

        Called by disease_agent if it wants to do a targeted
        second-pass for high-severity findings.
        """
        pair = (drug, disease)
        if pair not in evidence:
            return evidence

        full_label = evidence[pair].get("fda_label_full", {})
        content    = _get_section_content(
            full_label, requested_sections, limit
        )
        evidence[pair]["fda_label"] = content
        return evidence