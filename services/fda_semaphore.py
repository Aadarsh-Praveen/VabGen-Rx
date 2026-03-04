"""
VabGenRx — Shared FDA Rate Limit Semaphore

Limits concurrent requests to api.fda.gov across ALL services.
Safety and Disease evidence services both fetch FDA labels in
parallel — without a shared cap, 6+ simultaneous requests to
api.fda.gov cause read timeouts.

Cap of 3 keeps FDA requests well within their rate limits while
still allowing parallel fetches to benefit from concurrency.
"""

import threading

# Max 3 concurrent FDA API requests across all services
FDA_SEMAPHORE = threading.Semaphore(3)