"""
Shared FDA API Semaphore for VabGenRx.

Controls the maximum number of concurrent requests to the
FDA OpenFDA API across all application services.

Purpose
-------
When multiple evidence services query FDA endpoints in
parallel, uncontrolled concurrency can lead to timeouts
or rate-limit errors. This shared semaphore ensures
that the application stays within safe request limits.

Concurrency Limit
-----------------
The semaphore allows a maximum of three concurrent
FDA API requests across the entire system.
"""

import threading

# Max 3 concurrent FDA API requests across all services
FDA_SEMAPHORE = threading.Semaphore(3)