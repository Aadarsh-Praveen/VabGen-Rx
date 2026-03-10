"""
VabGenRx — Translation Manual Check
Translates 2 drug counseling + 2 condition counseling samples
so you can visually verify translation quality.

Run:
    python tests/test_translation.py
"""

import os
import sys
import copy

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.translation_service import TranslationService

service = TranslationService()

# ── Sample Data — Drug Counseling ─────────────────────────────────────────────

DRUG_1 = {
    "drug": "warfarin",
    "patient_context": "72yo male",
    "counseling_points": [
        {
            "title": "Bleeding risk with alcohol",
            "detail": "Drinking alcohol while on warfarin can increase your risk of bleeding. Limit alcohol intake and report any unusual bruising or bleeding.",
            "severity": "high",
            "category": "bleeding"
        },
        {
            "title": "Vitamin K affects warfarin",
            "detail": "Keep your intake of vitamin K-rich foods consistent to avoid changes in warfarin effectiveness. Sudden changes may affect your INR.",
            "severity": "high",
            "category": "monitoring"
        },
        {
            "title": "Kidney disease monitoring",
            "detail": "Your kidney disease may affect how warfarin is processed. Regular blood tests are essential to monitor your INR levels.",
            "severity": "high",
            "category": "renal"
        }
    ],
    "key_monitoring": "Monitor INR levels regularly to ensure safe and effective dosing.",
    "patient_summary": "72yo male on warfarin with COPD, atrial fibrillation, kidney disease, alcohol use, and smoking habits; focus on bleeding risk and INR monitoring.",
    "from_cache": False
}

DRUG_2 = {
    "drug": "metformin",
    "patient_context": "58yo female",
    "counseling_points": [
        {
            "title": "Take with food",
            "detail": "Take metformin with meals to reduce stomach upset and nausea. Do not take on an empty stomach.",
            "severity": "medium",
            "category": "timing"
        },
        {
            "title": "Monitor kidney function",
            "detail": "metformin is processed by your kidneys. Regular eGFR tests are needed. Stop taking metformin if eGFR falls below 30.",
            "severity": "high",
            "category": "renal"
        },
        {
            "title": "Blood sugar monitoring",
            "detail": "Check your blood sugar levels regularly. Target HbA1c below 7%. Report any episodes of dizziness or unusual fatigue.",
            "severity": "high",
            "category": "monitoring"
        }
    ],
    "key_monitoring": "Monitor eGFR every 3-6 months and HbA1c every 3 months.",
    "patient_summary": "58yo female on metformin for T2DM with CKD stage 3; monitor eGFR and HbA1c closely.",
    "from_cache": False
}

# ── Sample Data — Condition Counseling ───────────────────────────────────────

CONDITION_1 = {
    "condition": "Atrial Fibrillation",
    "patient_context": "72yo male",
    "exercise": [
        {
            "title": "Low-intensity walking",
            "detail": "Engage in low-intensity walking to improve cardiovascular health. Focus on a steady pace that does not cause shortness of breath.",
            "frequency": "5 days/week, 20-30 minutes per session"
        },
        {
            "title": "Balance and flexibility exercises",
            "detail": "Incorporate balance exercises to reduce fall risk and improve mobility.",
            "frequency": "2-3 days/week, 10-15 minutes per session"
        }
    ],
    "lifestyle": [
        {
            "title": "Limit alcohol intake",
            "detail": "Alcohol can increase the risk of atrial fibrillation episodes and interact with warfarin. Limit consumption to reduce these risks."
        },
        {
            "title": "Smoking cessation",
            "detail": "Smoking increases cardiovascular strain and worsens atrial fibrillation outcomes. Seek support to reduce or stop smoking."
        }
    ],
    "diet": [
        {
            "title": "Maintain consistent vitamin K intake",
            "detail": "Vitamin K intake should remain consistent to avoid fluctuations in warfarin effectiveness.",
            "nutrients_to_increase": ["fibre", "unsaturated fats"],
            "nutrients_to_reduce":   ["sodium", "saturated fats"]
        }
    ],
    "safety": [
        {
            "title": "Monitor for bleeding",
            "detail": "warfarin increases bleeding risk. Watch for signs such as unusual bruising, blood in stool or urine, or prolonged bleeding from cuts.",
            "urgency": "high"
        },
        {
            "title": "Avoid over-the-counter NSAIDs",
            "detail": "NSAIDs can increase bleeding risk when taken with warfarin. Consult your physician before taking any new medications.",
            "urgency": "high"
        }
    ],
    "monitoring": "INR levels should be monitored regularly to ensure warfarin is within therapeutic range (typically 2.0-3.0).",
    "follow_up":  "Follow up in 4 weeks to review INR levels, medication interactions, and overall symptom management.",
    "from_cache": False
}

