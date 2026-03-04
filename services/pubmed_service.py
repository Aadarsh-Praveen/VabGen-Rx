"""
PubMed Research Service
Access to 35M+ medical research papers
U.S. National Library of Medicine

CHANGES:
- Added NCBI API key support — raises rate limit from 3 to 10
  requests per second
- _parse_abstracts guards against empty and non-XML responses
- email updated to match NCBI account
"""

import os
import requests
import time
import xml.etree.ElementTree as ET
from typing import Dict, List, Optional
from dotenv import load_dotenv

load_dotenv()


class PubMedService:
    """
    Interface to PubMed medical research database.
    Free government API.
    With NCBI API key: 10 requests/second.
    Without key: 3 requests/second.
    """

    def __init__(self):
        self.base_url = (
            "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
        )
        self.email   = "aadarsh050999@gmail.com"
        self.api_key = os.getenv("NCBI_API_KEY", "")

        if self.api_key:
            print(f"   ✅ PubMed: NCBI API key loaded "
                  f"(10 req/s limit)")
        else:
            print(f"   ⚠️  PubMed: No NCBI API key "
                  f"(3 req/s limit)")

    # ── Search methods ────────────────────────────────────────────

    def search_drug_interaction(
        self,
        drug1:       str,
        drug2:       str,
        max_results: int = 5
    ) -> Dict:
        query = (
            f'("{drug1}"[Title/Abstract] AND '
            f'"{drug2}"[Title/Abstract] AND '
            f'"drug interaction"[MeSH Terms])'
        )
        return self._search_and_fetch(query, max_results)

    def search_disease_contraindication(
        self,
        drug:        str,
        disease:     str,
        max_results: int = 5
    ) -> Dict:
        query = (
            f'("{drug}"[Title/Abstract] AND '
            f'"{disease}"[Title/Abstract] AND '
            f'(contraindication[Title/Abstract] OR '
            f'safety[Title/Abstract] OR '
            f'adverse[Title/Abstract]))'
        )
        return self._search_and_fetch(query, max_results)

    def search_all_food_interactions_for_drug(
        self,
        drug:        str,
        max_results: int = 10
    ) -> Dict:
        query = (
            f'("{drug}"[Title/Abstract] AND ('
            f'food[Title/Abstract] OR '
            f'diet[Title/Abstract] OR '
            f'beverage[Title/Abstract] OR '
            f'nutrition[Title/Abstract] OR '
            f'supplement[Title/Abstract]))'
        )
        return self._search_and_fetch(query, max_results)

    # ── Core search and fetch ─────────────────────────────────────

    def _search_and_fetch(
        self,
        query:       str,
        max_results: int
    ) -> Dict:
        try:
            # ── Step 1: Search for PMIDs ──────────────────────────
            search_params = {
                'db':      'pubmed',
                'term':    query,
                'retmax':  max_results,
                'retmode': 'json',
                'sort':    'relevance',
                'email':   self.email,
            }
            if self.api_key:
                search_params['api_key'] = self.api_key

            response = requests.get(
                f"{self.base_url}esearch.fcgi",
                params  = search_params,
                timeout = 10
            )

            # Check for non-JSON error response
            try:
                data = response.json()
            except Exception:
                print(f"PubMed search returned non-JSON: "
                      f"{response.text[:120]}")
                return {
                    'count':            0,
                    'pmids':            [],
                    'abstracts':        [],
                    'evidence_quality': 'none',
                }

            pmids = data.get(
                'esearchresult', {}
            ).get('idlist', [])
            count = int(
                data.get(
                    'esearchresult', {}
                ).get('count', 0)
            )

            if not pmids:
                return {
                    'count':            count,
                    'pmids':            [],
                    'abstracts':        [],
                    'evidence_quality': 'none',
                }

            # ── Rate limiting ─────────────────────────────────────
            # With API key: 10 req/s → 0.1s sleep sufficient
            # Without key:  3 req/s  → 0.4s sleep required
            sleep_time = 0.15 if self.api_key else 0.4
            time.sleep(sleep_time)

            # ── Step 2: Fetch abstracts ───────────────────────────
            fetch_params = {
                'db':      'pubmed',
                'id':      ','.join(pmids),
                'retmode': 'xml',
                'email':   self.email,
            }
            if self.api_key:
                fetch_params['api_key'] = self.api_key

            fetch_response = requests.get(
                f"{self.base_url}efetch.fcgi",
                params  = fetch_params,
                timeout = 15
            )

            abstracts        = self._parse_abstracts(
                fetch_response.text
            )
            evidence_quality = (
                'high'   if count > 20 else
                'medium' if count > 5  else
                'low'
            )

            return {
                'count':            count,
                'pmids':            pmids,
                'abstracts':        abstracts,
                'evidence_quality': evidence_quality,
            }

        except Exception as e:
            print(f"PubMed Error: {e}")
            return {
                'count':            0,
                'pmids':            [],
                'abstracts':        [],
                'evidence_quality': 'none',
            }

    # ── XML Parser ────────────────────────────────────────────────

    def _parse_abstracts(self, xml_text: str) -> List[Dict]:
        """
        Robustly parse PubMed XML response.

        Guards against:
        - Empty response
        - Non-XML response (rate limit errors, HTML error pages)
        - Malformed XML with nested tags
        """
        abstracts = []

        # Guard 1 — empty response
        if not xml_text or not xml_text.strip():
            return abstracts

        # Guard 2 — non-XML response
        # PubMed returns JSON error on rate limit
        # or HTML on server errors
        stripped = xml_text.strip()
        if not stripped.startswith('<'):
            print(
                f"PubMed returned non-XML response: "
                f"{stripped[:150]}"
            )
            return abstracts

        try:
            root = ET.fromstring(xml_text)
            for article in root.findall(".//PubmedArticle"):
                pmid_el = article.find(".//PMID")
                pmid    = (
                    pmid_el.text
                    if pmid_el is not None
                    else "unknown"
                )

                # Extract all AbstractText sections
                # Some papers have multiple labelled sections
                abstract_parts = article.findall(
                    ".//AbstractText"
                )
                if abstract_parts:
                    full_text = " ".join([
                        "".join(part.itertext())
                        for part in abstract_parts
                    ])
                    abstracts.append({
                        'pmid': pmid,
                        'text': full_text[:1200],
                        'url':  (
                            f"https://pubmed.ncbi.nlm.nih.gov"
                            f"/{pmid}/"
                        ),
                    })

        except ET.ParseError as e:
            print(f"XML Parse Error: {e}")

        return abstracts
