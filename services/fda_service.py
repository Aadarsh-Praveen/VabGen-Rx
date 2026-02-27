import requests
from typing import Dict, Optional

class FDAService:
    def __init__(self):
        self.base_url = "https://api.fda.gov/drug"
    
    def get_drug_contraindications(self, drug_name: str) -> Optional[Dict]:
        try:
            url = f"{self.base_url}/label.json"
            # Expanded search to look in brand and generic fields
            params = {
                'search': f'(openfda.brand_name:"{drug_name}" OR openfda.generic_name:"{drug_name}")',
                'limit': 1
            }
            response = requests.get(url, params=params, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if data.get('results'):
                    label = data['results'][0]
                    return {
                        'found': True,
                        'contraindications': ' '.join(label.get('contraindications', [])),
                        'warnings': ' '.join(label.get('warnings', [])),
                        'drug_interactions': ' '.join(label.get('drug_interactions', [])),
                        'food_info': ' '.join(label.get('information_for_patients', []))
                    }
            return {'found': False}
        except:
            return {'found': False}
    
    def search_adverse_events(self, drug1: str, drug2: str) -> Dict:
        try:
            url = f"{self.base_url}/event.json"
            # Search both drugs across medicinalproduct and generic_name fields
            search = (
                f'(patient.drug.medicinalproduct:"{drug1}" OR patient.drug.openfda.generic_name:"{drug1}") '
                f'AND (patient.drug.medicinalproduct:"{drug2}" OR patient.drug.openfda.generic_name:"{drug2}")'
            )
            params = {'search': search, 'count': 'serious'}
            response = requests.get(url, params=params, timeout=10)
            
            if response.status_code == 200:
                results = response.json().get('results', [])
                serious_count = next((r['count'] for r in results if str(r['term']) == '1'), 0)
                total = sum(r['count'] for r in results)
                return {
                    'found': True,
                    'total_reports': total,
                    'serious_reports': serious_count,
                    'severity_ratio': serious_count / total if total > 0 else 0
                }
            return {'found': False, 'total_reports': 0}
        except:
            return {'found': False, 'total_reports': 0}
        
    # ── New Method — Dosing Label ──────────────────────────────────────────────

    def get_dosing_label(self, drug_name: str) -> Dict:
        """
        Fetch dosing-specific FDA label sections for a drug.
        Searches generic name first to avoid returning combination
        drug labels (e.g. ZITUVIMET instead of plain Metformin).
        """
        try:
            url = f"{self.base_url}/label.json"

            # ── Strategy: fetch more results and pick the best match ──────────
            # Search generic name first, get up to 5 results, then pick
            # the single-ingredient label that exactly matches drug_name
            searches = [
                f'openfda.generic_name:"{drug_name}"',
                f'openfda.brand_name:"{drug_name}"',
            ]

            label = None
            for search in searches:
                params   = {'search': search, 'limit': 5}
                response = requests.get(url, params=params, timeout=10)

                if response.status_code != 200:
                    continue

                results = response.json().get('results', [])
                if not results:
                    continue

                # Pass 1 — exact single-ingredient match
                # e.g. generic_names == ['METFORMIN HYDROCHLORIDE'] not
                # ['SITAGLIPTIN AND METFORMIN HYDROCHLORIDE']
                for r in results:
                    generic_names = r.get('openfda', {}).get('generic_name', [])
                    if len(generic_names) == 1:
                        # Check the single name actually contains our drug
                        # and is NOT a combo (no "AND" in the name)
                        gname = generic_names[0].upper()
                        if (drug_name.upper() in gname and ' AND ' not in gname):
                            label = r
                            break

                if label:
                    break

                # Pass 2 — any single-ingredient label
                if not label:
                    for r in results:
                        generic_names = r.get('openfda', {}).get('generic_name', [])
                        if len(generic_names) == 1 and ' AND ' not in generic_names[0].upper():
                            label = r
                            break

                # Pass 3 — fallback to first result
                if not label and results:
                    label = results[0]

                if label:
                    break

            if not label:
                print(f"   ⚠️  No FDA label found for {drug_name}")
                return {'found': False, 'drug': drug_name}

            # Helper to safely join list fields from FDA label
            def _join(field: str, limit: int = 3000) -> str:
                return ' '.join(label.get(field, []))[:limit]

            result = {
                'found': True,
                'drug':  drug_name,

                # Dosing core
                'dosage_and_administration':   _join('dosage_and_administration'),
                'warnings_and_precautions':    _join('warnings_and_precautions'),
                'use_in_specific_populations': _join('use_in_specific_populations'),
                'clinical_pharmacology':       _join('clinical_pharmacology', 2000),
                'boxed_warning':               _join('boxed_warning', 1000),

                # Safety context
                'contraindications':           _join('contraindications', 1000),
                'warnings':                    _join('warnings', 1000),
                'drug_interactions':           _join('drug_interactions', 1000),

                # Metadata
                'brand_names':   label.get('openfda', {}).get('brand_name', []),
                'generic_names': label.get('openfda', {}).get('generic_name', []),
                'manufacturer':  label.get('openfda', {}).get('manufacturer_name', []),
            }

            found_sections = [
                k for k in [
                    'dosage_and_administration',
                    'use_in_specific_populations',
                    'clinical_pharmacology',
                    'boxed_warning'
                ] if result.get(k)
            ]
            print(f"   ✅ FDA dosing label found for {drug_name} "
                  f"({result['generic_names']}): "
                  f"{', '.join(found_sections) or 'basic label only'}")
            return result

        except Exception as e:
            print(f"   ❌ FDA dosing label error for {drug_name}: {e}")
            return {'found': False, 'drug': drug_name, 'error': str(e)}