"""
VabGenRx — Shared PubMed Rate Limit Semaphore

Single semaphore instance shared across ALL services that
call PubMed. Imported by safety_evidence.py and
disease_evidence.py so the 10 req/s NCBI limit is respected
even when both services run in parallel during Phase 1.

NCBI limit: 10 requests/second with API key.
We set cap to 6 to leave headroom for retries and slight
timing variations across threads.

Why a separate module:
  If each file defines its own threading.Semaphore(7),
  two parallel services can together fire 14 concurrent
  requests — still exceeding the limit.
  A single shared instance across all callers enforces
  the true global cap.
"""

import threading

# Global cap — 6 concurrent PubMed requests across ALL services
# Safely under the 10/s NCBI API key limit
PUBMED_SEMAPHORE = threading.Semaphore(20)