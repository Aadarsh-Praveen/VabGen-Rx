"""
VabGenRx — Translation Service
Translates patient-facing counseling text into any preferred language.

Key principles:
- Optional — only runs when preferred_language is provided
  and not English
- Uses GPT-4o — no new Azure service needed
- Single batch call per drug/condition — efficient
- Drug names, doses, lab values NEVER translated
- Supports 100+ languages natively via GPT-4o
- Translates ONLY patient-readable text, not internal fields
"""

import os
import json
import copy
from typing import Dict, List, Optional
from openai import AzureOpenAI
from dotenv import load_dotenv

load_dotenv()

# Languages that don't need translation
ENGLISH_VARIANTS = {
    "english", "en", "eng", "english (us)", "english (uk)",
    "american english", "british english"
}


class TranslationService:

    def __init__(self):
        self.llm = AzureOpenAI(
            api_key        = os.getenv("AZURE_OPENAI_KEY"),
            api_version    = os.getenv("AZURE_OPENAI_API_VERSION"),
            azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        )
        self.deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT")

    # ── Public Methods ────────────────────────────────────────────────────────

    def needs_translation(
        self, language: Optional[str]
    ) -> bool:
        """
        Check if translation is needed.
        Returns False for English variants or None.
        """
        if not language:
            return False
        return language.strip().lower() not in ENGLISH_VARIANTS

    def translate_agent_result(
        self,
        result:          Dict,
        target_language: str
    ) -> Dict:
        """
        Translate all patient-facing counseling in an agent result.

        Translates:
        - drug_counseling
        - condition_counseling
        - risk_summary.clinical_summary (new — orchestrator output)
        - compounding_patterns explanations (new — orchestrator output)
        - priority_actions (new — orchestrator output)

        Leaves unchanged:
        - drug_drug, drug_disease, drug_food (clinical data)
        - dosing_recommendations (clinical data)
        - compounding_signals (internal structure)
        - all evidence counts and metadata
        """
        if not self.needs_translation(target_language):
            return result

        print(f"   🌐 Translating counseling to: {target_language}")

        # Deep copy — never mutate the original
        translated = copy.deepcopy(result)

        # Translate drug counseling
        drug_counseling = translated.get("drug_counseling", [])
        for i, item in enumerate(drug_counseling):
            print(
                f"   🌐 Translating drug counseling: "
                f"{item.get('drug', '')}"
            )
            translated["drug_counseling"][i] = (
                self._translate_drug_counseling(
                    item, target_language
                )
            )

        # Translate condition counseling
        condition_counseling = translated.get(
            "condition_counseling", []
        )
        for i, item in enumerate(condition_counseling):
            print(
                f"   🌐 Translating condition counseling: "
                f"{item.get('condition', '')}"
            )
            translated["condition_counseling"][i] = (
                self._translate_condition_counseling(
                    item, target_language
                )
            )

        # Translate orchestrator outputs in risk_summary
        # These are patient-facing narrative fields
        risk_summary = translated.get("risk_summary", {})
        if risk_summary:
            translated["risk_summary"] = (
                self._translate_risk_summary(
                    risk_summary, target_language
                )
            )

        # Add translation metadata
        translated["translation"] = {
            "translated":      True,
            "target_language": target_language,
            "source_language": "English",
            "sections_translated": [
                "drug_counseling",
                "condition_counseling",
                "risk_summary.clinical_summary",
                "risk_summary.priority_actions",
                "risk_summary.compounding_patterns",
            ]
        }

        print(f"   ✅ Translation complete: {target_language}")
        return translated

    def translate_drug_counseling(
        self,
        drug_result:     Dict,
        target_language: str
    ) -> Dict:
        """Translate a single drug counseling result."""
        if not self.needs_translation(target_language):
            return drug_result
        return self._translate_drug_counseling(
            copy.deepcopy(drug_result), target_language
        )

    def translate_condition_counseling(
        self,
        condition_result: Dict,
        target_language:  str
    ) -> Dict:
        """Translate a single condition counseling result."""
        if not self.needs_translation(target_language):
            return condition_result
        return self._translate_condition_counseling(
            copy.deepcopy(condition_result), target_language
        )

    # ── Internal Translation Methods ──────────────────────────────────────────

    def _translate_drug_counseling(
        self,
        item:            Dict,
        target_language: str
    ) -> Dict:
        """
        Translate patient-facing fields in a drug counseling result.

        Translates: counseling_points titles/details,
                    key_monitoring, patient_summary
        Keeps:      drug name, patient_context, severity,
                    category, from_cache, evidence fields
        """
        batch = {}

        if item.get("key_monitoring"):
            batch["key_monitoring"] = item["key_monitoring"]

        if item.get("patient_summary"):
            batch["patient_summary"] = item["patient_summary"]

        for i, point in enumerate(
            item.get("counseling_points", [])
        ):
            if point.get("title"):
                batch[f"point_{i}_title"] = point["title"]
            if point.get("detail"):
                batch[f"point_{i}_detail"] = point["detail"]

        if not batch:
            return item

        translated_batch = self._translate_batch(
            batch, target_language
        )

        if translated_batch.get("key_monitoring"):
            item["key_monitoring"] = (
                translated_batch["key_monitoring"]
            )

        if translated_batch.get("patient_summary"):
            item["patient_summary"] = (
                translated_batch["patient_summary"]
            )

        for i, point in enumerate(
            item.get("counseling_points", [])
        ):
            if translated_batch.get(f"point_{i}_title"):
                item["counseling_points"][i]["title"] = (
                    translated_batch[f"point_{i}_title"]
                )
            if translated_batch.get(f"point_{i}_detail"):
                item["counseling_points"][i]["detail"] = (
                    translated_batch[f"point_{i}_detail"]
                )

        item["_translated_to"] = target_language
        return item

    def _translate_condition_counseling(
        self,
        item:            Dict,
        target_language: str
    ) -> Dict:
        """
        Translate patient-facing fields in a condition counseling
        result.

        Translates: exercise/lifestyle/diet/safety titles+details,
                    monitoring, follow_up
        Keeps:      condition name, patient_context, urgency,
                    nutrients_to_increase/reduce, from_cache
        """
        batch = {}

        if item.get("monitoring"):
            batch["monitoring"] = item["monitoring"]

        if item.get("follow_up"):
            batch["follow_up"] = item["follow_up"]

        for i, ex in enumerate(item.get("exercise", [])):
            if ex.get("title"):
                batch[f"exercise_{i}_title"] = ex["title"]
            if ex.get("detail"):
                batch[f"exercise_{i}_detail"] = ex["detail"]
            if ex.get("frequency"):
                batch[f"exercise_{i}_frequency"] = ex["frequency"]

        for i, ls in enumerate(item.get("lifestyle", [])):
            if ls.get("title"):
                batch[f"lifestyle_{i}_title"] = ls["title"]
            if ls.get("detail"):
                batch[f"lifestyle_{i}_detail"] = ls["detail"]

        for i, dt in enumerate(item.get("diet", [])):
            if dt.get("title"):
                batch[f"diet_{i}_title"] = dt["title"]
            if dt.get("detail"):
                batch[f"diet_{i}_detail"] = dt["detail"]

        for i, sf in enumerate(item.get("safety", [])):
            if sf.get("title"):
                batch[f"safety_{i}_title"] = sf["title"]
            if sf.get("detail"):
                batch[f"safety_{i}_detail"] = sf["detail"]

        if not batch:
            return item

        translated_batch = self._translate_batch(
            batch, target_language
        )

        if translated_batch.get("monitoring"):
            item["monitoring"] = translated_batch["monitoring"]
        if translated_batch.get("follow_up"):
            item["follow_up"] = translated_batch["follow_up"]

        for i, ex in enumerate(item.get("exercise", [])):
            if translated_batch.get(f"exercise_{i}_title"):
                item["exercise"][i]["title"] = (
                    translated_batch[f"exercise_{i}_title"]
                )
            if translated_batch.get(f"exercise_{i}_detail"):
                item["exercise"][i]["detail"] = (
                    translated_batch[f"exercise_{i}_detail"]
                )
            if translated_batch.get(f"exercise_{i}_frequency"):
                item["exercise"][i]["frequency"] = (
                    translated_batch[f"exercise_{i}_frequency"]
                )

        for i, ls in enumerate(item.get("lifestyle", [])):
            if translated_batch.get(f"lifestyle_{i}_title"):
                item["lifestyle"][i]["title"] = (
                    translated_batch[f"lifestyle_{i}_title"]
                )
            if translated_batch.get(f"lifestyle_{i}_detail"):
                item["lifestyle"][i]["detail"] = (
                    translated_batch[f"lifestyle_{i}_detail"]
                )

        for i, dt in enumerate(item.get("diet", [])):
            if translated_batch.get(f"diet_{i}_title"):
                item["diet"][i]["title"] = (
                    translated_batch[f"diet_{i}_title"]
                )
            if translated_batch.get(f"diet_{i}_detail"):
                item["diet"][i]["detail"] = (
                    translated_batch[f"diet_{i}_detail"]
                )

        for i, sf in enumerate(item.get("safety", [])):
            if translated_batch.get(f"safety_{i}_title"):
                item["safety"][i]["title"] = (
                    translated_batch[f"safety_{i}_title"]
                )
            if translated_batch.get(f"safety_{i}_detail"):
                item["safety"][i]["detail"] = (
                    translated_batch[f"safety_{i}_detail"]
                )

        item["_translated_to"] = target_language
        return item

    def _translate_risk_summary(
        self,
        risk_summary:    Dict,
        target_language: str
    ) -> Dict:
        """
        Translate patient-facing narrative fields in risk_summary.
        These are new fields produced by OrchestratorAgent.

        Translates: clinical_summary, priority_actions action/reason,
                    compounding_patterns explanation
        Keeps:      level, counts, evidence_summary (clinical data)
        """
        batch = {}

        # Clinical summary — main narrative
        if risk_summary.get("clinical_summary"):
            batch["clinical_summary"] = (
                risk_summary["clinical_summary"]
            )

        # Priority actions — action and reason text
        for i, action in enumerate(
            risk_summary.get("priority_actions", [])
        ):
            if action.get("action"):
                batch[f"action_{i}_action"] = action["action"]
            if action.get("reason"):
                batch[f"action_{i}_reason"] = action["reason"]

        # Compounding patterns — explanation text
        for i, pattern in enumerate(
            risk_summary.get("compounding_patterns", [])
        ):
            if pattern.get("explanation"):
                batch[f"pattern_{i}_explanation"] = (
                    pattern["explanation"]
                )
            if pattern.get("pattern_name"):
                batch[f"pattern_{i}_name"] = (
                    pattern["pattern_name"]
                )

        if not batch:
            return risk_summary

        translated_batch = self._translate_batch(
            batch, target_language
        )

        # Apply translations back
        if translated_batch.get("clinical_summary"):
            risk_summary["clinical_summary"] = (
                translated_batch["clinical_summary"]
            )

        for i, action in enumerate(
            risk_summary.get("priority_actions", [])
        ):
            if translated_batch.get(f"action_{i}_action"):
                risk_summary["priority_actions"][i]["action"] = (
                    translated_batch[f"action_{i}_action"]
                )
            if translated_batch.get(f"action_{i}_reason"):
                risk_summary["priority_actions"][i]["reason"] = (
                    translated_batch[f"action_{i}_reason"]
                )

        for i, pattern in enumerate(
            risk_summary.get("compounding_patterns", [])
        ):
            if translated_batch.get(f"pattern_{i}_explanation"):
                risk_summary[
                    "compounding_patterns"
                ][i]["explanation"] = (
                    translated_batch[f"pattern_{i}_explanation"]
                )
            if translated_batch.get(f"pattern_{i}_name"):
                risk_summary[
                    "compounding_patterns"
                ][i]["pattern_name"] = (
                    translated_batch[f"pattern_{i}_name"]
                )

        risk_summary["_translated_to"] = target_language
        return risk_summary

    # ── Core LLM Translation ──────────────────────────────────────────────────

    def _translate_batch(
        self,
        batch:           Dict[str, str],
        target_language: str
    ) -> Dict[str, str]:
        """
        Send all text in one LLM call and get back translated JSON.
        One call per drug/condition/section — efficient.
        """
        try:
            prompt = f"""Translate the following patient counseling \
text from English to {target_language}.

CRITICAL RULES — follow exactly:
1. Drug names (warfarin, aspirin, metformin, tacrolimus, etc.)
   — keep EXACTLY as written, do NOT translate
2. Dose values (10mg, 200mg bid, 500mg tid, 0.25mg bd, etc.)
   — keep EXACTLY as written
3. Lab abbreviations (INR, eGFR, TSH, HbA1c, BMI, CKD, COPD,
   AKI, AF) — keep EXACTLY as written
4. Organ system names used as clinical terms (renal, hepatic,
   cardiac) — translate naturally for patient audience
5. Translate everything else naturally for a patient audience
6. Use medical vocabulary appropriate for {target_language}
7. Keep the same simple, clear, patient-friendly tone
8. Return ONLY valid JSON with the same keys — no extra text,
   no markdown

Text to translate:
{json.dumps(batch, ensure_ascii=False, indent=2)}

Return JSON with exact same keys, translated values."""

            response = self.llm.chat.completions.create(
                model    = self.deployment,
                messages = [
                    {
                        "role":    "system",
                        "content": (
                            f"You are a professional medical "
                            f"translator specializing in "
                            f"patient-facing clinical documents. "
                            f"Translate accurately into "
                            f"{target_language}. "
                            f"Never translate drug names, dose "
                            f"values, or lab abbreviations. "
                            f"Return only valid JSON."
                        )
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature     = 0.1,
                max_tokens      = 2000,
                response_format = {"type": "json_object"}
            )

            return json.loads(
                response.choices[0].message.content
            )

        except Exception as e:
            print(f"   ⚠️  Translation error: {e}")
            # Return original text on failure
            # Never break the response pipeline
            return batch
