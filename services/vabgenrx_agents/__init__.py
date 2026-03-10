from .orchestrator import VabGenRxOrchestrator

# Backward compatibility — any file importing VabGenRxAgentService
# or VabGenRxOrchestrator from the old path will still work
VabGenRxAgentService = VabGenRxOrchestrator

__all__ = ["VabGenRxOrchestrator", "VabGenRxAgentService"]