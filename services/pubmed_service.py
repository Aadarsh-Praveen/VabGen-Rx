"""
PubMed Research Service
Access to 35M+ medical research papers
U.S. National Library of Medicine
"""

import requests
import time
import xml.etree.ElementTree as ET
from typing import Dict, List, Optional

class PubMedService:
    """
    Interface to PubMed medical research database
    Free government API - no key required
    """
    
    def __init__(self):
        self.base_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
        self.email = "medguardai@research.edu"
    
    def search_drug_interaction(self, drug1: str, drug2: str, max_results: int = 5) -> Dict:
        query = f'("{drug1}"[Title/Abstract] AND "{drug2}"[Title/Abstract] AND "drug interaction"[MeSH Terms])'
        return self._search_and_fetch(query, max_results)
    
    def search_disease_contraindication(self, drug: str, disease: str, max_results: int = 5) -> Dict:
        query = f'("{drug}"[Title/Abstract] AND "{disease}"[Title/Abstract] AND (contraindication[Title/Abstract] OR safety[Title/Abstract] OR adverse[Title/Abstract]))'
        return self._search_and_fetch(query, max_results)
    
    def _search_and_fetch(self, query: str, max_results: int) -> Dict:
        try:
            search_params = {
                'db': 'pubmed', 'term': query, 'retmax': max_results,
                'retmode': 'json', 'sort': 'relevance', 'email': self.email
            }
            response = requests.get(f"{self.base_url}esearch.fcgi", params=search_params, timeout=10)
            data = response.json()
            pmids = data.get('esearchresult', {}).get('idlist', [])
            count = int(data.get('esearchresult', {}).get('count', 0))
            
            if not pmids:
                return {'count': 0, 'pmids': [], 'abstracts': [], 'evidence_quality': 'none'}
            
            time.sleep(0.4) # Rate limiting compliance
            
            fetch_params = {'db': 'pubmed', 'id': ','.join(pmids), 'retmode': 'xml', 'email': self.email}
            fetch_response = requests.get(f"{self.base_url}efetch.fcgi", params=fetch_params, timeout=15)
            
            abstracts = self._parse_abstracts(fetch_response.text)
            evidence_quality = 'high' if count > 20 else 'medium' if count > 5 else 'low'
            
            return {'count': count, 'pmids': pmids, 'abstracts': abstracts, 'evidence_quality': evidence_quality}
        except Exception as e:
            print(f"PubMed Error: {e}")
            return {'count': 0, 'pmids': [], 'abstracts': [], 'evidence_quality': 'none'}

    def _parse_abstracts(self, xml_text: str) -> List[Dict]:
        """Robustly parse XML to handle nested formatting tags like <i> or <b>"""
        abstracts = []
        try:
            root = ET.fromstring(xml_text)
            for article in root.findall(".//PubmedArticle"):
                pmid = article.find(".//PMID").text if article.find(".//PMID") is not None else "unknown"
                
                # Extract text from all AbstractText parts (some papers have multiple sections)
                abstract_parts = article.findall(".//AbstractText")
                if abstract_parts:
                    full_text = " ".join(["".join(part.itertext()) for part in abstract_parts])
                    abstracts.append({
                        'pmid': pmid,
                        'text': full_text[:1200],
                        'url': f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
                    })
        except Exception as e:
            print(f"XML Parse Error: {e}")
        return abstracts

    def search_all_food_interactions_for_drug(self, drug: str, max_results: int = 10) -> Dict:
            """
            Broad search for any dietary/nutritional interactions with a specific drug.
            Used by the EvidenceAnalyzer's smart food detection.
            """
            # Broad query to catch nutrition, supplements, and specific dietary items
            query = (
                f'("{drug}"[Title/Abstract] AND ('
                f'food[Title/Abstract] OR diet[Title/Abstract] OR '
                f'beverage[Title/Abstract] OR nutrition[Title/Abstract] OR '
                f'supplement[Title/Abstract]))'
            )
            return self._search_and_fetch(query, max_results)