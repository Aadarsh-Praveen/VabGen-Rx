"""
VabGenRx A2A Data Models

Defines core data structures used by the Agent-to-Agent (A2A)
protocol implementation.

Currently includes task state definitions used by the task
lifecycle management system.

Task States
-----------
submitted  – task received but not yet processed
working    – task currently being executed by an agent
completed  – task finished successfully
failed     – task execution failed

These states standardize communication between agents and
external clients interacting with the VabGenRx system.
"""


class TaskState:
    SUBMITTED = "submitted"
    WORKING   = "working"
    COMPLETED = "completed"
    FAILED    = "failed"