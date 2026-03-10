"""
VabGenRx — Clinical Content Safety Service

Scans OrchestratorAgent clinical summaries and priority actions
through Azure AI Content Safety before they reach the prescriber.

This is the final safety gate before AI-generated clinical text
reaches a doctor. Protects against hallucinated harmful content
in the clinical summary or priority action recommendations.

Checks four categories:
    Hate       — discriminatory clinical guidance
    Violence   — descriptions of physical harm
    Sexual     — inappropriate content
    SelfHarm   — content encouraging self-harm

Threshold:
    SAFE_THRESHOLD = 4 (medium severity)
    0–2 = safe    → pass through to prescriber
    4+  = blocked → fallback summary used instead

Failure mode:
    If Content Safety is misconfigured or unavailable,
    all text passes through — the pipeline never blocks
    due to this service being down.
"""

import os
import logging
from typing import Dict, Tuple

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("vabgenrx")

SAFE_THRESHOLD = 4


class ClinicalContentSafety:
    """
    Azure AI Content Safety wrapper for clinical text scanning.

    Designed as a non-blocking safety gate — if the service is
    unavailable the system degrades gracefully and passes all text.
    """

    def __init__(self):
        self.enabled = False
        self.client  = None
        self._init()

    def _init(self):
        """
        Initialise the Content Safety client.
        Fails silently if endpoint is not configured.
        """
        endpoint = os.getenv("AZURE_CONTENT_SAFETY_ENDPOINT", "")
        if not endpoint:
            print("   ⚠️  Content Safety: endpoint not configured "
                  "— running without safety scan")
            return

        try:
            from azure.ai.contentsafety import ContentSafetyClient
            from azure.identity          import DefaultAzureCredential

            self.client  = ContentSafetyClient(
                endpoint   = endpoint,
                credential = DefaultAzureCredential()
            )
            self.enabled = True
            print("   ✅ Azure AI Content Safety connected")
        except Exception as e:
            print(f"   ⚠️  Content Safety init failed: {e} "
                  "— running without safety scan")

    def scan_clinical_summary(
        self,
        text:       str,
        session_id: str = ""
    ) -> Tuple[bool, Dict]:
        """
        Scan clinical summary text for harmful content.

        Args:
            text:       Clinical summary from OrchestratorAgent.
            session_id: Request session ID for trace correlation.
                        Uses hashed/UUID session — never raw PHI.

        Returns:
            (is_safe, details)
            is_safe = True  → text passes, send to frontend
            is_safe = False → text blocked, use fallback summary
        """
        if not self.enabled or not self.client:
            return True, {"reason": "content_safety_disabled"}

        if not text or not text.strip():
            return True, {"reason": "empty_text"}

        try:
            from azure.ai.contentsafety.models import AnalyzeTextOptions

            # Content Safety API limit is 1000 chars
            scan_text = text[:1000]

            result  = self.client.analyze_text(
                AnalyzeTextOptions(text=scan_text)
            )

            details = {}
            is_safe = True

            for item in result.categories_analysis:
                category = str(item.category)
                severity = item.severity or 0
                details[category] = severity

                if severity >= SAFE_THRESHOLD:
                    is_safe = False
                    logger.error(
                        "content_safety_block",
                        extra={"custom_dimensions": {
                            "event":      "content_safety_block",
                            "category":   category,
                            "severity":   severity,
                            "session_id": session_id,
                            "text":       scan_text[:100],
                        }}
                    )

            status = "passed" if is_safe else "BLOCKED"
            print(f"   {'✅' if is_safe else '🚫'} Content Safety: "
                  f"clinical summary {status} — {details}")

            return is_safe, details

        except Exception as e:
            logger.error(
                "content_safety_error",
                extra={"custom_dimensions": {
                    "event":      "content_safety_error",
                    "session_id": session_id,
                    "error":      str(e)[:200],
                }}
            )
            print(f"   ⚠️  Content Safety scan error: {e} "
                  "— passing text through")
            return True, {"reason": f"scan_error: {e}"}

    def scan_priority_actions(
        self,
        actions:    list,
        session_id: str = ""
    ) -> Tuple[bool, Dict]:
        """
        Scan all priority action text from OrchestratorAgent.
        Concatenates action and reason fields and scans together.
        """
        if not actions:
            return True, {}

        combined = " ".join([
            f"{a.get('action', '')} {a.get('reason', '')}"
            for a in actions
        ])

        return self.scan_clinical_summary(combined, session_id)