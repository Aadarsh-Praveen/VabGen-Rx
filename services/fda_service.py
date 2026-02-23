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