"""
VabGenRx Disease Evidence Service

Collects and aggregates clinical evidence for evaluating
drug–disease contraindications within the VabGenRx
multi-agent clinical safety system.

Purpose
-------
This service gathers supporting scientific and regulatory
evidence to allow the DiseaseAgent to determine whether
a prescribed medication is contraindicated or risky
for a patient’s existing medical conditions.

Evidence Sources
----------------
1. PubMed
   • Peer-reviewed medical literature
   • Clinical studies linking drugs to disease complications
   • Case reports of adverse outcomes

2. FDA Drug Labels
   • Contraindications
   • Warnings and precautions
   • Clinical pharmacology
   • Use in specific populations

Capabilities
------------
• Parallel evidence retrieval using thread pools
• Cache-aware evidence retrieval to reduce external API usage
• Automatic extraction of clinically relevant FDA label sections
• Structured evidence generation for agent synthesis
• Patch mechanism to correct evidence counts in cached results

Drug–Disease Evidence Structure
-------------------------------
For each drug–disease pair the service provides:

{
    pubmed_count
    pubmed_pmids
    abstracts
    fda_label_sections_found
    fda_label_sections_count
    fda_label
}

Architecture Role
-----------------
This module supplies evidence to the DiseaseAgent within
the VabGenRx clinical reasoning pipeline.

Pipeline Flow

Patient Conditions + Medications
        ↓
DiseaseEvidenceService
        ↓
DiseaseAgent synthesis
        ↓
Drug-disease risk analysis

Caching Strategy
----------------
Drug–disease evidence is cached using Azure SQL to:

• Reduce PubMed API calls
• Reduce FDA label retrieval latency
• Ensure deterministic results for repeated analyses

The patch_drug_disease_evidence() method corrects evidence
counts for cached pairs when the agent output fails to
reproduce evidence metadata accurately.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Tuple

from services.pubmed_service    import PubMedService
from services.fda_service       import FDAService
from services.cache_service     import AzureSQLCacheService
from services.pubmed_semaphore  import PUBMED_SEMAPHORE
from services.fda_semaphore     import FDA_SEMAPHORE


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


def _build_section_index(label: dict) -> dict:
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
    return {
        s: str(label.get(s, ""))[:limit]
        for s in sections
        if label.get(s)
    }


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

    # ── Patch method ──────────────────────────────────────────────

    def patch_drug_disease_evidence(
        self,
        agent_result: Dict,
        raw_evidence: Dict
    ) -> Dict:
        """
        After DiseaseAgent.synthesize() returns, patch evidence
        counts on cached pairs directly from raw cached_data.

        The agent copies clinical text correctly for cached pairs
        but writes zeros for fda_label_sections_count and
        pubmed_papers. This method bypasses the agent for those
        fields and stamps the correct values in directly.

        Mirrors SafetyEvidenceService.patch_drug_drug_evidence().
        """
        dd_results = agent_result.get("drug_disease", [])
        if not dd_results:
            return agent_result

        # Build lookup: (drug, disease) lower → raw evidence entry
        ev_lookup = {}
        for pair_key, ev in raw_evidence.items():
            if not ev.get("cache_hit"):
                continue
            d   = str(pair_key[0]).lower()
            dis = str(pair_key[1]).lower()
            ev_lookup[(d, dis)] = ev

        print(f"   🔍 Disease patch — ev_lookup keys: "
              f"{list(ev_lookup.keys())}")
        print(f"   🔍 Disease patch — agent items: "
              f"{[(i.get('drug',''), i.get('disease','')) for i in dd_results]}")

        for item in dd_results:
            d   = str(item.get("drug",    "")).lower()
            dis = str(item.get("disease", "")).lower()
            key = (d, dis)

            raw_ev = ev_lookup.get(key)
            if not raw_ev:
                print(f"   🔍 No cache hit match for: {key}")
                continue

            cached_data = raw_ev.get("cached_data", {})
            cached_ev   = cached_data.get("evidence", {})

            # Priority order:
            # 1. nested evidence{} in cached blob  (new format)
            # 2. top-level fields in cached blob   (old format)
            # 3. raw evidence dict                 (fallback)
            pubmed_papers = (
                cached_ev.get("pubmed_papers")
                or cached_data.get("pubmed_papers")
                or cached_data.get("pubmed_count")
                or raw_ev.get("pubmed_count", 0)
            )
            fda_sections = (
                cached_ev.get("fda_label_sections_count")
                or cached_data.get("fda_label_sections_count")
                or raw_ev.get("fda_label_sections_count", 0)
            )
            sections_found = (
                cached_ev.get("fda_label_sections_found")
                or cached_data.get("fda_label_sections_found")
                or raw_ev.get("fda_label_sections_found", [])
            )

            # ── Patch evidence counts ──────────────────────────
            ev_out = item.get("evidence", {})
            if not isinstance(ev_out, dict):
                ev_out = {}

            ev_out["pubmed_papers"]            = pubmed_papers
            ev_out["fda_label_sections_count"] = fda_sections
            ev_out["fda_label_sections_found"] = sections_found
            item["evidence"]                   = ev_out

            # ── Patch clinical fields from cached_data ─────────
            # The agent is supposed to copy cached clinical fields
            # exactly but at temperature=0 it still recalculates
            # confidence and sometimes changes severity.
            # Stamp all clinical fields directly from cached_data
            # so the response is always identical to what was
            # originally synthesized and stored.
            if cached_data.get("confidence") is not None:
                item["confidence"] = cached_data["confidence"]
            if cached_data.get("severity"):
                item["severity"] = cached_data["severity"]
            if "contraindicated" in cached_data:
                item["contraindicated"] = (
                    cached_data["contraindicated"]
                )
            if cached_data.get("clinical_evidence"):
                item["clinical_evidence"] = (
                    cached_data["clinical_evidence"]
                )
            if cached_data.get("recommendation"):
                item["recommendation"] = (
                    cached_data["recommendation"]
                )
            if cached_data.get("alternative_drugs") is not None:
                item["alternative_drugs"] = (
                    cached_data["alternative_drugs"]
                )

            print(
                f"   🔧 Patched cached disease: "
                f"{item.get('drug')}+{item.get('disease')} — "
                f"confidence={item.get('confidence')} "
                f"severity={item.get('severity')} "
                f"pubmed={pubmed_papers} "
                f"fda_sections={fda_sections}"
            )

        return agent_result

    # ── Core ──────────────────────────────────────────────────────

    def _gather_drug_disease(
        self, pairs: List[Tuple[str, str]]
    ) -> Dict:

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

        for pair, cached in cache_results.items():
            if cached is not None:
                cached_ev      = cached.get("evidence", {})
                sections_found = (
                    cached_ev.get("fda_label_sections_found")
                    or cached.get("fda_label_sections_found", [])
                )
                sec_count = (
                    cached_ev.get("fda_label_sections_count")
                    or cached.get("fda_label_sections_count")
                    or len(sections_found)
                )
                evidence[pair] = {
                    "cache_hit":                True,
                    "cached_data":              cached,
                    "pubmed_count":             (
                        cached.get("pubmed_papers", 0)
                        or cached.get("pubmed_count", 0)
                    ),
                    "pubmed_pmids":             cached.get("pmids", []),
                    "abstracts":                cached.get("abstracts", []),
                    "fda_label":                {},
                    "fda_label_full":           {},
                    "fda_section_index":        {},
                    "fda_label_sections_found": sections_found,
                    "fda_label_sections_count": sec_count,
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

        contra_labels = {}
        dosing_labels = {}

        def _get_contra(d):
            with FDA_SEMAPHORE:
                return self.fda.get_drug_contraindications(d)

        def _get_dosing(d):
            with FDA_SEMAPHORE:
                return self.fda.get_dosing_label(d)

        with ThreadPoolExecutor(
            max_workers=min(len(unique_drugs) * 2, 10)
        ) as ex:
            cf = {
                ex.submit(_get_contra, d): d
                for d in unique_drugs
            }
            df = {
                ex.submit(_get_dosing, d): d
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

        merged_labels   = {}
        section_indexes = {}

        for drug in unique_drugs:
            cl = contra_labels.get(drug, {})
            dl = dosing_labels.get(drug, {})

            merged = {
                "found": (
                    cl.get("found", False) or
                    dl.get("found", False)
                )
            }
            for k, v in dl.items():
                if k not in _SKIP and v:
                    merged[k] = v
            for k, v in cl.items():
                if k not in _SKIP and v and not merged.get(k):
                    merged[k] = v

            merged_labels[drug]   = merged
            section_indexes[drug] = _build_section_index(merged)

            print(
                f"      📋 {drug}: "
                f"{len(section_indexes[drug])} clinical sections "
                f"in index — "
                f"{', '.join(section_indexes[drug].keys())}"
            )

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

        for pair in miss_pairs:
            drug, disease = pair
            pubmed        = pubmed_results.get(pair, {})
            full_label    = merged_labels.get(drug, {})
            sec_index     = section_indexes.get(drug, {})

            evidence[pair] = {
                "cache_hit":                 False,
                "cached_data":               None,
                "pubmed_count":              pubmed.get("count", 0),
                "pubmed_pmids":              pubmed.get("pmids", [])[:5],
                "abstracts":                 [
                    a["text"][:400]
                    for a in pubmed.get("abstracts", [])[:2]
                ],
                "fda_label_full":            full_label,
                "fda_section_index":         sec_index,
                "fda_label":                 {},
                "fda_label_sections_found":  list(sec_index.keys()),
                "fda_label_sections_count":  len(sec_index),
            }

        return evidence

    def inject_requested_sections(
        self,
        evidence:           Dict,
        drug:               str,
        disease:            str,
        requested_sections: List[str],
        limit:              int = 800
    ) -> Dict:
        pair = (drug, disease)
        if pair not in evidence:
            return evidence
        full_label = evidence[pair].get("fda_label_full", {})
        content    = _get_section_content(
            full_label, requested_sections, limit
        )
        evidence[pair]["fda_label"] = content
        return evidence