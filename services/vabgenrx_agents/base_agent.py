"""
VabGenRx Base Agent

Shared infrastructure layer for all VabGenRx specialist agents.

Purpose
-------
Provides a standardized wrapper around the Azure Agent
Framework to ensure consistent execution, reliability,
and deterministic behavior across all agents.

Responsibilities
----------------
• Azure Agent creation and lifecycle management
• Thread creation and run execution
• JSON response parsing
• Toolset configuration for agent tool calls
• Concurrency control for Azure agent quotas
• Deterministic model execution configuration

Deterministic Execution
-----------------------
The base agent enforces deterministic model behavior using:

temperature = 0
top_p       = 1

This ensures identical inputs always produce identical outputs,
which is critical for clinical decision support systems.

Concurrency Control
-------------------
A global semaphore limits concurrent Azure agent runs to prevent
quota-related failures in Azure Agent Service.

Architecture Role
-----------------
All specialist agents inherit from this class:

• SafetyAgent
• DiseaseAgent
• DosingAgent
• CounsellingAgent
• OrchestratorAgent

This design centralizes Azure integration logic so fixes and
reliability improvements apply system-wide.
"""

import json
import os
import logging
import threading
import time
from typing import Dict

from azure.ai.agents        import AgentsClient
from azure.ai.agents.models import FunctionTool, ToolSet, RunStatus
from azure.core.rest        import HttpRequest

# Shared logger — Application Insights handler attached in app.py
logger = logging.getLogger("vabgenrx")

# ── Concurrency limit ─────────────────────────────────────────────────────────
# Azure Agent Service enforces a concurrent active run limit per project.
# We attach a semaphore to the AgentsClient instance at first use so all agents sharing the same client share exactly one semaphore object regardless of module reload or import order.
_AZURE_CONCURRENCY_LIMIT = 1


