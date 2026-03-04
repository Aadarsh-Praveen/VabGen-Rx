"""
VabGenRx — A2A Task Store
In-memory task store for A2A protocol task lifecycle management.

EXTRACTED from a2a_service.py — zero logic changes.
Replace with Redis for production multi-instance deployment.
"""

from datetime import datetime, timezone
from typing   import Dict, Optional

from .models import TaskState


# ── In-memory task store ──────────────────────────────────────────────────────
# Replace with Redis for production
_tasks: Dict[str, Dict] = {}


def create_task(task_id: str, skill: str, data: Dict) -> Dict:
    """
    Create a new task record in submitted state.
    """
    task = {
        "id":         task_id,
        "skill":      skill,
        "status":     {"state": TaskState.SUBMITTED},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "input":      data,
        "artifacts":  []
    }
    _tasks[task_id] = task
    return task


def get_task(task_id: str) -> Optional[Dict]:
    """
    Retrieve a task by ID.
    Returns None if not found.
    """
    return _tasks.get(task_id)


def update_task(
    task_id: str,
    state:   str,
    result:  Dict = None,
    error:   str  = None
):
    """
    Update task state and optionally attach result or error.
    """
    if task_id not in _tasks:
        return

    _tasks[task_id]["status"]["state"] = state

    if result:
        _tasks[task_id]["artifacts"] = [
            {
                "name":  "result",
                "parts": [{"type": "data", "data": result}]
            }
        ]
        _tasks[task_id]["status"]["message"] = {
            "role":  "agent",
            "parts": [{"type": "data", "data": result}]
        }

    if error:
        _tasks[task_id]["status"]["error"] = error