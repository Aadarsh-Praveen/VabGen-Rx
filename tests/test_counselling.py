"""
Test Drug Counseling and Condition Counseling services directly.
Run: python tests/test_counseling.py
"""

import os
import sys
import json

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.getcwd())

from services.counselling_service import DrugCounselingService
from services.condition_service   import ConditionCounselingService

drug_service      = DrugCounselingService()
condition_service = ConditionCounselingService()

# ── Test Cases ────────────────────────────────────────────────────────────────

# Same patient from the frontend mockup:
# Mr. Jvue Raat, Age 68, has Diabetes + Hypertension
# Medications: Warfarin, Aspirin, Metformin, Lisinopril

PATIENT = {
    "age":        68,
    "sex":        "male",
    "medications": ["warfarin", "aspirin"],
    "conditions":  ["diabetes", "hypertension"],
    "dose_map": {
        "warfarin":   "10mg daily",
        "aspirin":    "81mg daily"
    },
    # Only confirmed habits — nothing assumed
    "patient_profile": {
        "drinks_alcohol":     False,   # confirmed does not drink
        "smokes":             False,   # confirmed non-smoker
        "has_kidney_disease": False,
        "has_liver_disease":  False,
        "sedentary":          True,    # confirmed not active
    }
}


def test_drug_counseling():
    print("\n" + "=" * 60)
    print("TEST 1: DRUG COUNSELING")
    print("=" * 60)
    print(f"Patient: {PATIENT['age']}yo {PATIENT['sex']}")
    print(f"Drugs:   {', '.join(PATIENT['medications'])}")

    for drug in PATIENT["medications"]:
        dose = PATIENT["dose_map"].get(drug, "")

        print(f"\n{'─'*50}")
        print(f"💊 {drug.upper()} — {dose}")
        print(f"{'─'*50}")

        result = drug_service.get_drug_counseling(
            drug            = drug,
            age             = PATIENT["age"],
            sex             = PATIENT["sex"],
            dose            = dose,
            conditions      = PATIENT["conditions"],
            patient_profile = PATIENT["patient_profile"]
        )

        points = result.get("counseling_points", [])
        print(f"Counseling points ({len(points)}):")
        for p in points:
            icon = "🔴" if p.get("severity") == "high" else "🟡" if p.get("severity") == "medium" else "🟢"
            print(f"  {icon} [{p.get('category','').upper()}] {p.get('title','')}")
            print(f"     {p.get('detail','')}")

        print(f"\n📋 Key monitoring: {result.get('key_monitoring', '')}")
        print(f"📝 Patient summary: {result.get('patient_summary', '')}")
        print(f"💾 From cache: {result.get('from_cache', False)}")


def test_condition_counseling():
    print("\n\n" + "=" * 60)
    print("TEST 2: CONDITION COUNSELING")
    print("=" * 60)
    print(f"Patient:    {PATIENT['age']}yo {PATIENT['sex']}")
    print(f"Conditions: {', '.join(PATIENT['conditions'])}")

    for condition in PATIENT["conditions"]:
        print(f"\n{'─'*50}")
        print(f"🏥 {condition.upper()}")
        print(f"{'─'*50}")

        result = condition_service.get_condition_counseling(
            condition       = condition,
            age             = PATIENT["age"],
            sex             = PATIENT["sex"],
            medications     = PATIENT["medications"],
            patient_profile = PATIENT["patient_profile"]
        )

        # Exercise
        print("\n🏃 EXERCISE:")
        for e in result.get("exercise", []):
            print(f"  • {e.get('title','')}: {e.get('detail','')} [{e.get('frequency','')}]")

        # Lifestyle
        print("\n🌿 LIFESTYLE:")
        for l in result.get("lifestyle", []):
            print(f"  • {l.get('title','')}: {l.get('detail','')}")

        # Diet
        print("\n🥗 DIET:")
        for d in result.get("diet", []):
            print(f"  • {d.get('title','')}: {d.get('detail','')}")
            if d.get("foods_to_include"):
                print(f"    ✅ Include: {', '.join(d['foods_to_include'])}")
            if d.get("foods_to_avoid"):
                print(f"    ❌ Avoid:   {', '.join(d['foods_to_avoid'])}")

        # Safety
        print("\n⚠️  SAFETY:")
        for s in result.get("safety", []):
            icon = "🔴" if s.get("urgency") == "high" else "🟡" if s.get("urgency") == "medium" else "🟢"
            print(f"  {icon} {s.get('title','')}: {s.get('detail','')}")

        print(f"\n📊 Monitoring: {result.get('monitoring', '')}")
        print(f"📅 Follow-up:  {result.get('follow_up', '')}")
        print(f"💾 From cache: {result.get('from_cache', False)}")