class _BaseAgent:

    def __init__(
        self,
        client:   AgentsClient,
        model:    str,
        endpoint: str
    ):
        self.client   = client
        self.model    = model
        self.endpoint = endpoint

    def _build_toolset(self, functions: set = None) -> ToolSet:
        toolset = ToolSet()
        if functions:
            toolset.add(FunctionTool(functions=functions))
        return toolset

    def _toolset_has_functions(self, toolset: ToolSet) -> bool:
        if toolset is None:
            return False
        tools_list = getattr(toolset, '_tools', None)
        if tools_list is not None:
            return any(
                isinstance(t, FunctionTool)
                for t in tools_list
            )
        try:
            toolset.get_tool(FunctionTool)
            return True
        except (ValueError, AttributeError):
            return False

    def _run(
        self,
        name:         str,
        instructions: str,
        content:      str,
        toolset:      ToolSet = None
    ) -> Dict:
        if toolset is None:
            toolset = ToolSet()

        # ── Concurrency throttle ──────────────────────────────────────────────
        # Attach semaphore to the client instance on first use.
        # All agents share the same client object → one semaphore guaranteed.
        # This survives module reloads because the client object itself
        # is created once in orchestrator.py and passed into every agent.
        if not hasattr(self.client, '_vabgenrx_semaphore'):
            self.client._vabgenrx_semaphore = threading.Semaphore(
                _AZURE_CONCURRENCY_LIMIT
            )
        sem = self.client._vabgenrx_semaphore
        print(f"   🔒 {name} waiting for slot "
              f"(semaphore id={id(sem)})")
        with sem:

            # ── Create agent — catch timeout immediately ───────────────────────
            try:
                print(f"   📏 {name} instructions={len(instructions)} chars  content={len(content)} chars")
                agent = self.client.create_agent(
                    model        = self.model,
                    name         = name,
                    instructions = instructions,
                    toolset      = toolset,
                    # ── Determinism fix ───────────────────────────────────
                    # temperature=0 makes GPT-4o deterministic.
                    # Same input always produces same clinical output.
                    # Critical for a healthcare system — severity scores,
                    # contraindication flags, and recommendations must not
                    # vary between runs for the same patient data.
                    temperature  = 0,
                    top_p        = 1,
                )
            except Exception as e:
                error_str = str(e)
                # ── Alert 4: agent creation timeout ──────────────────────
                if "timed out" in error_str.lower():
                    logger.error(
                        "azure_agent_timeout",
                        extra={
                            "custom_dimensions": {
                                "event": "azure_agent_timeout",
                                "agent": name,
                                "stage": "create_agent",
                                "error": error_str[:300],
                            }
                        }
                    )
                    print(
                        f"   ❌ {name} create_agent timeout — "
                        f"logged to Application Insights"
                    )
                raise

            try:
                has_functions = self._toolset_has_functions(toolset)

                if has_functions:
                    ctx = self.client.enable_auto_function_calls(toolset)
                    if ctx is not None:
                        with ctx:
                            run = self.client.create_thread_and_process_run(
                                agent_id = agent.id,
                                thread   = {
                                    "messages": [
                                        {
                                            "role":    "user",
                                            "content": content
                                        }
                                    ]
                                }
                            )
                    else:
                        run = self.client.create_thread_and_process_run(
                            agent_id = agent.id,
                            thread   = {
                                "messages": [
                                    {
                                        "role":    "user",
                                        "content": content
                                    }
                                ]
                            },
                            toolset  = toolset
                        )
                else:
                    print(f"   ℹ️  {name} running as synthesis-only "
                          f"(no tool calls)")
                    try:
                        run = self.client.create_thread_and_process_run(
                            agent_id = agent.id,
                            thread   = {
                                "messages": [
                                    {
                                        "role":    "user",
                                        "content": content
                                    }
                                ]
                            }
                        )
                    except Exception as e:
                        error_str = str(e)
                        # ── Alert 4: run creation timeout ─────────────────
                        if "timed out" in error_str.lower():
                            logger.error(
                                "azure_agent_timeout",
                                extra={
                                    "custom_dimensions": {
                                        "event": "azure_agent_timeout",
                                        "agent": name,
                                        "stage": "create_thread_and_process_run",
                                        "error": error_str[:300],
                                    }
                                }
                            )
                            print(
                                f"   ❌ {name} run timeout — "
                                f"logged to Application Insights"
                            )
                        raise

                print(f"   ✅ {name} status: {run.status}")

                if run.status == RunStatus.COMPLETED:
                    messages_data = self._get_messages(run.thread_id)
                    for msg in messages_data:
                        if msg.get("role") == "assistant":
                            for block in msg.get("content", []):
                                if block.get("type") == "text":
                                    raw = block["text"]["value"]
                                    try:
                                        start = raw.find('{')
                                        if start < 0:
                                            print(
                                                f"   ⚠️  {name} no JSON "
                                                f"found in response"
                                            )
                                            return {}
                                        decoder   = json.JSONDecoder()
                                        obj, _end = decoder.raw_decode(
                                            raw, start
                                        )
                                        return obj
                                    except Exception as e:
                                        print(
                                            f"   ⚠️  {name} JSON parse "
                                            f"error: {e}"
                                        )
                                        return {}
                else:
                    print(f"   ❌ {name} run failed: {run.status}")
                    # ── Alert 4: agent run failed (not timeout) ───────────
                    logger.error(
                        "azure_agent_failed",
                        extra={
                            "custom_dimensions": {
                                "event":  "azure_agent_failed",
                                "agent":  name,
                                "status": str(run.status),
                            }
                        }
                    )
                    return {}

            finally:
                self.client.delete_agent(agent.id)

        return {}

    def _get_messages(self, thread_id: str) -> list:
        url = (
            f"{self.endpoint}/threads/{thread_id}"
            f"/messages?api-version=2025-05-01"
        )
        try:
            req      = HttpRequest(method="GET", url=url)
            response = self.client.send_request(req)
            data     = response.json()
            if "data" in data:
                return data["data"]
            return []
        except Exception as e:
            print(f"   ⚠️  Failed to fetch messages: {e}")
            return []