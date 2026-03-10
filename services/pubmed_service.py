"""
PubMed Research Service for VabGenRx.

This module provides an interface to the PubMed database
maintained by the U.S. National Library of Medicine. It
retrieves scientific literature relevant to drug interactions,
drug–disease contraindications, and pharmacological food
interactions.

Key Features
------------
• Query PubMed using the NCBI E-utilities API
• Automatic API key rotation across multiple NCBI keys
• Retry logic for rate-limit errors (HTTP 429)
• Extraction of PMIDs and abstracts for evidence analysis
• Application Insights logging for monitoring API failures

Rate Limiting
-------------
With API keys enabled, PubMed allows up to 10 requests/second
per key. The service supports up to four keys, allowing
approximately 40 requests/second before fallback delays.

Typical Usage
-------------
This service is called by the evidence layer to collect
research evidence before clinical reasoning by the AI agent.
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
    With NCBI API key: 10 requests/second per key.
    Rotates across up to 4 keys on 429 — effectively
    40 requests/second total before any sleep needed.
    """

    def __init__(self):
        self.base_url = (
            "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
        )
        self.email = "aadarsh050999@gmail.com"

        # ── Load all available API keys ───────────────────────────
        # Keys are tried in order on 429. If a key is missing from
        # env it is simply omitted — works with 1, 2, 3, or 4 keys.
        self._api_keys: List[str] = []
        for env_name in [
            "NCBI_API_KEY",
            "NCBI_API_KEY_2",
            "NCBI_API_KEY_3",
            "NCBI_API_KEY_4",
        ]:
            key = os.getenv(env_name, "").strip()
            if key:
                self._api_keys.append(key)

        # Index of the key that last succeeded — start from 0
        self._key_index = 0

        if self._api_keys:
            print(f"   ✅ PubMed: {len(self._api_keys)} NCBI API "
                  f"key(s) loaded "
                  f"({len(self._api_keys) * 10} req/s combined)")
        else:
            print(f"   ⚠️  PubMed: No NCBI API key "
                  f"(3 req/s limit)")

    # ── Key helpers ───────────────────────────────────────────────

    @property
    def _current_key(self) -> str:
        """Return the currently active API key (or empty string)."""
        if not self._api_keys:
            return ""
        return self._api_keys[self._key_index % len(self._api_keys)]

    def _rotate_key(self) -> bool:
        """
        Advance to the next key.
        Returns True if a new (different) key is now active,
        False if we've cycled through all keys.
        """
        if len(self._api_keys) <= 1:
            return False
        next_index = (self._key_index + 1) % len(self._api_keys)
        if next_index == self._key_index % len(self._api_keys):
            return False
        self._key_index = next_index
        return True

    def _add_key_to_params(self, params: dict) -> dict:
        """Add current API key to params dict if available."""
        key = self._current_key
        if key:
            params["api_key"] = key
        return params

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
        self,
        query:       str,
        max_results: int,
        _keys_tried: int = 0
    ) -> Dict:
        """
        Execute esearch then efetch with automatic key rotation.

        On 429:
        - If another key is available → rotate immediately, no sleep
        - If all keys exhausted → sleep 2s, restart from key 0

        _keys_tried tracks how many keys have been attempted this
        call so we know when we've cycled through all of them.
        """
        empty = {
            'count': 0, 'pmids': [],
            'abstracts': [], 'evidence_quality': 'none',
        }

        # If we've tried every key and still getting 429 — give up
        max_attempts = max(len(self._api_keys), 1) * 2
        if _keys_tried >= max_attempts:
            logger.error(
                "pubmed_rate_limit",
                extra={"custom_dimensions": {
                    "event":      "pubmed_rate_limit",
                    "stage":      "all_keys_exhausted",
                    "query":      query[:100],
                    "keys_tried": _keys_tried,
                }}
            )
            print("PubMed rate limit hit — all keys exhausted")
            return empty

        try:
            # ── Step 1: esearch ───────────────────────────────────
            search_params = self._add_key_to_params({
                'db':      'pubmed',
                'term':    query,
                'retmax':  max_results,
                'retmode': 'json',
                'sort':    'relevance',
                'email':   self.email,
            })

            response = requests.get(
                f"{self.base_url}esearch.fcgi",
                params  = search_params,
                timeout = 10
            )

            # ── 429 on esearch — rotate key and retry ─────────────
            if response.status_code == 429:
                rotated = self._rotate_key()
                if rotated:
                    print(f"PubMed rate limit hit (429) — "
                          f"rotating to key "
                          f"{(self._key_index % len(self._api_keys)) + 1}"
                          f"/{len(self._api_keys)} and retrying...")
                else:
                    print("PubMed rate limit hit (429) — "
                          "waiting 2s and retrying...")
                    time.sleep(2)
                return self._search_and_fetch(
                    query, max_results, _keys_tried + 1
                )

            try:
                data = response.json()
            except Exception:
                raw = response.text[:200]
                if "rate limit" in raw.lower():
                    rotated = self._rotate_key()
                    if rotated:
                        print(f"PubMed rate limit (JSON error) — "
                              f"rotating key and retrying...")
                    else:
                        print(f"PubMed rate limit (JSON error) — "
                              f"waiting 2s and retrying...")
                        time.sleep(2)
                    return self._search_and_fetch(
                        query, max_results, _keys_tried + 1
                    )
                logger.error(
                    "pubmed_api_failure",
                    extra={"custom_dimensions": {
                        "event": "pubmed_api_failure",
                        "stage": "esearch_json_parse",
                        "query": query[:100],
                        "raw":   raw[:100],
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
            sleep_time = 0.15 if self._api_keys else 0.4
            time.sleep(sleep_time)

            # ── Step 2: efetch ────────────────────────────────────
            fetch_params = self._add_key_to_params({
                'db':      'pubmed',
                'id':      ','.join(pmids),
                'retmode': 'xml',
                'email':   self.email,
            })

            fetch_response = requests.get(
                f"{self.base_url}efetch.fcgi",
                params  = fetch_params,
                timeout = 15
            )

            # ── 429 on efetch — rotate key and retry whole call ───
            if fetch_response.status_code == 429:
                rotated = self._rotate_key()
                if rotated:
                    print(f"PubMed efetch rate limit — "
                          f"rotating to key "
                          f"{(self._key_index % len(self._api_keys)) + 1}"
                          f"/{len(self._api_keys)} and retrying...")
                else:
                    print("PubMed efetch rate limit — "
                          "waiting 2s and retrying...")
                    time.sleep(2)
                return self._search_and_fetch(
                    query, max_results, _keys_tried + 1
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