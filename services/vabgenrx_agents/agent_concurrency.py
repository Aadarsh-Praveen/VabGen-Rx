"""
VabGenRx — Shared Agent Concurrency Control

Azure Agent Service enforces a concurrent active run limit per
project. Firing more than ~3 agents simultaneously causes
RunStatus.FAILED for the excess runs — they don't queue, they fail.

This module owns the single shared semaphore that both
VabGenRxSafetyAgent and VabGenRxDiseaseAgent import.
Keeping it here (not in either agent) avoids circular imports
and guarantees both agents reference the exact same object.

Usage in any agent:
    from .agent_concurrency import AGENT_SEMAPHORE
    with AGENT_SEMAPHORE:
        return self._run(...)

Value of 3: safe limit observed in Azure hackathon project quota.
Raise to 4 or 5 if your Azure project quota is increased.
"""

import threading

AGENT_SEMAPHORE = threading.Semaphore(3)