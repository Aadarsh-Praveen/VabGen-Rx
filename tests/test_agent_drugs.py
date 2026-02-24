"""
Test VabGenRx Agent with new drugs not in Azure SQL cache.
Edit the test cases below and run:
    python tests/test_agent_new_drugs.py
"""

import os
import sys
import json

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.getcwd())

from services.vabgenrx_agent import VabGenRxAgentService

service = VabGenRxAgentService()

# ── Test Cases — all brand new, not in cache yet ──────────────────────────────

test_cases = [

    # Test 1: Common diabetes + blood pressure combo
    {
        "name":        "Diabetes patient on multiple meds",
        "medications": ["metformin", "lisinopril"],
        "diseases":    ["diabetes", "hypertension"],
        "foods":       ["grapefruit"]
    },

    # Test 2: Classic dangerous combo
    {
        "name":        "Antibiotic + anticoagulant",
        "medications": ["amoxicillin", "warfarin"],
        "diseases":    ["infection"],
        "foods":       []
    },

    # Test 3: Statin + grapefruit interaction
    {
        "name":        "Statin patient",
        "medications": ["atorvastatin"],
        "diseases":    ["high cholesterol"],
        "foods":       ["grapefruit", "orange juice"]
    },

    # Test 4: Three drug combo
    {
        "name":        "Heart patient on three drugs",
        "medications": ["aspirin", "metoprolol", "lisinopril"],
        "diseases":    ["heart failure"],
        "foods":       ["bananas"]
    },

]

# ── Run one test at a time ────────────────────────────────────────────────────

# Change this index to run different tests (0, 1, 2, or 3)
TEST_INDEX = 0

test = test_cases[TEST_INDEX]

print("=" * 60)
print(f"TEST: {test['name']}")
print("=" * 60)

result = service.analyze(
    medications = test["medications"],
    diseases    = test["diseases"],
    foods       = test["foods"]
)

print("\n📊 RESULT:")
if "analysis" in result:
    analysis = result["analysis"]
    print(json.dumps(analysis, indent=2))

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    for ddi in analysis.get("drug_drug", []):
        cache_status = "💾 FROM CACHE" if ddi.get("from_cache") else "🔬 FRESH ANALYSIS"
        print(f"  {ddi['drug1']} + {ddi['drug2']}: {ddi['severity'].upper()} {cache_status}")

    risk = analysis.get("risk_summary", {})
    print(f"\n  Risk Level: {risk.get('level', 'UNKNOWN')}")
    print(f"  Severe DDI: {risk.get('severe_count', 0)}")
    print(f"  Contraindicated: {risk.get('contraindicated_count', 0)}")

else:
    print("Raw:", result.get("raw", "No response"))
    if "error" in result:
        print("Error:", result["error"])