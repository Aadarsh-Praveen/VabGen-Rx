"""
One-time script — loads all VabGen-Rx demo patients into
the InterSystems IRIS FHIR server.

Run once: python scripts/load_demo_patients.py

Patients:
  IP001 — Apple,  65M, T2DM + HTN + CKD3,  Metformin + Amlodipine
  IP005 — Banana, 34M, Epilepsy + Depression, Phenytoin + Fluoxetine
  IP006 — Cherry, 58F, AF + HTN + Hyperlipidemia, Warfarin + Atorvastatin + Lisinopril

Demo interactions (new drug to prescribe):
  IP001 → Spironolactone  (K+ 5.6 + eGFR 38 = hyperkalemia MAJOR)
  IP005 → Tramadol        (Fluoxetine = serotonin syndrome MAJOR)
  IP006 → Amiodarone      (Warfarin = INR spike MAJOR)
"""

import requests
import json

FHIR_BASE = "http://localhost:32783/csp/healthshare/demo/fhir/r4"
AUTH      = ("_SYSTEM", "ISCDEMO")
HEADERS   = {"Content-Type": "application/fhir+json"}


def make_bundle(patient_id, name, dob, gender, medications, labs, allergies, conditions):
    """Build a FHIR transaction bundle for one patient."""
    entries = []

    # ── Patient resource ──────────────────────────────────────────────────────
    entries.append({
        "resource": {
            "resourceType": "Patient",
            "id":           patient_id,
            "name":         [{"text": name}],
            "birthDate":    dob,
            "gender":       gender,
        },
        "request": {"method": "PUT", "url": f"Patient/{patient_id}"},
    })

    # ── Medications ───────────────────────────────────────────────────────────
    for drug in medications:
        entries.append({
            "resource": {
                "resourceType": "MedicationRequest",
                "status":       "active",
                "intent":       "order",
                "subject":      {"reference": f"Patient/{patient_id}"},
                "medicationCodeableConcept": {"text": drug},
            },
            "request": {"method": "POST", "url": "MedicationRequest"},
        })

    # ── Lab values ────────────────────────────────────────────────────────────
    LOINC = {
        "egfr":      ("33914-3", "eGFR",      "mL/min/1.73m2"),
        "potassium": ("2823-3",  "Potassium",  "mEq/L"),
        "sodium":    ("2951-2",  "Sodium",     "mEq/L"),
        "bilirubin": ("1975-2",  "Bilirubin",  "mg/dL"),
        "tsh":       ("11580-8", "TSH",        "mIU/L"),
    }
    for key, value in labs.items():
        if key not in LOINC:
            continue
        code, display, unit = LOINC[key]
        entries.append({
            "resource": {
                "resourceType": "Observation",
                "status":       "final",
                "subject":      {"reference": f"Patient/{patient_id}"},
                "code": {
                    "coding": [{"system": "http://loinc.org", "code": code, "display": display}]
                },
                "valueQuantity": {"value": value, "unit": unit},
            },
            "request": {"method": "POST", "url": "Observation"},
        })

    # ── Allergies ─────────────────────────────────────────────────────────────
    for allergy in allergies:
        entries.append({
            "resource": {
                "resourceType": "AllergyIntolerance",
                "patient":      {"reference": f"Patient/{patient_id}"},
                "code":         {"text": allergy},
                "clinicalStatus": {
                    "coding": [{"system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", "code": "active"}]
                },
            },
            "request": {"method": "POST", "url": "AllergyIntolerance"},
        })

    # ── Conditions ────────────────────────────────────────────────────────────
    for condition in conditions:
        entries.append({
            "resource": {
                "resourceType": "Condition",
                "subject":      {"reference": f"Patient/{patient_id}"},
                "code":         {"text": condition},
                "clinicalStatus": {
                    "coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-clinical", "code": "active"}]
                },
            },
            "request": {"method": "POST", "url": "Condition"},
        })

    return {"resourceType": "Bundle", "type": "transaction", "entry": entries}


# ── Patient definitions ───────────────────────────────────────────────────────

PATIENTS = [
    {
        "patient_id":  "vabgen-IP001",
        "name":        "Apple",
        "dob":         "1960-01-01",
        "gender":      "male",
        "medications": ["Metformin", "Amlodipine"],
        "labs": {
            "egfr":      38,
            "potassium": 5.6,
            "sodium":    128,
            "bilirubin": 2.1,
            "tsh":       7.8,
        },
        "allergies":  [],
        "conditions": ["Type 2 Diabetes Mellitus", "Hypertension", "Chronic Kidney Disease Stage 3"],
        "ip_no":      "IP001",
        "demo_drug":  "Spironolactone",
        "interaction": "Spironolactone + eGFR 38 + K+ 5.6 → MAJOR hyperkalemia risk",
    },
    {
        "patient_id":  "vabgen-IP005",
        "name":        "Banana",
        "dob":         "1991-01-01",
        "gender":      "male",
        "medications": ["Phenytoin", "Fluoxetine"],
        "labs": {
            "egfr":      95,
            "potassium": 3.2,
            "sodium":    138,
            "bilirubin": 0.7,
            "tsh":       2.1,
        },
        "allergies":  [],
        "conditions": ["Epilepsy", "Depression"],
        "ip_no":      "IP005",
        "demo_drug":  "Tramadol",
        "interaction": "Tramadol + Fluoxetine → MAJOR serotonin syndrome risk",
    },
    {
        "patient_id":  "vabgen-IP006",
        "name":        "Cherry",
        "dob":         "1967-01-01",
        "gender":      "female",
        "medications": ["Warfarin", "Atorvastatin", "Lisinopril"],
        "labs": {
            "egfr":      72,
            "potassium": 4.1,
            "sodium":    135,
            "bilirubin": 0.8,
            "tsh":       2.3,
        },
        "allergies":  [],
        "conditions": ["Atrial Fibrillation", "Hypertension", "Hyperlipidemia"],
        "ip_no":      "IP006",
        "demo_drug":  "Amiodarone",
        "interaction": "Amiodarone + Warfarin → MAJOR INR spike (CYP2C9 inhibition)",
    },
]


# ── Load each patient ─────────────────────────────────────────────────────────

def load_patient(p):
    print(f"\n🏥 Loading {p['name']} ({p['ip_no']})...")
    bundle = make_bundle(
        patient_id  = p["patient_id"],
        name        = p["name"],
        dob         = p["dob"],
        gender      = p["gender"],
        medications = p["medications"],
        labs        = p["labs"],
        allergies   = p["allergies"],
        conditions  = p["conditions"],
    )
    r = requests.post(f"{FHIR_BASE}/", json=bundle, auth=AUTH, headers=HEADERS)
    if r.status_code in (200, 201):
        print(f"   ✅ {p['name']} loaded successfully")
        print(f"   📋 Meds: {', '.join(p['medications'])}")
        print(f"   🧪 eGFR: {p['labs']['egfr']} | K+: {p['labs'].get('potassium', '—')}")
        print(f"   🎯 Demo drug: {p['demo_drug']}")
        print(f"   ⚠️  Expected: {p['interaction']}")
    else:
        print(f"   ❌ Failed ({r.status_code}): {r.text[:300]}")


if __name__ == "__main__":
    print("=" * 60)
    print("VabGen-Rx — Loading demo patients into IRIS FHIR server")
    print("=" * 60)
    for patient in PATIENTS:
        load_patient(patient)
    print("\n✅ All patients loaded.")
    print("\nFHIR ID mapping:")
    for p in PATIENTS:
        print(f"  {p['ip_no']} → {p['patient_id']}")