"""
Shared PubMed Rate-Limit Semaphore for VabGenRx.

This module defines a global semaphore used to control
concurrent requests to the PubMed API across all services.

Why This Exists
---------------
Multiple services in VabGenRx (e.g., safety analysis and
disease analysis) may query PubMed simultaneously.
Without coordination, these parallel requests could exceed
NCBI rate limits and cause API failures.

The shared semaphore ensures that the total number of
simultaneous PubMed requests stays below the permitted
limit for API key usage.

Usage
-----
Import PUBMED_SEMAPHORE wherever PubMed queries occur
and acquire it before making external API calls.
"""

import threading

# Global cap — 20 concurrent PubMed requests across ALL services
# Safely under the 10/s NCBI API key limit
PUBMED_SEMAPHORE = threading.Semaphore(20)