CONDITION_2 = {
    "condition": "Type 2 Diabetes",
    "patient_context": "58yo female",
    "exercise": [
        {
            "title": "Moderate aerobic exercise",
            "detail": "Engage in brisk walking or cycling to improve insulin sensitivity and blood sugar control.",
            "frequency": "5 days/week, 30 minutes per session"
        }
    ],
    "lifestyle": [
        {
            "title": "Maintain a regular meal schedule",
            "detail": "Eat meals at consistent times each day to help stabilise blood sugar levels and improve metformin effectiveness."
        }
    ],
    "diet": [
        {
            "title": "Low glycaemic index diet",
            "detail": "Choose foods with a low glycaemic index to prevent blood sugar spikes. Avoid refined carbohydrates and sugary drinks.",
            "nutrients_to_increase": ["fibre", "protein"],
            "nutrients_to_reduce":   ["simple carbohydrates", "added sugars"]
        }
    ],
    "safety": [
        {
            "title": "Recognise hypoglycaemia",
            "detail": "Know the signs of low blood sugar: dizziness, sweating, confusion. Carry a fast-acting sugar source at all times.",
            "urgency": "high"
        }
    ],
    "monitoring": "Check HbA1c every 3 months. Target HbA1c below 7%. Monitor eGFR every 6 months.",
    "follow_up":  "Follow up in 3 months to review HbA1c, eGFR, and overall diabetes management.",
    "from_cache": False
}


# ── Language Input ─────────────────────────────────────────────────────────────

EXAMPLE_LANGUAGES = (
    "e.g. Spanish, French, Arabic, Hindi, Tamil, Telugu, Mandarin Chinese,\n"
    "  Japanese, Korean, Vietnamese, Portuguese, Swahili, Urdu, Bengali,\n"
    "  Turkish, Malay, Tagalog, Persian, Russian, German, Italian — or any other"
)

def get_language() -> str:
    """Ask the user once for the output language."""
    print("\n" + "=" * 60)
    print("OUTPUT LANGUAGE")
    print("=" * 60)
    print(f"\n  {EXAMPLE_LANGUAGES}")
    raw = input("\n  Translate output to (press Enter for 'Tamil'): ").strip()
    lang = raw if raw else "Tamil"
    print(f"  → Using: '{lang}'")
    return lang


# ── Print Helpers ──────────────────────────────────────────────────────────────

def divider(title: str):
    print(f"\n{'─' * 60}")
    print(f"  {title}")
    print(f"{'─' * 60}")


def print_drug(label: str, original: dict, translated: dict):
    """Side-by-side print of original vs translated drug counseling."""
    divider(f"Drug: {original['drug']}  |  Patient: {original['patient_context']}")

    print(f"\n  PATIENT SUMMARY")
    print(f"  EN : {original.get('patient_summary', '')}")
    print(f"  {translated.get('_translated_to','?'):4}: {translated.get('patient_summary', '')}")

    print(f"\n  KEY MONITORING")
    print(f"  EN : {original.get('key_monitoring', '')}")
    print(f"  {translated.get('_translated_to','?'):4}: {translated.get('key_monitoring', '')}")

    print(f"\n  COUNSELING POINTS")
    for i, (orig_pt, trans_pt) in enumerate(
        zip(original["counseling_points"], translated["counseling_points"])
    ):
        print(f"\n  [{orig_pt['severity'].upper()}] {orig_pt['title']}")
        print(f"  EN   : {orig_pt['detail']}")
        print(f"  TRANS: {trans_pt['detail']}")
        # Verify severity and category NOT translated (internal fields)
        sev_ok = trans_pt.get("severity") == orig_pt.get("severity")
        cat_ok = trans_pt.get("category") == orig_pt.get("category")
        print(f"  severity='{trans_pt.get('severity')}' {'✅' if sev_ok else '❌ CHANGED'}  "
              f"category='{trans_pt.get('category')}' {'✅' if cat_ok else '❌ CHANGED'}")

    # Drug name protection check
    drug_name = original["drug"].lower()
    summary   = translated.get("patient_summary", "").lower()
    drug_ok   = drug_name in summary
    print(f"\n  Drug name '{original['drug']}' in summary: {'✅ preserved' if drug_ok else '❌ MISSING'}")


