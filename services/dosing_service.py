"""
VabGenRx — Dosing Recommendation Service
Generates patient-specific dose adjustments based on:
  - FDA drug label (dosage_and_administration, use_in_specific_populations, etc.)
  - Patient demographics, labs, conditions, and other_investigations

Key principles:
- FDA label is the ONLY source of dosing truth
- Patient labs (eGFR, TSH, K+, etc.) matched against FDA thresholds
- other_investigations dict passed through automatically — no code change needed
- NO cache — dosing always fresh since patient labs change frequently
- Evidence tier attached to every recommendation
"""

import os
import json
from typing import Dict, List
from openai import AzureOpenAI
from dotenv import load_dotenv

load_dotenv()


# ── Helpers ───────────────────────────────────────────────────────────────────

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

    def _build_patient_context(self, drug: str, patient_data: Dict) -> str:
        """
        Formats ALL patient data into a clear context string for the LLM.
        other_investigations is included automatically — no code change needed
        when doctors add new investigation values to the DB column.
        """
        lines = []

        # Demographics
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

        # Conditions
        conditions = patient_data.get('conditions', [])
        if conditions:
            lines.append(f"CONDITIONS: {', '.join(conditions)}")

        # Current drug + dose
        lines.append(
            f"\nCURRENT DRUG: {drug}  "
            f"CURRENT DOSE: {patient_data.get('current_dose', 'not specified')}"
        )

        # Standard labs — only include if value is present
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

        # Other investigations — automatically include everything in the column
        other = patient_data.get('other_investigations', {})
        if other:
            lines.append("\nOTHER INVESTIGATIONS (doctor-added):")
            for k, v in other.items():
                lines.append(f"  {k}: {v}")

        return "\n".join(lines)

    # ── Evidence Tier ─────────────────────────────────────────────────────────

    def _get_evidence_tier(self, fda_label: Dict) -> Dict:
        """
        Determine evidence quality based on which FDA label
        sections were available for this drug.
        """
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
                'description': 'Complete dosing, population, and pharmacology sections available',
                'icon':        '📋📋📋'
            }
        elif score == 2:
            return {
                'tier':        2,
                'tier_name':   'MEDIUM — Partial FDA Label',
                'confidence':  '80–90%',
                'description': 'Dosing section available, some population data missing',
                'icon':        '📋📋'
            }
        elif score == 1:
            return {
                'tier':        3,
                'tier_name':   'LOW — Basic FDA Label',
                'confidence':  '70–80%',
                'description': 'Only basic label found — limited dosing guidance',
                'icon':        '📋'
            }
        else:
            return {
                'tier':        4,
                'tier_name':   'AI KNOWLEDGE — No FDA Label Found',
                'confidence':  '60–75%',
                'description': 'No FDA label found — based on pharmacological principles',
                'icon':        '🤖'
            }

    # ── Main Method ───────────────────────────────────────────────────────────

    def get_dosing_recommendation(
        self,
        drug:         str,
        patient_data: Dict
    ) -> Dict:
        """
        Generate a fresh dosing recommendation for a specific drug and patient.
        Always runs — no cache. Patient labs change too frequently to cache safely.

        patient_data fields:
        {
            # Demographics
            "age": 65, "sex": "M",
            "weight_kg": 72, "height_cm": 168, "bmi": 25.5,
            "smoker": False, "alcoholic": True,

            # Conditions
            "conditions": ["T2DM", "Hypertension", "CKD stage 3"],

            # Current prescription
            "current_drug": "Metformin",
            "current_dose": "1000mg bid",

            # Standard labs (include only what you have)
            "egfr": 38, "sodium": 128, "potassium": 5.6,
            "bilirubin": 2.1, "tsh": 7.8,
            "free_t3": 4.1, "free_t4": 1.6, "pulse": 92,

            # Other investigations — free dict from DB column
            # Everything doctor adds flows through automatically
            "other_investigations": {
                "eGFR_trend": "declining",
                "phenytoin_level": "8.2",   # if added by doctor
                "neutrophil_count": "1.2",  # if added for chemo patient
                ...
            }
        }
        """
        age       = patient_data.get('age', 45)
        sex       = patient_data.get('sex', 'unknown')
        age_group = _get_age_group(age)

        print(f"   💊 Generating dosing recommendation: {drug} "
              f"({sex}, age {age}, eGFR {patient_data.get('egfr', 'unknown')})")

        # ── FDA label fetch ───────────────────────────────────────────────────
        from services.fda_service import FDAService
        fda_label     = FDAService().get_dosing_label(drug)
        evidence_tier = self._get_evidence_tier(fda_label)

        # ── Build FDA context for LLM ─────────────────────────────────────────
        fda_sections = {
            '⚠️  BOXED WARNING':              fda_label.get('boxed_warning'),
            'DOSAGE AND ADMINISTRATION':      fda_label.get('dosage_and_administration'),
            'USE IN SPECIFIC POPULATIONS':    fda_label.get('use_in_specific_populations'),
            'CLINICAL PHARMACOLOGY':          fda_label.get('clinical_pharmacology'),
            'WARNINGS AND PRECAUTIONS':       fda_label.get('warnings_and_precautions'),
            'CONTRAINDICATIONS':              fda_label.get('contraindications'),
            'WARNINGS':                       fda_label.get('warnings'),
        }

        fda_text = "\n\n---\n\n".join(
            f"{title}:\n{content}"
            for title, content in fda_sections.items()
            if content
        ) or (
            "No FDA label found. Base recommendation on established "
            "pharmacological principles and clinical guidelines."
        )

        # ── Patient context ───────────────────────────────────────────────────
        patient_context = self._build_patient_context(drug, patient_data)

        # ── LLM Prompt ────────────────────────────────────────────────────────
        prompt = f"""
You are a clinical pharmacologist determining the correct dose for a specific patient.

FDA LABEL EVIDENCE (Evidence Tier: {evidence_tier['tier_name']}):
{fda_text}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PATIENT DATA:
{patient_context}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TASK:
1. Read the FDA label sections above carefully
2. Match the patient's labs and conditions against FDA thresholds
3. Determine if the current dose needs adjustment
4. Base EVERY recommendation strictly on what the FDA label states
5. If FDA label has no specific guidance for this patient's situation,
   state clearly: "No specific FDA guidance for this scenario"

ADJUSTMENT TYPES TO CHECK (only if relevant to this drug):
- RENAL:      Match patient eGFR against FDA renal dosing table
- HEPATIC:    Match patient bilirubin/liver conditions against FDA hepatic guidance
- AGE:        Check FDA elderly/pediatric population section
- WEIGHT:     Check if drug is weight-based (mg/kg)
- PREGNANCY:  Check FDA pregnancy category and trimester guidance
- DRUG_LEVEL: If therapeutic drug monitoring required (phenytoin, digoxin, etc.)
- NONE:       Current dose is appropriate — state why

Return JSON:
{{
  "drug": "{drug}",
  "current_dose": "{patient_data.get('current_dose', 'not specified')}",
  "recommended_dose": "specific dose string or 'No change required'",
  "adjustment_required": true or false,
  "adjustment_type": "renal | hepatic | age | weight | pregnancy | drug_level | none",
  "urgency": "high | medium | low",
  "adjustment_reason": "specific FDA label threshold matched against patient value",
  "hold_threshold": "condition under which drug should be held/stopped, or null",
  "monitoring_required": "specific lab and frequency",
  "fda_label_basis": "exact FDA label section referenced",
  "evidence_tier": "{evidence_tier['tier_name']}",
  "evidence_confidence": "{evidence_tier['confidence']}",
  "patient_flags_used": ["list of patient values that drove this decision"],
  "clinical_note": "one sentence summary for the prescriber"
}}
"""

        result                   = self._call_llm(prompt)
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
        """
        Run dosing recommendations for all medications for a patient.

        medications: list of drug names
        patient_data: full patient dict (demographics + labs + other_investigations)
        dose_map: {drug_name: current_dose_string}
        """
        dose_map = dose_map or {}
        results  = []

        for drug in medications:
            pd                 = dict(patient_data)
            pd['current_dose'] = dose_map.get(drug, 'not specified')
            pd['current_drug'] = drug
            results.append(
                self.get_dosing_recommendation(drug=drug, patient_data=pd)
            )

        return results

    # ── LLM Call ──────────────────────────────────────────────────────────────

    def _call_llm(self, prompt: str) -> Dict:
        try:
            response = self.llm.chat.completions.create(
                model    = self.deployment,
                messages = [
                    {
                        "role":    "system",
                        "content": (
                            "You are a board-certified clinical pharmacologist. "
                            "Determine dosing adjustments based STRICTLY on the FDA label text provided. "
                            "Match patient lab values against FDA thresholds precisely. "
                            "Never recommend a dose that contradicts the FDA label. "
                            "If the FDA label does not address a specific situation, say so explicitly. "
                            "Be specific — always state the exact threshold from the FDA label "
                            "and the patient's exact value that triggered the recommendation."
                        )
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature     = 0.1,
                max_tokens      = 800,
                response_format = {"type": "json_object"}
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            print(f"   ❌ LLM error: {e}")
            return {
                "drug":               "",
                "current_dose":       "",
                "recommended_dose":   "Consult pharmacist",
                "adjustment_required": False,
                "adjustment_type":    "none",
                "urgency":            "low",
                "adjustment_reason":  f"System error: {e}",
                "hold_threshold":     None,
                "monitoring_required": "Consult pharmacist",
                "fda_label_basis":    "unavailable",
                "evidence_tier":      "Error",
                "evidence_confidence": "N/A",
                "patient_flags_used": [],
                "clinical_note":      "Unable to generate recommendation",
                "error":              str(e)
            }