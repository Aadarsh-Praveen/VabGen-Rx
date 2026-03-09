"""
VabGenRx — Dosing Recommendation Service
Generates patient-specific dose adjustments based on:
  - FDA drug label
  - Patient demographics, labs, conditions,
    and other_investigations

MOVED from services/dosing_service.py
ZERO code changes — identical to original.

Key principles:
- FDA label is the ONLY source of dosing truth
- Patient labs matched against FDA thresholds
- other_investigations dict passed through automatically
- NO cache — dosing always fresh
- Compounding signals flow through other_investigations
  when injected by DosingAgent Round 2

CHANGES:
- Azure Application Insights logging added:
    Alert 8: LLM failures
             Custom event: llm_failure
             Logged in _call_llm() on any exception from
             Azure OpenAI — covers timeouts, quota errors,
             auth failures, and JSON parse errors.
             drug name included in custom_dimensions so
             you know exactly which drug triggered the failure.
- Prompt fix added:
    CRITICAL RULE added to TASK section — forces LLM to set
    adjustment_required: true whenever recommended_dose differs
    from current_dose. Fixes cases where LLM correctly identifies
    a dose issue but incorrectly sets adjustment_required: false
    (e.g. Amlodipine 10mg tid → 5mg once daily showing as
    "NONE ADJUSTMENT" in the UI).
"""

import os
import json
import logging
from typing import Dict, List
from openai import AzureOpenAI
from dotenv import load_dotenv

load_dotenv()

# Shared logger — Application Insights handler attached in app.py
logger = logging.getLogger("vabgenrx")


def _get_age_group(age: int) -> str:
    if age < 18:   return "pediatric"
    elif age < 65: return "adult"
    else:          return "elderly"