def print_condition(label: str, original: dict, translated: dict):
    """Side-by-side print of original vs translated condition counseling."""
    divider(f"Condition: {original['condition']}  |  Patient: {original['patient_context']}")

    print(f"\n  MONITORING")
    print(f"  EN : {original.get('monitoring', '')}")
    print(f"  {translated.get('_translated_to','?'):4}: {translated.get('monitoring', '')}")

    print(f"\n  FOLLOW UP")
    print(f"  EN : {original.get('follow_up', '')}")
    print(f"  {translated.get('_translated_to','?'):4}: {translated.get('follow_up', '')}")

    for section in ["exercise", "lifestyle", "safety"]:
        items = original.get(section, [])
        if not items:
            continue
        print(f"\n  {section.upper()}")
        for i, orig in enumerate(items):
            trans = translated.get(section, [])[i] if i < len(translated.get(section, [])) else {}
            print(f"\n  • {orig.get('title', '')}")
            print(f"    EN   : {orig.get('detail', '')}")
            print(f"    TRANS: {trans.get('detail', '')}")
            if section == "exercise" and orig.get("frequency"):
                print(f"    Frequency EN   : {orig.get('frequency', '')}")
                print(f"    Frequency TRANS: {trans.get('frequency', '')}")
            if section == "safety":
                urg_ok = trans.get("urgency") == orig.get("urgency")
                print(f"    urgency='{trans.get('urgency')}' {'✅' if urg_ok else '❌ CHANGED'}")

    # Diet — check nutrients not translated
    print(f"\n  DIET")
    for i, orig_dt in enumerate(original.get("diet", [])):
        trans_dt = translated.get("diet", [])[i] if i < len(translated.get("diet", [])) else {}
        print(f"\n  • {orig_dt.get('title', '')}")
        print(f"    EN   : {orig_dt.get('detail', '')}")
        print(f"    TRANS: {trans_dt.get('detail', '')}")

        orig_nutrients = (
            orig_dt.get("nutrients_to_increase", []) +
            orig_dt.get("nutrients_to_reduce", [])
        )
        trans_nutrients = (
            trans_dt.get("nutrients_to_increase", []) +
            trans_dt.get("nutrients_to_reduce", [])
        )
        nutrients_ok = orig_nutrients == trans_nutrients
        print(f"    nutrients EN   : {orig_nutrients}")
        print(f"    nutrients TRANS: {trans_nutrients}")
        print(f"    {'✅ Unchanged (correct)' if nutrients_ok else '⚠️  Changed — nutrients should stay English'}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("VABGENRX — TRANSLATION MANUAL CHECK")
    print("=" * 60)
    print("  2 drug counseling + 2 condition counseling samples")
    print("  Side-by-side English vs translated output for manual review")

    language = get_language()

    print(f"\n{'=' * 60}")
    print(f"DRUG COUNSELING TRANSLATIONS  →  {language}")
    print(f"{'=' * 60}")

    # Drug 1 — warfarin
    print(f"\n⏳ Translating Drug 1: warfarin...")
    trans_drug_1 = service.translate_drug_counseling(copy.deepcopy(DRUG_1), language)
    print_drug("Drug 1", DRUG_1, trans_drug_1)

    # Drug 2 — metformin
    print(f"\n⏳ Translating Drug 2: metformin...")
    trans_drug_2 = service.translate_drug_counseling(copy.deepcopy(DRUG_2), language)
    print_drug("Drug 2", DRUG_2, trans_drug_2)

    print(f"\n{'=' * 60}")
    print(f"CONDITION COUNSELING TRANSLATIONS  →  {language}")
    print(f"{'=' * 60}")

    # Condition 1 — Atrial Fibrillation
    print(f"\n⏳ Translating Condition 1: Atrial Fibrillation...")
    trans_cond_1 = service.translate_condition_counseling(copy.deepcopy(CONDITION_1), language)
    print_condition("Condition 1", CONDITION_1, trans_cond_1)

    # Condition 2 — Type 2 Diabetes
    print(f"\n⏳ Translating Condition 2: Type 2 Diabetes...")
    trans_cond_2 = service.translate_condition_counseling(copy.deepcopy(CONDITION_2), language)
    print_condition("Condition 2", CONDITION_2, trans_cond_2)

    # Drug names found in the translated output
    print(f"\n{'=' * 60}")
    print("DRUG NAMES PROTECTED (verified in output)")
    print(f"{'=' * 60}")
    protected = set()
    for item in [trans_drug_1, trans_drug_2]:
        if item.get("drug"):
            protected.add(item["drug"].lower())
    # Check if drug names still appear in translated summaries
    for item, orig in [(trans_drug_1, DRUG_1), (trans_drug_2, DRUG_2)]:
        name    = orig["drug"].lower()
        summary = item.get("patient_summary", "").lower()
        found   = name in summary
        print(f"  {'✅' if found else '❌'} '{orig['drug']}' preserved in translated summary")

    print(f"\n{'=' * 60}")
    print("MANUAL CHECK COMPLETE")
    print(f"{'=' * 60}")
    print(f"  Language tested : {language}")
    print(f"  Review the EN vs TRANS lines above to verify quality.")
    print(f"  Check that drug names appear unchanged in translated text.")
    print(f"  Check that severity/category/urgency fields are unchanged.")
    print("=" * 60)


if __name__ == "__main__":
    main()