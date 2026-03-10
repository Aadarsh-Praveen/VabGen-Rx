"""
FDA Data Service for VabGenRx.

This module provides access to the FDA OpenFDA API for
retrieving drug safety information, labeling data,
contraindications, and adverse event reports.

Key Capabilities
----------------
• Retrieve FDA drug labeling information
• Detect contraindications and safety warnings
• Analyze adverse event reports for drug combinations
• Resolve correct generic names for combination drugs
• Cache results to reduce repeated API requests

Drug Name Normalization
-----------------------
The service automatically normalizes drug names to match
FDA database conventions, including handling combination
drugs and salt forms.

Performance
-----------
The module uses in-memory caching to avoid redundant
requests and improve response latency for repeated queries.
"""

import os
import time
import logging
import requests
from typing import Dict, Optional
from dotenv import load_dotenv

load_dotenv()

# Shared logger — Application Insights handler attached in app.py
logger = logging.getLogger("vabgenrx")

_contraindication_cache: Dict[str, Dict] = {}
_dosing_label_cache:     Dict[str, Dict] = {}
_label_name_cache:       Dict[str, str]  = {}  

_NON_SECTION_FIELDS = {
    "set_id", "id", "version", "effective_time",
    "openfda", "spl_product_data_elements",
}

_OTC_MARKERS = {
    "ask_doctor",
    "do_not_use",
    "ask_doctor_or_pharmacist",
    "stop_use",
    "keep_out_of_reach_of_children",
    "storage_and_handling",
}

_RX_MARKERS = {
    "contraindications",
    "warnings_and_precautions",
    "warnings_and_cautions",
    "drug_interactions",
    "boxed_warning",
}


def normalize_drug_name(drug_name: str) -> str:
    """
    Normalize combination drug name separator for FDA API compatibility.
    The FDA OpenFDA API uses '/' as the separator for combination drugs.
    Replaces any backslash with a forward slash.

    Examples:
        "rosiglitazone maleate\\Metformin" → "rosiglitazone maleate/Metformin"
        "Metformin"                        → "Metformin"  (unchanged)
    """
    return drug_name.replace("\\", "/")


