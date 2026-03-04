"""
VabGenRx — A2A Models
Task state definitions for the A2A protocol.

EXTRACTED from a2a_service.py — zero logic changes.
"""


class TaskState:
    SUBMITTED = "submitted"
    WORKING   = "working"
    COMPLETED = "completed"
    FAILED    = "failed"