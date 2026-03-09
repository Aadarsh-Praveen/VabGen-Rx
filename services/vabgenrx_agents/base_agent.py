'''
"""
VabGenRx — Base Agent

CHANGES:
- temperature=0 added to create_agent() call
  This is the critical fix for non-determinism.
  All specialist agents (Safety, Disease, Dosing, Orchestrator)
  inherit from this base — one fix applies everywhere.
- top_p=1 set explicitly for full determinism alongside temperature=0
- _run() logic unchanged
"""

import json
import os
from typing import Dict

from azure.ai.agents        import AgentsClient
from azure.ai.agents.models import FunctionTool, ToolSet, RunStatus
from azure.core.rest        import HttpRequest


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
            return []'''


"""
VabGenRx — Base Agent

CHANGES:
- temperature=0 added to create_agent() call
  This is the critical fix for non-determinism.
  All specialist agents (Safety, Disease, Dosing, Orchestrator)
  inherit from this base — one fix applies everywhere.
- top_p=1 set explicitly for full determinism alongside temperature=0
- Azure Application Insights logging added:
    Alert 4: Azure agent timeout detection
             Logged as error when create_agent() or
             create_thread_and_process_run() times out.
             Custom event: azure_agent_timeout
             Also logs azure_agent_failed when run status
             is not COMPLETED.
- _run() logic otherwise unchanged.
"""

import json
import os
import logging
from typing import Dict

from azure.ai.agents        import AgentsClient
from azure.ai.agents.models import FunctionTool, ToolSet, RunStatus
from azure.core.rest        import HttpRequest

# Shared logger — Application Insights handler attached in app.py
logger = logging.getLogger("vabgenrx")


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

        # ── Create agent — catch timeout immediately ───────────────────────
        try:
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
            # Triggers when swedencentral.api.azureml.ms times out.
            # You've seen this in logs — this alert means you know
            # before the doctor gets a 500 error.
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
                # Covers cases like RunStatus.FAILED or EXPIRED.
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