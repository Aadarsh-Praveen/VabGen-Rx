"""
VabGenRx — FDA Service
Wraps the FDA OpenAPI for drug labels and adverse events.

CHANGES:
- get_dosing_label now captures ALL sections the FDA API returns
  dynamically — no hardcoded section list
- OTC vs Rx label detection — if OTC consumer label is returned,
  retries with product_type:"HUMAN PRESCRIPTION DRUG" filter
  to get the clinical prescribing information label instead
- In-memory cache unchanged
- _NON_SECTION_FIELDS excludes only true metadata keys
"""

import requests
from typing import Dict, Optional


# ── Module-level in-memory label cache ───────────────────────────────────────
_contraindication_cache: Dict[str, Dict] = {}
_dosing_label_cache:     Dict[str, Dict] = {}

# Keys in the FDA label API response that are metadata,
# not clinical content. Everything else is a real section.
_NON_SECTION_FIELDS = {
    "set_id", "id", "version", "effective_time",
    "openfda", "spl_product_data_elements",
}

# OTC consumer label marker sections
# If these are present and Rx markers absent → OTC label
_OTC_MARKERS = {
    "ask_doctor",
    "do_not_use",
    "ask_doctor_or_pharmacist",
    "stop_use",
    "keep_out_of_reach_of_children",
    "storage_and_handling",
}

# Rx prescription label marker sections
# At least one expected in a clinical prescribing information label
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
        """
        Get FDA official drug label for a single drug.
        Returns contraindications and warnings.
        In-memory cached per process.
        """
        cache_key = drug_name.lower().strip()
        if cache_key in _contraindication_cache:
            return _contraindication_cache[cache_key]
        result = self._fetch_contraindications(drug_name)
        _contraindication_cache[cache_key] = result
        return result

    def _fetch_contraindications(
        self, drug_name: str
    ) -> Optional[Dict]:
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
                url, params=params, timeout=10
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
        except Exception:
            return {"found": False}

    # ── Adverse Events ────────────────────────────────────────────────────────

    def search_adverse_events(
        self, drug1: str, drug2: str
    ) -> Dict:
        """
        Search FDA adverse event database for a drug pair.
        No caching — each pair is unique and called once.
        """
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
                url, params=params, timeout=10
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
        except Exception:
            return {"found": False, "total_reports": 0}

    # ── Dosing Label ──────────────────────────────────────────────────────────

    def get_dosing_label(self, drug_name: str) -> Dict:
        """
        Fetch dosing-specific FDA label sections for a drug.
        In-memory cached per process.

        Prefers Rx prescription label over OTC consumer label.
        Captures ALL sections the API returns dynamically —
        no hardcoded section list.
        """
        cache_key = drug_name.lower().strip()
        if cache_key in _dosing_label_cache:
            return _dosing_label_cache[cache_key]
        result = self._fetch_dosing_label(drug_name)
        _dosing_label_cache[cache_key] = result
        return result

    def _fetch_dosing_label(self, drug_name: str) -> Dict:
        """
        Fetch dosing label from FDA API.

        OTC vs Rx detection:
        - If returned label contains OTC marker sections
          (ask_doctor, do_not_use, etc.) and lacks Rx markers
          (contraindications, warnings_and_precautions, etc.),
          retry with product_type:"HUMAN PRESCRIPTION DRUG"
          to get the clinical prescribing information label.
        """
        try:
            url = f"{self.base_url}/label.json"

            def _search(search_str: str, limit: int = 5) -> list:
                params   = {"search": search_str, "limit": limit}
                response = requests.get(
                    url, params=params, timeout=10
                )
                if response.status_code != 200:
                    return []
                return response.json().get("results", [])

            def _pick_best(results: list):
                """
                From a list of label results, prefer:
                Pass 1 — single-ingredient + has Rx markers
                Pass 2 — single-ingredient, any
                Pass 3 — first result fallback
                """
                # Pass 1 — exact single-ingredient Rx match
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

                # Pass 2 — any single-ingredient label
                for r in results:
                    gnames = r.get(
                        "openfda", {}
                    ).get("generic_name", [])
                    if (
                        len(gnames) == 1
                        and " AND " not in gnames[0].upper()
                    ):
                        return r

                # Pass 3 — fallback to first result
                return results[0] if results else None

            label = None

            # ── Search 1: generic name ─────────────────────────────
            results = _search(
                f'openfda.generic_name:"{drug_name}"'
            )
            label   = _pick_best(results) if results else None

            # ── Search 2: brand name ───────────────────────────────
            if not label:
                results = _search(
                    f'openfda.brand_name:"{drug_name}"'
                )
                label   = _pick_best(results) if results else None

            # ── OTC detection + Rx retry ───────────────────────────
            # If label looks like an OTC consumer label,
            # try to find the prescription version explicitly
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
                                print(
                                    f"   ✅ {drug_name}: "
                                    f"Rx label found"
                                )
                            else:
                                print(
                                    f"   ⚠️  {drug_name}: "
                                    f"No Rx label found — "
                                    f"using OTC label"
                                )
                    else:
                        print(
                            f"   ⚠️  {drug_name}: "
                            f"No Rx label found — "
                            f"using OTC label"
                        )

            if not label:
                print(
                    f"   ⚠️  No FDA label found for {drug_name}"
                )
                return {"found": False, "drug": drug_name}

            # ── Capture ALL sections dynamically ──────────────────
            # Iterate every key the FDA API actually returned.
            # No hardcoded list — if FDA adds a new section
            # it gets captured automatically.
            result = {
                "found": True,
                "drug":  drug_name,
            }

            for key, value in label.items():
                if key in _NON_SECTION_FIELDS:
                    continue
                if not value:
                    continue
                # FDA returns list of strings — join and truncate
                if isinstance(value, list):
                    joined = " ".join(str(v) for v in value)
                    if joined:
                        result[key] = joined[:2000]
                elif isinstance(value, str):
                    result[key] = value[:2000]
                else:
                    result[key] = value

            # Metadata from openfda sub-object
            result["brand_names"]   = label.get(
                "openfda", {}
            ).get("brand_name", [])
            result["generic_names"] = label.get(
                "openfda", {}
            ).get("generic_name", [])
            result["manufacturer"]  = label.get(
                "openfda", {}
            ).get("manufacturer_name", [])

            # Sections = every content key captured above
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

        except Exception as e:
            print(
                f"   ❌ FDA dosing label error "
                f"for {drug_name}: {e}"
            )
            return {
                "found": False,
                "drug":  drug_name,
                "error": str(e)
            }

    # ── Cache Management ──────────────────────────────────────────────────────

    @staticmethod
    def clear_cache():
        """
        Clear in-memory FDA label caches.
        Useful for testing or forced refresh.
        """
        global _contraindication_cache, _dosing_label_cache
        _contraindication_cache = {}
        _dosing_label_cache     = {}
        print("   🗑️  FDA label cache cleared")

    @staticmethod
    def get_cache_stats() -> Dict:
        """
        Return current cache size for monitoring.
        """
        return {
            "contraindication_cache_size": len(
                _contraindication_cache
            ),
            "dosing_label_cache_size": len(
                _dosing_label_cache
            ),
        }