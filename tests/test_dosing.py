"""
Test dosing recommendations for all 5 patients from your dataset.
Run: python tests/test_dosing.py
"""

import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.dosing_service import DosingService

service = DosingService()

# ── Patient Data ──────────────────────────────────────────────────────────────

patients = [
    {
        "label": "IP001 — Aariv Solan (Metformin, CKD, eGFR 38)",
        "drug":  "Metformin",
        "data":  {
            "age": 65, "sex": "M", "weight_kg": 72, "height_cm": 168, "bmi": 25.5,
            "smoker": False, "alcoholic": True,
            "conditions":   ["T2DM", "Hypertension", "CKD stage 3"],
            "current_dose": "1000mg bid",
            "egfr": 38, "sodium": 128, "potassium": 5.6,
            "bilirubin": 2.1, "tsh": 7.8, "free_t3": 4.1, "free_t4": 1.6, "pulse": 92,
            "other_investigations": {
                "eGFR_trend": "declining",
                "eGFR_value": "35 ml/min"
            }
        }
    },
    {
        "label": "IP002 — Mira Kethan (Levothyroxine, pregnant, TSH 8.5)",
        "drug":  "Levothyroxine",
        "data":  {
            "age": 28, "sex": "F", "weight_kg": 58, "height_cm": 160, "bmi": 22.7,
            "smoker": False, "alcoholic": False,
            "conditions":   ["Pregnancy (2nd trimester)", "Hypothyroidism",
                             "Iron deficiency anemia"],
            "current_dose": "standard dose",
            "egfr": 98, "sodium": 136, "potassium": 3.3,
            "bilirubin": 0.6, "tsh": 8.5, "free_t3": 1.9, "free_t4": 0.6, "pulse": 80,
            "other_investigations": {
                "USG":              "viable fetus",
                "gestational_age":  "2nd trimester"
            }
        }
    },
    {
        "label": "IP003 — Rohan Vale (Propranolol, active asthma)",
        "drug":  "Propranolol",
        "data":  {
            "age": 45, "sex": "M", "weight_kg": 80, "height_cm": 170, "bmi": 27.7,
            "smoker": True, "alcoholic": True,
            "conditions":   ["Asthma", "Hypertension"],
            "current_dose": "standard dose",
            "egfr": 90, "sodium": 140, "potassium": 4.9,
            "bilirubin": 0.9, "tsh": 2.0, "free_t3": 3.8, "free_t4": 1.1, "pulse": 110,
            "other_investigations": {
                "CXR":         "infiltrates",
                "presentation": "acute asthma exacerbation"
            }
        }
    },
    {
        "label": "IP004 — Isha Morren (Insulin, chemo planned, K+ 5.5)",
        "drug":  "Insulin",
        "data":  {
            "age": 52, "sex": "F", "weight_kg": 62, "height_cm": 155, "bmi": 25.8,
            "smoker": False, "alcoholic": False,
            "conditions":   ["Breast cancer", "T2DM", "Hypertension"],
            "current_dose": "standard dose",
            "egfr": 78, "sodium": 130, "potassium": 5.5,
            "bilirubin": 1.4, "tsh": 4.9, "free_t3": 3.2, "free_t4": 1.2, "pulse": 88,
            "other_investigations": {
                "chemo_status":    "planned",
                "cycle_number":    "pre-treatment",
                "bsa_m2":          "1.62"
            }
        }
    },
    {
        "label": "IP005 — Kiran Thale (Phenytoin, epilepsy, K+ 3.2)",
        "drug":  "Phenytoin",
        "data":  {
            "age": 34, "sex": "M", "weight_kg": 70, "height_cm": 175, "bmi": 22.9,
            "smoker": False, "alcoholic": True,
            "conditions":   ["Epilepsy", "Depression"],
            "current_dose": "standard dose",
            "egfr": 95, "sodium": 138, "potassium": 3.2,
            "bilirubin": 0.7, "tsh": 2.1, "free_t3": 4.0, "free_t4": 1.3, "pulse": 76,
            "other_investigations": {
                "EEG":             "abnormal",
                "seizure_status":  "breakthrough seizures"
            }
        }
    }
]

# ── Run Tests ─────────────────────────────────────────────────────────────────

print("=" * 65)
print("VABGENRX — DOSING RECOMMENDATION TEST")
print("=" * 65)

for p in patients:
    print(f"\n{'─' * 65}")
    print(f"🧪 {p['label']}")
    print(f"{'─' * 65}")

    result = service.get_dosing_recommendation(
        drug         = p['drug'],
        patient_data = p['data']
    )

    # Print clean summary
    print(f"  Drug:             {result.get('drug')}")
    print(f"  Current dose:     {result.get('current_dose')}")
    print(f"  Recommended:      {result.get('recommended_dose')}")
    print(f"  Adjustment:       {result.get('adjustment_required')} "
          f"({result.get('adjustment_type')})")
    print(f"  Urgency:          {result.get('urgency')}")
    print(f"  Reason:           {result.get('adjustment_reason')}")
    print(f"  Hold threshold:   {result.get('hold_threshold')}")
    print(f"  Monitoring:       {result.get('monitoring_required')}")
    print(f"  FDA basis:        {result.get('fda_label_basis')}")
    print(f"  Evidence tier:    {result.get('evidence_tier')} "
          f"({result.get('evidence_confidence')})")
    print(f"  From cache:       {result.get('from_cache')}")
    print(f"  Clinical note:    {result.get('clinical_note')}")

print(f"\n{'=' * 65}")
print("✅ All tests complete")
print("=" * 65)