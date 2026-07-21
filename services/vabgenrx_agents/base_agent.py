"""
VabGenRx Base Agent

Shared infrastructure layer for all VabGenRx specialist agents.

Purpose
-------
Provides a standardized wrapper around the OpenAI chat completions
API to ensure consistent execution, reliability, and deterministic
behavior across all agents.

Responsibilities
----------------
• Stateless chat-completion execution per agent call
• JSON response parsing
• Deterministic model execution configuration

Deterministic Execution
-----------------------
The base agent enforces deterministic model behavior using:

temperature = 0
top_p       = 1

This ensures identical inputs always produce identical outputs,
which is critical for clinical decision support systems.

Architecture Role
-----------------
All specialist agents inherit from this class:

• SafetyAgent
• DiseaseAgent
• DosingAgent
• CounsellingAgent
• OrchestratorAgent

This design centralizes the LLM call so fixes and reliability
improvements apply system-wide.
"""

import json
import logging
from typing import Dict

# Shared logger — attached to whatever observability sink is wired up in app.py
logger = logging.getLogger("vabgenrx")


class _BaseAgent:

    def __init__(
        self,
        client,
        model:    str,
        endpoint: str = None,
    ):
        self.client   = client
        self.model    = model
        self.endpoint = endpoint  # unused — kept so specialist agent constructors don't need to change

    def _run(
        self,
        name:         str,
        instructions: str,
        content:      str,
    ) -> Dict:
        """
        Single stateless chat-completion call. Each agent invocation
        is one request/response — no multi-turn state is read back
        across calls anywhere in this pipeline, so there's no need
        for the create-agent/thread/run lifecycle a stateful Assistants
        API would require.
        """
        try:
            print(f"   📏 {name} instructions={len(instructions)} chars  content={len(content)} chars")
            response = self.client.chat.completions.create(
                model       = self.model,
                messages    = [
                    {"role": "system", "content": instructions},
                    {"role": "user",   "content": content},
                ],
                # ── Determinism fix ───────────────────────────────────
                # temperature=0 makes the model deterministic.
                # Same input always produces same clinical output.
                # Critical for a healthcare system — severity scores,
                # contraindication flags, and recommendations must not
                # vary between runs for the same patient data.
                temperature = 0,
                top_p       = 1,
            )
        except Exception as e:
            logger.error(
                "llm_call_failed",
                extra={"custom_dimensions": {
                    "event": "llm_call_failed",
                    "agent": name,
                    "error": str(e)[:300],
                }}
            )
            print(f"   ❌ {name} LLM call failed: {e}")
            return {}

        raw = response.choices[0].message.content or ""
        print(f"   ✅ {name} response received ({len(raw)} chars)")

        start = raw.find('{')
        if start < 0:
            print(f"   ⚠️  {name} no JSON found in response")
            return {}
        try:
            decoder   = json.JSONDecoder()
            obj, _end = decoder.raw_decode(raw, start)
            return obj
        except Exception as e:
            print(f"   ⚠️  {name} JSON parse error: {e}")
            return {}
