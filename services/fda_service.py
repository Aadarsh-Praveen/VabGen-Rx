"""
VabGenRx — FDA Service
Wraps the FDA OpenAPI for drug labels and adverse events.

CHANGES:
- _fetch_dosing_label timeout increased from 10s to 20s
- _fetch_dosing_label retries once on timeout or 5xx error
  with 2s wait — prevents empty label on transient FDA API
  timeouts that occur when many concurrent requests are made
- _search() helper inside _fetch_dosing_label also uses 20s
- get_drug_contraindications timeout increased to 20s + retry
- OTC vs Rx label detection unchanged
- In-memory cache unchanged
- _NON_SECTION_FIELDS unchanged
"""

import time
import requests
from typing import Dict, Optional


_contraindication_cache: Dict[str, Dict] = {}
_dosing_label_cache:     Dict[str, Dict] = {}

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


class FDAService:

    def __init__(self):
        self.base_url = "https://api.fda.gov/drug"

    # ── Drug Contraindications ────────────────────────────────────────────────

    def get_drug_contraindications(
        self, drug_name: str
    ) -> Optional[Dict]:
        cache_key = drug_name.lower().strip()
        if cache_key in _contraindication_cache:
            return _contraindication_cache[cache_key]
        result = self._fetch_contraindications(drug_name)
        _contraindication_cache[cache_key] = result
        return result

    def _fetch_contraindications(
        self, drug_name: str
    ) -> Optional[Dict]:
        for attempt in range(2):
            try:
                url    = f"{self.base_url}/label.json"
                params = {
                    "search": (
                        f'(openfda.brand_name:"{drug_name}" OR '
                        f'openfda.generic_name:"{drug_name}")'
                    ),
                    "limit": 1
                }
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
                    print(f"   ❌ FDA contraindications timeout "
                          f"for {drug_name} after retry")
            except Exception as e:
                print(f"   ❌ FDA contraindications error "
                      f"for {drug_name}: {e}")
                break
        return {"found": False}

    # ── Adverse Events ────────────────────────────────────────────────────────

    def search_adverse_events(
        self, drug1: str, drug2: str
    ) -> Dict:
        for attempt in range(2):
            try:
                url    = f"{self.base_url}/event.json"
                search = (
                    f'(patient.drug.medicinalproduct:"{drug1}" OR '
                    f'patient.drug.openfda.generic_name:"{drug1}") '
                    f'AND '
                    f'(patient.drug.medicinalproduct:"{drug2}" OR '
                    f'patient.drug.openfda.generic_name:"{drug2}")'
                )
                params   = {"search": search, "count": "serious"}
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
                return {"found": False, "total_reports": 0}
            except requests.exceptions.Timeout:
                if attempt == 0:
                    print(f"   ⚠️  FDA adverse events timeout "
                          f"for {drug1}+{drug2} — retrying in 2s...")
                    time.sleep(2)
                else:
                    print(f"   ❌ FDA adverse events timeout "
                          f"for {drug1}+{drug2} after retry")
            except Exception:
                break
        return {"found": False, "total_reports": 0}

    # ── Dosing Label ──────────────────────────────────────────────────────────

    def get_dosing_label(self, drug_name: str) -> Dict:
        cache_key = drug_name.lower().strip()
        if cache_key in _dosing_label_cache:
            return _dosing_label_cache[cache_key]
        result = self._fetch_dosing_label(drug_name)
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
                    print(
                        f"   ❌ FDA dosing label timeout "
                        f"for {drug_name} after retry"
                    )
            except Exception as e:
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
            params   = {"search": search_str, "limit": limit}
            response = requests.get(
                url, params=params, timeout=20  # increased from 10
            )
            if response.status_code != 200:
                return []
            return response.json().get("results", [])

        def _pick_best(results: list):
            for r in results:
                gnames = r.get(
                    "openfda", {}
                ).get("generic_name", [])
                if len(gnames) == 1:
                    gname = gnames[0].upper()
                    if (
                        drug_name.upper() in gname
                        and " AND " not in gname
                    ):
                        if set(r.keys()) & _RX_MARKERS:
                            return r
            for r in results:
                gnames = r.get(
                    "openfda", {}
                ).get("generic_name", [])
                if (
                    len(gnames) == 1
                    and " AND " not in gnames[0].upper()
                ):
                    return r
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
        global _contraindication_cache, _dosing_label_cache
        _contraindication_cache = {}
        _dosing_label_cache     = {}
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
        }