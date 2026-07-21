"""
VabGenRx — Clinical Content Safety Service

Scans OrchestratorAgent clinical summaries and priority actions
through OpenAI's moderation endpoint before they reach the prescriber.

This is the final safety gate before AI-generated clinical text
reaches a doctor. Protects against hallucinated harmful content
in the clinical summary or priority action recommendations.

OpenAI's moderation endpoint returns a `flagged` boolean plus a
per-category score (0.0-1.0) — there's no direct equivalent of Azure
Content Safety's 0-7 severity scale, so a category is treated as
unsafe once OpenAI itself flags it (`flagged=True` overall, or any
individual category score crosses SAFE_THRESHOLD).

Failure mode:
    If the moderation call is misconfigured or unavailable,
    all text passes through — the pipeline never blocks
    due to this service being down.
"""

import os
import logging
from typing import Dict, Tuple

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("vabgenrx")

# Per-category score threshold (0.0-1.0) — used as a secondary signal
# alongside OpenAI's own `flagged` verdict.
SAFE_THRESHOLD = 0.5


class ClinicalContentSafety:
    """
    OpenAI moderation-endpoint wrapper for clinical text scanning.

    Designed as a non-blocking safety gate — if the service is
    unavailable the system degrades gracefully and passes all text.
    """

    def __init__(self):
        self.enabled = False
        self.client  = None
        self._init()

    def _init(self):
        """
        Initialise the moderation client.
        Fails silently if no API key is configured.
        """
        if not os.getenv("OPENAI_API_KEY"):
            print("   ⚠️  Content Safety: OPENAI_API_KEY not configured "
                  "— running without safety scan")
            return

        try:
            from services.openai_client import get_openai_client
            self.client  = get_openai_client()
            self.enabled = True
            print("   ✅ OpenAI moderation content safety connected")
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
            # Moderation endpoint accepts much longer input than Azure
            # Content Safety's 1000-char limit, but keep a bound anyway.
            scan_text = text[:4000]

            response = self.client.moderations.create(input=scan_text)
            result   = response.results[0]

            details = dict(result.category_scores.model_dump())
            is_safe = not result.flagged and all(
                score < SAFE_THRESHOLD for score in details.values()
            )

            if not is_safe:
                flagged_categories = {
                    k: v for k, v in result.categories.model_dump().items() if v
                }
                logger.error(
                    "content_safety_block",
                    extra={"custom_dimensions": {
                        "event":      "content_safety_block",
                        "categories": str(flagged_categories),
                        "session_id": session_id,
                        "text":       scan_text[:100],
                    }}
                )

            status = "passed" if is_safe else "BLOCKED"
            print(f"   {'✅' if is_safe else '🚫'} Content Safety: "
                  f"clinical summary {status}")

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