class FDAService:

    def __init__(self):
        self.base_url = "https://api.fda.gov/drug"
        self.api_key  = os.getenv("FDA_API_KEY", "")

        if self.api_key:
            print("   ✅ FDA Service: API key loaded "
                  "(120,000 req/hour limit)")
        else:
            print("   ⚠️  FDA Service: No API key "
                  "(1,000 req/hour limit)")

    # ── Internal helper — build params with optional API key ─────────────────

    def _params(self, base: dict) -> dict:
        """Add api_key to any params dict if available."""
        if self.api_key:
            return {**base, "api_key": self.api_key}
        return base

    # ── Dynamic combination drug name resolver ────────────────────────────────

    def normalize_drug_name_for_label(self, drug_name: str) -> str:
        """
        Dynamically resolve the correct FDA generic_name for any drug —
        including combination drugs like "rosiglitazone maleate/Metformin".

        Strategy (fully dynamic — no hardcoded drug map):
        1. Replace "/" with " and " and search generic_name —
           works for most combination drugs.
        2. Search by first component, verify all components present —
           handles salt form mismatches.
        3. Search substance_name for ALL components —
           most reliable, works for any combination drug because
           FDA stores active ingredients individually in substance_name.

        Results cached in _label_name_cache so the FDA API is only
        called once per unique drug name per process lifetime.
        """
        # Always work in lowercase for matching — FDA API is case-insensitive
        # but our string comparisons must be too.
        normalized = drug_name.replace("\\", "/").strip().lower()
        cache_key  = normalized

        # Return cached result if available
        if cache_key in _label_name_cache:
            return _label_name_cache[cache_key]

        # Single drug — no resolution needed
        if "/" not in normalized:
            _label_name_cache[cache_key] = normalized
            return normalized

        # ── Combination drug — resolve via FDA API ────────────────────────
        url = f"{self.base_url}/label.json"

        def _try_search(search_str: str) -> Optional[str]:
            """Query FDA API and return the first matching generic_name."""
            try:
                params   = self._params({
                    "search": search_str,
                    "limit":  1
                })
                response = requests.get(url, params=params, timeout=10)
                if response.status_code != 200:
                    return None
                results = response.json().get("results", [])
                if not results:
                    return None
                gnames = results[0].get("openfda", {}).get(
                    "generic_name", []
                )
                return gnames[0].lower() if gnames else None
            except Exception:
                return None

        resolved   = None
        # Split on "/" and lowercase each component
        components = [c.strip().lower() for c in normalized.split("/")]

        # ── Attempt 1: replace "/" with " and " ──────────────────────────
        # Covers: "rosiglitazone maleate/metformin"
        #       → searches: generic_name:"rosiglitazone maleate and metformin"
        #       → FDA returns: "rosiglitazone maleate and metformin hydrochloride"
        # Lowercase ensures "Metformin" → "metformin" before searching.
        and_name  = normalized.replace("/", " and ")
        candidate = _try_search(
            f'openfda.generic_name:"{and_name}"'
        )
        if candidate:
            resolved = candidate
            print(
                f"   ✅ FDA name resolved (attempt 1): "
                f"'{normalized}' → '{resolved}'"
            )

        # ── Attempt 2: search first component, verify all present ─────────
        # Handles salt form mismatches where Attempt 1 fails.
        if not resolved:
            first     = components[0]
            candidate = _try_search(
                f'openfda.generic_name:"{first}" AND '
                f'openfda.product_type:"HUMAN PRESCRIPTION DRUG"'
            )
            if candidate:
                # Accept only if ALL component root words appear in result
                all_present = all(
                    c.split()[0] in candidate
                    for c in components
                )
                if all_present:
                    resolved = candidate
                    print(
                        f"   ✅ FDA name resolved (attempt 2): "
                        f"'{normalized}' → '{resolved}'"
                    )

        # ── Attempt 3: search substance_name for ALL components ───────────
        # FDA stores active ingredients individually
        # in substance_name regardless of how generic_name is formatted.
        if not resolved:
            substance_query = " AND ".join([
                f'openfda.substance_name:"{c.split()[0]}"'
                for c in components
            ])
            candidate = _try_search(substance_query)
            if candidate:
                resolved = candidate
                print(
                    f"   ✅ FDA name resolved (attempt 3 - substance): "
                    f"'{normalized}' → '{resolved}'"
                )

        # ── Fallback: use the " and " version but DO NOT cache it ────────
        # If all 3 attempts failed, the FDA API may be temporarily
        # unavailable or rate-limited. Caching the fallback would mean
        # every subsequent call this process lifetime also gets the
        # unresolved name — preventing recovery on retry.
        # Only cache confirmed resolutions from the FDA API.
        if not resolved:
            print(
                f"   ⚠️  FDA name unresolved for '{normalized}' — "
                f"falling back to '{and_name}' (not cached)"
            )
            return and_name  

        # Only cache successful resolutions
        _label_name_cache[cache_key] = resolved
        return resolved

    # ── Drug Contraindications ────────────────────────────────────────────────

    def get_drug_contraindications(
        self, drug_name: str
    ) -> Optional[Dict]:
        drug_name  = normalize_drug_name(drug_name)
        label_name = self.normalize_drug_name_for_label(drug_name)
        cache_key  = label_name.lower().strip()
        if cache_key in _contraindication_cache:
            return _contraindication_cache[cache_key]
        result = self._fetch_contraindications(label_name)
        _contraindication_cache[cache_key] = result
        return result

    def _fetch_contraindications(
        self, drug_name: str
    ) -> Optional[Dict]:
        for attempt in range(2):
            try:
                url    = f"{self.base_url}/label.json"
                params = self._params({
                    "search": (
                        f'(openfda.brand_name:"{drug_name}" OR '
                        f'openfda.generic_name:"{drug_name}")'
                    ),
                    "limit": 1
                })
                response = requests.get(
                    url, params=params, timeout=20
                )
                if response.status_code == 200:
                    data = response.json()
                    if data.get("results"):
                        label = data["results"][0]
                        return {
                            "found":             True,
                            "contraindications": " ".join(
                                label.get("contraindications", [])
                            ),
                            "warnings":          " ".join(
                                label.get("warnings", [])
                            ),
                            "drug_interactions": " ".join(
                                label.get("drug_interactions", [])
                            ),
                            "food_info":         " ".join(
                                label.get(
                                    "information_for_patients", []
                                )
                            )
                        }
                return {"found": False}
            except requests.exceptions.Timeout:
                if attempt == 0:
                    print(f"   ⚠️  FDA contraindications timeout "
                          f"for {drug_name} — retrying in 2s...")
                    time.sleep(2)
                else:
                    # ── Alert 3: FDA contraindications timeout ─────────────
                    logger.error(
                        "fda_api_timeout",
                        extra={
                            "custom_dimensions": {
                                "event":    "fda_api_timeout",
                                "endpoint": "contraindications",
                                "drug":     drug_name,
                            }
                        }
                    )
                    print(f"   ❌ FDA contraindications timeout "
                          f"for {drug_name} after retry")
            except Exception as e:
                # ── Alert 3: FDA contraindications unexpected failure ───────
                logger.error(
                    "fda_api_failure",
                    extra={
                        "custom_dimensions": {
                            "event":    "fda_api_failure",
                            "endpoint": "contraindications",
                            "drug":     drug_name,
                            "error":    str(e)[:200],
                        }
                    }
                )
                print(f"   ❌ FDA contraindications error "
                      f"for {drug_name}: {e}")
                break
        return {"found": False}

    # ── Adverse Events ────────────────────────────────────────────────────────

    def search_adverse_events(
        self, drug1: str, drug2: str
    ) -> Dict:
        drug1 = normalize_drug_name(drug1)
        drug2 = normalize_drug_name(drug2)
        for attempt in range(2):
            try:
                url    = f"{self.base_url}/event.json"
                params = self._params({
                    "search": (
                        f'(patient.drug.medicinalproduct:"{drug1}" OR '
                        f'patient.drug.openfda.generic_name:"{drug1}") '
                        f'AND '
                        f'(patient.drug.medicinalproduct:"{drug2}" OR '
                        f'patient.drug.openfda.generic_name:"{drug2}")'
                    ),
                    "count": "serious"
                })
                response = requests.get(
                    url, params=params, timeout=20
                )
                if response.status_code == 200:
                    results       = response.json().get("results", [])
                    serious_count = next(
                        (
                            r["count"] for r in results
                            if str(r["term"]) == "1"
                        ),
                        0
                    )
                    total = sum(r["count"] for r in results)
                    return {
                        "found":           True,
                        "total_reports":   total,
                        "serious_reports": serious_count,
                        "severity_ratio":  (
                            serious_count / total
                            if total > 0 else 0
                        )
                    }

                # ── Alert 3: FAERS non-200 response ───────────────────────
                logger.error(
                    "fda_api_failure",
                    extra={
                        "custom_dimensions": {
                            "event":       "fda_api_failure",
                            "endpoint":    "adverse_events",
                            "drug1":       drug1,
                            "drug2":       drug2,
                            "status_code": response.status_code,
                        }
                    }
                )
                return {"found": False, "total_reports": 0}

            except requests.exceptions.Timeout:
                if attempt == 0:
                    print(f"   ⚠️  FDA adverse events timeout "
                          f"for {drug1}+{drug2} — retrying in 2s...")
                    time.sleep(2)
                else:
                    # ── Alert 3: FAERS timeout after retry ─────────────────
                    logger.error(
                        "fda_api_timeout",
                        extra={
                            "custom_dimensions": {
                                "event":    "fda_api_timeout",
                                "endpoint": "adverse_events",
                                "drug1":    drug1,
                                "drug2":    drug2,
                            }
                        }
                    )
                    print(f"   ❌ FDA adverse events timeout "
                          f"for {drug1}+{drug2} after retry")
            except Exception as e:
                # ── Alert 3: FAERS unexpected failure ──────────────────────
                logger.error(
                    "fda_api_failure",
                    extra={
                        "custom_dimensions": {
                            "event":    "fda_api_failure",
                            "endpoint": "adverse_events",
                            "drug1":    drug1,
                            "drug2":    drug2,
                            "error":    str(e)[:200],
                        }
                    }
                )
                break
        return {"found": False, "total_reports": 0}

    # ── Dosing Label ──────────────────────────────────────────────────────────

    def get_dosing_label(self, drug_name: str) -> Dict:
        drug_name  = normalize_drug_name(drug_name)
        label_name = self.normalize_drug_name_for_label(drug_name)
        cache_key  = label_name.lower().strip()
        if cache_key in _dosing_label_cache:
            return _dosing_label_cache[cache_key]
        result = self._fetch_dosing_label(label_name)
        _dosing_label_cache[cache_key] = result
        return result

    def _fetch_dosing_label(self, drug_name: str) -> Dict:
        for attempt in range(2):
            try:
                return self._fetch_dosing_label_attempt(drug_name)
            except requests.exceptions.Timeout:
                if attempt == 0:
                    print(
                        f"   ⚠️  FDA dosing label timeout "
                        f"for {drug_name} — retrying in 2s..."
                    )
                    time.sleep(2)
                else:
                    # ── Alert 3: dosing label timeout after retry ──────────
                    logger.error(
                        "fda_api_timeout",
                        extra={
                            "custom_dimensions": {
                                "event":    "fda_api_timeout",
                                "endpoint": "dosing_label",
                                "drug":     drug_name,
                            }
                        }
                    )
                    print(
                        f"   ❌ FDA dosing label timeout "
                        f"for {drug_name} after retry"
                    )
            except Exception as e:
                # ── Alert 3: dosing label unexpected failure ───────────────
                logger.error(
                    "fda_api_failure",
                    extra={
                        "custom_dimensions": {
                            "event":    "fda_api_failure",
                            "endpoint": "dosing_label",
                            "drug":     drug_name,
                            "error":    str(e)[:200],
                        }
                    }
                )
                print(
                    f"   ❌ FDA dosing label error "
                    f"for {drug_name}: {e}"
                )
                break
        return {"found": False, "drug": drug_name}

    def _fetch_dosing_label_attempt(
        self, drug_name: str
    ) -> Dict:
        """Single attempt at fetching dosing label."""
        url = f"{self.base_url}/label.json"

        def _search(search_str: str, limit: int = 5) -> list:
            params   = self._params({
                "search": search_str,
                "limit":  limit
            })
            response = requests.get(
                url, params=params, timeout=20
            )
            if response.status_code != 200:
                return []
            return response.json().get("results", [])

        def _pick_best(results: list):
            # is_combo: True when drug_name itself is a combination
            # (contains " and " after normalization). For combo drugs
            is_combo = " and " in drug_name.lower()

            # Pass 1: prefer Rx labels that match the drug name exactly
            for r in results:
                gnames = r.get(
                    "openfda", {}
                ).get("generic_name", [])
                if len(gnames) == 1:
                    gname = gnames[0].upper()
                    # For single drugs: skip combo labels (" AND " in name)
                    # For combo drugs: allow " AND " in name — it's expected
                    name_ok = (
                        drug_name.upper() in gname
                        if is_combo
                        else (
                            drug_name.upper() in gname
                            and " AND " not in gname
                        )
                    )
                    if name_ok and set(r.keys()) & _RX_MARKERS:
                        return r

            # Pass 2: any label that matches without requiring Rx markers
            for r in results:
                gnames = r.get(
                    "openfda", {}
                ).get("generic_name", [])
                if len(gnames) == 1:
                    if is_combo or " AND " not in gnames[0].upper():
                        return r

            # Pass 3: return first result as fallback
            return results[0] if results else None

        label = None

        results = _search(
            f'openfda.generic_name:"{drug_name}"'
        )
        label   = _pick_best(results) if results else None

        if not label:
            results = _search(
                f'openfda.brand_name:"{drug_name}"'
            )
            label   = _pick_best(results) if results else None

        if label:
            label_keys = set(label.keys())
            is_otc     = bool(label_keys & _OTC_MARKERS)
            has_rx     = bool(label_keys & _RX_MARKERS)

            if is_otc and not has_rx:
                print(
                    f"   ℹ️  {drug_name}: OTC label detected — "
                    f"retrying for Rx prescription label..."
                )
                rx_results = _search(
                    f'(openfda.generic_name:"{drug_name}" OR '
                    f'openfda.brand_name:"{drug_name}") AND '
                    f'openfda.product_type:'
                    f'"HUMAN PRESCRIPTION DRUG"',
                    limit=5
                )
                if rx_results:
                    rx_label = _pick_best(rx_results)
                    if rx_label:
                        rx_keys = set(rx_label.keys())
                        if rx_keys & _RX_MARKERS:
                            label = rx_label
                            print(f"   ✅ {drug_name}: Rx label found")
                        else:
                            print(
                                f"   ⚠️  {drug_name}: "
                                f"No Rx label — using OTC"
                            )

        if not label:
            print(f"   ⚠️  No FDA label found for {drug_name}")
            return {"found": False, "drug": drug_name}

        result = {"found": True, "drug": drug_name}

        for key, value in label.items():
            if key in _NON_SECTION_FIELDS:
                continue
            if not value:
                continue
            if isinstance(value, list):
                joined = " ".join(str(v) for v in value)
                if joined:
                    result[key] = joined[:2000]
            elif isinstance(value, str):
                result[key] = value[:2000]
            else:
                result[key] = value

        result["brand_names"]   = label.get(
            "openfda", {}
        ).get("brand_name", [])
        result["generic_names"] = label.get(
            "openfda", {}
        ).get("generic_name", [])
        result["manufacturer"]  = label.get(
            "openfda", {}
        ).get("manufacturer_name", [])

        _meta = {
            "found", "drug",
            "brand_names", "generic_names", "manufacturer"
        }
        found_sections = [
            k for k, v in result.items()
            if k not in _meta and v
        ]

        print(
            f"   ✅ FDA dosing label found for {drug_name} "
            f"({result['generic_names']}): "
            f"{len(found_sections)} sections — "
            f"{', '.join(found_sections) or 'basic label only'}"
        )
        return result

    # ── Cache Management ──────────────────────────────────────────────────────

    @staticmethod
    def clear_cache():
        global _contraindication_cache, _dosing_label_cache, _label_name_cache
        _contraindication_cache = {}
        _dosing_label_cache     = {}
        _label_name_cache       = {}
        print("   🗑️  FDA label cache cleared")

    @staticmethod
    def get_cache_stats() -> Dict:
        return {
            "contraindication_cache_size": len(
                _contraindication_cache
            ),
            "dosing_label_cache_size": len(
                _dosing_label_cache
            ),
            "label_name_cache_size": len(
                _label_name_cache
            ),
        }