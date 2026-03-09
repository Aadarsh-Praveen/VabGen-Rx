"""
PubMed Research Service
Access to 35M+ medical research papers
U.S. National Library of Medicine

CHANGES:
- Retry logic added to _search_and_fetch — on rate limit error
  (HTTP 429 or non-XML JSON error response from NCBI) waits 2s
  and retries once. This is the correct fix for rate limit errors
  rather than holding the semaphore longer (which caused timeouts
  and zero-evidence returns).
- Semaphore import removed — semaphore is managed by callers
  (safety_evidence.py, disease_evidence.py). This service does
  not acquire it directly.
- Sleep between esearch and efetch kept at 0.15s with API key.
- Azure Application Insights logging added:
    Alert 7: PubMed API failures and rate limits
             Custom events: pubmed_api_failure, pubmed_rate_limit
             Logged on 429 rate limits after retry exhausted,
             non-JSON responses, efetch 429 after retry,
             and unexpected exceptions in _search_and_fetch.
"""

import os
import time
import logging
import requests
import xml.etree.ElementTree as ET
from typing import Dict, List
from dotenv import load_dotenv

load_dotenv()

# Shared logger — Application Insights handler attached in app.py
logger = logging.getLogger("vabgenrx")


class PubMedService:
    """
    Interface to PubMed medical research database.
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
        self, drug1: str, drug2: str, max_results: int = 5
    ) -> Dict:
        query = (
            f'("{drug1}"[Title/Abstract] AND '
            f'"{drug2}"[Title/Abstract] AND '
            f'"drug interaction"[MeSH Terms])'
        )
        return self._search_and_fetch(query, max_results)

    def search_disease_contraindication(
        self, drug: str, disease: str, max_results: int = 5
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
        self, drug: str, max_results: int = 10
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
        self, query: str, max_results: int, _retry: bool = True
    ) -> Dict:
        """
        Execute esearch then efetch.
        On rate limit error — wait 2s and retry once.
        Semaphore is held by the caller, not here.
        """
        empty = {
            'count': 0, 'pmids': [],
            'abstracts': [], 'evidence_quality': 'none',
        }

        try:
            # ── Step 1: esearch ───────────────────────────────────
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

            # ── Rate limit check — retry once ─────────────────────
            if response.status_code == 429:
                if _retry:
                    print("PubMed rate limit hit (429) — "
                          "waiting 2s and retrying...")
                    time.sleep(2)
                    return self._search_and_fetch(
                        query, max_results, _retry=False
                    )
                # ── Alert 7: esearch 429 after retry exhausted ────
                logger.error(
                    "pubmed_rate_limit",
                    extra={"custom_dimensions": {
                        "event":  "pubmed_rate_limit",
                        "stage":  "esearch",
                        "query":  query[:100],
                        "status": 429,
                    }}
                )
                print("PubMed rate limit hit — retry exhausted")
                return empty

            try:
                data = response.json()
            except Exception:
                raw = response.text[:200]
                # NCBI returns JSON error on rate limit
                if "rate limit" in raw.lower() and _retry:
                    print(f"PubMed rate limit (JSON error) — "
                          f"waiting 2s and retrying...")
                    time.sleep(2)
                    return self._search_and_fetch(
                        query, max_results, _retry=False
                    )
                # ── Alert 7: non-JSON / rate limit after retry ────
                logger.error(
                    "pubmed_api_failure",
                    extra={"custom_dimensions": {
                        "event":  "pubmed_api_failure",
                        "stage":  "esearch_json_parse",
                        "query":  query[:100],
                        "raw":    raw[:100],
                    }}
                )
                print(f"PubMed non-JSON response: {raw}")
                return empty

            pmids = data.get(
                'esearchresult', {}
            ).get('idlist', [])
            count = int(
                data.get('esearchresult', {}).get('count', 0)
            )

            if not pmids:
                return {**empty, 'count': count}

            # ── Sleep between esearch and efetch ──────────────────
            sleep_time = 0.15 if self.api_key else 0.4
            time.sleep(sleep_time)

            # ── Step 2: efetch ────────────────────────────────────
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

            # ── Rate limit on efetch — retry whole call ───────────
            if fetch_response.status_code == 429:
                if _retry:
                    print("PubMed efetch rate limit — "
                          "waiting 2s and retrying...")
                    time.sleep(2)
                    return self._search_and_fetch(
                        query, max_results, _retry=False
                    )
                # ── Alert 7: efetch 429 after retry exhausted ─────
                logger.error(
                    "pubmed_rate_limit",
                    extra={"custom_dimensions": {
                        "event":  "pubmed_rate_limit",
                        "stage":  "efetch",
                        "query":  query[:100],
                        "status": 429,
                    }}
                )
                return {**empty, 'count': count}

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
            # ── Alert 7: unexpected exception ─────────────────────
            logger.error(
                "pubmed_api_failure",
                extra={"custom_dimensions": {
                    "event": "pubmed_api_failure",
                    "stage": "unknown",
                    "query": query[:100],
                    "error": str(e)[:200],
                }}
            )
            print(f"PubMed Error: {e}")
            return empty

    # ── XML Parser ────────────────────────────────────────────────

    def _parse_abstracts(self, xml_text: str) -> List[Dict]:
        abstracts = []

        if not xml_text or not xml_text.strip():
            return abstracts

        stripped = xml_text.strip()
        if not stripped.startswith('<'):
            # Check for rate limit in JSON error body
            if "rate limit" in stripped.lower():
                print(f"PubMed rate limit in efetch response")
            else:
                print(f"PubMed non-XML response: {stripped[:150]}")
            return abstracts

        try:
            root = ET.fromstring(xml_text)
            for article in root.findall(".//PubmedArticle"):
                pmid_el = article.find(".//PMID")
                pmid    = (
                    pmid_el.text
                    if pmid_el is not None else "unknown"
                )
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