class DosingService:

    def __init__(self):
        self.llm = AzureOpenAI(
            api_key        = os.getenv("AZURE_OPENAI_KEY"),
            api_version    = os.getenv("AZURE_OPENAI_API_VERSION"),
            azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        )
        self.deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT")

    # ── Patient Context Builder ───────────────────────────────────────────────

    def _build_patient_context(
        self, drug: str, patient_data: Dict
    ) -> str:
        lines = []

        lines.append(
            f"PATIENT: {patient_data.get('age')}yo "
            f"{patient_data.get('sex')}  "
            f"({_get_age_group(patient_data.get('age', 45))})"
        )
        lines.append(
            f"Weight: {patient_data.get('weight_kg')}kg  "
            f"Height: {patient_data.get('height_cm')}cm  "
            f"BMI: {patient_data.get('bmi')}"
        )
        lines.append(
            f"Smoker: {patient_data.get('smoker')}  "
            f"Alcoholic: {patient_data.get('alcoholic')}"
        )

        conditions = patient_data.get('conditions', [])
        if conditions:
            lines.append(f"CONDITIONS: {', '.join(conditions)}")

        lines.append(
            f"\nCURRENT DRUG: {drug}  "
            f"CURRENT DOSE: "
            f"{patient_data.get('current_dose', 'not specified')}"
        )

        lab_map = {
            'egfr':      'eGFR (ml/min/1.73m²)',
            'sodium':    'Sodium (mEq/L)',
            'potassium': 'Potassium (mEq/L)',
            'bilirubin': 'Total Bilirubin (mg/dL)',
            'tsh':       'TSH (mIU/L)',
            'free_t3':   'Free T3 (pg/mL)',
            'free_t4':   'Free T4 (ng/dL)',
            'pulse':     'Pulse (bpm)',
        }
        lab_lines = [
            f"  {label}: {patient_data[key]}"
            for key, label in lab_map.items()
            if patient_data.get(key) is not None
        ]
        if lab_lines:
            lines.append("\nSTANDARD LABS:")
            lines.extend(lab_lines)

        # other_investigations — automatically includes everything
        # including compounding_signals injected by DosingAgent Round 2
        other = patient_data.get('other_investigations', {})
        if other:
            lines.append(
                "\nOTHER INVESTIGATIONS (doctor-added):"
            )
            for k, v in other.items():
                lines.append(f"  {k}: {v}")

        return "\n".join(lines)

    # ── Evidence Tier ─────────────────────────────────────────────────────────

    def _get_evidence_tier(self, fda_label: Dict) -> Dict:
        score = sum([
            bool(fda_label.get('dosage_and_administration')),
            bool(fda_label.get('use_in_specific_populations')),
            bool(fda_label.get('clinical_pharmacology')),
            bool(fda_label.get('boxed_warning')),
        ])

        if score >= 3:
            return {
                'tier':        1,
                'tier_name':   'HIGH — Full FDA Label',
                'confidence':  '90–98%',
                'description': (
                    'Complete dosing, population, and '
                    'pharmacology sections available'
                ),
                'icon':        '📋📋📋'
            }
        elif score == 2:
            return {
                'tier':        2,
                'tier_name':   'MEDIUM — Partial FDA Label',
                'confidence':  '80–90%',
                'description': (
                    'Dosing section available, some '
                    'population data missing'
                ),
                'icon':        '📋📋'
            }
        elif score == 1:
            return {
                'tier':        3,
                'tier_name':   'LOW — Basic FDA Label',
                'confidence':  '70–80%',
                'description': (
                    'Only basic label found — '
                    'limited dosing guidance'
                ),
                'icon':        '📋'
            }
        else:
            return {
                'tier':        4,
                'tier_name':   'NO FDA DOSING LABEL FOUND',
                'confidence':  'N/A',
                'description': (
                    'No FDA dosing label found — '
                    'consult clinical pharmacist'
                ),
                'icon':        '⚠️'
            }

    # ── Main Method ───────────────────────────────────────────────────────────

    def get_dosing_recommendation(
        self,
        drug:         str,
        patient_data: Dict
    ) -> Dict:
        age       = patient_data.get('age', 45)
        sex       = patient_data.get('sex', 'unknown')
        age_group = _get_age_group(age)

        print(
            f"   💊 Generating dosing recommendation: {drug} "
            f"({sex}, age {age}, "
            f"eGFR {patient_data.get('egfr', 'unknown')})"
        )

        from services.fda_service import FDAService
        fda_label     = FDAService().get_dosing_label(drug)
        evidence_tier = self._get_evidence_tier(fda_label)

        fda_sections = {
            '⚠️  BOXED WARNING': fda_label.get('boxed_warning'),
            'DOSAGE AND ADMINISTRATION': fda_label.get(
                'dosage_and_administration'
            ),
            'USE IN SPECIFIC POPULATIONS': fda_label.get(
                'use_in_specific_populations'
            ),
            'CLINICAL PHARMACOLOGY': fda_label.get(
                'clinical_pharmacology'
            ),
            'WARNINGS AND PRECAUTIONS': fda_label.get(
                'warnings_and_precautions'
            ),
            'CONTRAINDICATIONS': fda_label.get('contraindications'),
            'WARNINGS':          fda_label.get('warnings'),
        }

        fda_text = "\n\n---\n\n".join(
            f"{title}:\n{content}"
            for title, content in fda_sections.items()
            if content
        ) or (
            "No FDA label found. "
            "Consult clinical pharmacist for dosing guidance."
        )

        patient_context = self._build_patient_context(
            drug, patient_data
        )

        prompt = f"""
You are a clinical pharmacologist determining the correct dose
for a specific patient.

FDA LABEL EVIDENCE (Evidence Tier: {evidence_tier['tier_name']}):
{fda_text}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PATIENT DATA:
{patient_context}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TASK:
1. Read the FDA label sections above carefully
2. Match the patient's labs and conditions against
   FDA thresholds
3. Determine if the current dose needs adjustment
4. Base EVERY recommendation strictly on what the
   FDA label states
5. If the OTHER INVESTIGATIONS section contains
   compounding signal information — factor this into
   your assessment. Multiple converging risk signals
   may warrant more conservative dosing than the
   standard FDA table assumes for a single risk factor.
6. If FDA label has no specific guidance for this
   patient's situation, state clearly:
   "No specific FDA guidance for this scenario"

ADJUSTMENT TYPES TO CHECK:
- RENAL:      Match patient eGFR against FDA renal table
- HEPATIC:    Match bilirubin/liver conditions
- AGE:        Check FDA elderly/pediatric section
- WEIGHT:     Check if drug is weight-based (mg/kg)
- PREGNANCY:  Check FDA pregnancy guidance
- DRUG_LEVEL: If therapeutic monitoring required
- NONE:       Current dose appropriate — state why

CRITICAL RULE — strictly enforced:
If recommended_dose differs from current_dose in ANY way,
you MUST set adjustment_required: true and set
adjustment_type to the correct type (renal/hepatic/age/etc).
NEVER set adjustment_required: false when you are recommending
a different dose than the current dose.
Only set adjustment_required: false when recommended_dose
is exactly "No change required".

Return JSON:
{{
  "drug": "{drug}",
  "current_dose": "{patient_data.get('current_dose',
                                      'not specified')}",
  "recommended_dose": "specific dose or 'No change required'",
  "adjustment_required": true,
  "adjustment_type": "renal|hepatic|age|weight|"
                     "pregnancy|drug_level|none",
  "urgency": "high|medium|low",
  "adjustment_reason": "specific FDA threshold vs patient value",
  "hold_threshold": "when to hold/stop, or null",
  "monitoring_required": "specific lab and frequency",
  "fda_label_basis": "exact FDA section referenced",
  "evidence_tier": "{evidence_tier['tier_name']}",
  "evidence_confidence": "{evidence_tier['confidence']}",
  "patient_flags_used": [],
  "clinical_note": "one sentence summary for prescriber",
  "evidence": {{
    "fda_label_found": {str(fda_label.get('found',
                                           False)).lower()},
    "fda_label_sections_found": [],
    "fda_label_sections_count": 0,
    "evidence_tier": {evidence_tier['tier']},
    "evidence_tier_name": "{evidence_tier['tier_name']}",
    "confidence": "{evidence_tier['confidence']}",
    "patient_flags_used": []
  }}
}}
"""

        result                    = self._call_llm(prompt, drug)
        result['evidence_tier_info'] = evidence_tier
        result['from_cache']         = False
        return result

    # ── Batch Method ──────────────────────────────────────────────────────────

    def get_dosing_for_all_drugs(
        self,
        medications:  List[str],
        patient_data: Dict,
        dose_map:     Dict[str, str] = None
    ) -> List[Dict]:
        dose_map = dose_map or {}
        results  = []

        for drug in medications:
            pd                 = dict(patient_data)
            pd['current_dose'] = dose_map.get(drug, 'not specified')
            pd['current_drug'] = drug
            results.append(
                self.get_dosing_recommendation(
                    drug=drug, patient_data=pd
                )
            )

        return results

    # ── LLM Call ──────────────────────────────────────────────────────────────

    def _call_llm(self, prompt: str, drug: str = "") -> Dict:
        try:
            response = self.llm.chat.completions.create(
                model    = self.deployment,
                messages = [
                    {
                        "role":    "system",
                        "content": (
                            "You are a board-certified clinical "
                            "pharmacologist. "
                            "Determine dosing adjustments based "
                            "STRICTLY on the FDA label text provided."
                            " Match patient lab values against FDA "
                            "thresholds precisely. "
                            "Never recommend a dose that contradicts"
                            " the FDA label. "
                            "If the FDA label does not address a "
                            "specific situation, say so explicitly. "
                            "Be specific — always state the exact "
                            "threshold from the FDA label and the "
                            "patient's exact value that triggered "
                            "the recommendation. "
                            "If compounding signals are present in "
                            "OTHER INVESTIGATIONS — consider whether"
                            " standard single risk factor FDA tables"
                            " are sufficient given multiple "
                            "converging risks. "
                            "CRITICAL: If recommended_dose differs "
                            "from current_dose, you MUST set "
                            "adjustment_required to true. Never set "
                            "adjustment_required to false when you "
                            "are recommending a dose change."
                        )
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature     = 0,
                max_tokens      = 800,
                response_format = {"type": "json_object"}
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            # ── Alert 8: LLM failure ──────────────────────────────
            logger.error(
                "llm_failure",
                extra={"custom_dimensions": {
                    "event":   "llm_failure",
                    "service": "dosing_service",
                    "drug":    drug,
                    "error":   str(e)[:200],
                }}
            )
            print(f"   ❌ LLM error: {e}")
            return {
                "drug":                drug,
                "current_dose":        "",
                "recommended_dose":    "Consult pharmacist",
                "adjustment_required": False,
                "adjustment_type":     "none",
                "urgency":             "low",
                "adjustment_reason":   f"System error: {e}",
                "hold_threshold":      None,
                "monitoring_required": "Consult pharmacist",
                "fda_label_basis":     "unavailable",
                "evidence_tier":       "Error",
                "evidence_confidence": "N/A",
                "patient_flags_used":  [],
                "clinical_note":       (
                    "Unable to generate recommendation"
                ),
                "error": str(e)
            }