def test_cache_works():
    """Run same tests again — should all be cache hits this time."""
    print("\n\n" + "=" * 60)
    print("TEST 3: CACHE VERIFICATION (second run = instant)")
    print("=" * 60)

    import time

    # Drug counseling cache
    start = time.time()
    drug_service.get_drug_counseling(
        drug="warfarin", age=68, sex="male",
        dose="10mg daily", conditions=["diabetes"]
    )
    elapsed = time.time() - start
    print(f"warfarin counseling: {elapsed:.2f}s {'✅ CACHE HIT (fast!)' if elapsed < 1 else '❌ Still calling API'}")

    # Condition counseling cache
    start = time.time()
    condition_service.get_condition_counseling(
        condition="diabetes", age=68, sex="male",
        medications=["warfarin", "aspirin"]
    )
    elapsed = time.time() - start
    print(f"diabetes counseling: {elapsed:.2f}s {'✅ CACHE HIT (fast!)' if elapsed < 1 else '❌ Still calling API'}")


def test_sex_filtering():
    """
    Verify that sex filtering works correctly.
    Male patient should NOT get pregnancy warnings.
    Female patient should NOT get erectile dysfunction warnings.
    """
    print("\n\n" + "=" * 60)
    print("TEST 4: SEX FILTERING VERIFICATION")
    print("=" * 60)

    # Warfarin for male — should NOT mention pregnancy
    male_result = drug_service.get_drug_counseling(
        drug="warfarin", age=35, sex="male", dose="5mg daily"
    )
    male_text = json.dumps(male_result).lower()
    pregnancy_mentioned = "pregnancy" in male_text or "pregnant" in male_text
    print(f"Male warfarin — pregnancy mentioned: {'❌ YES (bug!)' if pregnancy_mentioned else '✅ NO (correct)'}")

    # Thiazide for female — should NOT mention erectile dysfunction
    female_result = drug_service.get_drug_counseling(
        drug="hydrochlorothiazide", age=45, sex="female", dose="25mg daily"
    )
    female_text = json.dumps(female_result).lower()
    ed_mentioned = "erectile" in female_text
    print(f"Female thiazide — erectile dysfunction mentioned: {'❌ YES (bug!)' if ed_mentioned else '✅ NO (correct)'}")

    # Thiazide for male — SHOULD mention erectile dysfunction
    male_thiazide = drug_service.get_drug_counseling(
        drug="hydrochlorothiazide", age=50, sex="male", dose="25mg daily"
    )
    male_thiazide_text = json.dumps(male_thiazide).lower()
    ed_for_male = "erectile" in male_thiazide_text
    print(f"Male thiazide — erectile dysfunction mentioned: {'✅ YES (correct)' if ed_for_male else '⚠️  Not mentioned (may be OK)'}")


# ── Run all tests ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("VABGENRX — COUNSELING SERVICES TEST")
    print("=" * 60)

    test_drug_counseling()
    test_condition_counseling()
    test_cache_works()
    test_sex_filtering()

    print("\n\n" + "=" * 60)
    print("✅ ALL TESTS COMPLETE")
    print("=" * 60)