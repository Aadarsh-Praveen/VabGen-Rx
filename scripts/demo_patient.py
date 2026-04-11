"""
Fix VabGen-Rx demo patients to display correctly in the IRIS FHIR portal.
Adds structured name (given/family), proper DOB, gender.

Run: python scripts/fix_demo_patients.py
"""

import requests

FHIR_BASE = "http://localhost:32783/csp/healthshare/demo/fhir/r4"
AUTH      = ("_SYSTEM", "ISCDEMO")
HEADERS   = {"Content-Type": "application/fhir+json"}

PATIENTS = [
    {
        "id":     "vabgen-IP001",
        "given":  "Apple",
        "family": "VabGenRx",
        "dob":    "1960-01-15",
        "gender": "male",
        "ip":     "IP001",
    },
    {
        "id":     "vabgen-IP005",
        "given":  "Banana",
        "family": "VabGenRx",
        "dob":    "1991-06-20",
        "gender": "male",
        "ip":     "IP005",
    },
    {
        "id":     "vabgen-IP006",
        "given":  "Cherry",
        "family": "VabGenRx",
        "dob":    "1967-03-08",
        "gender": "female",
        "ip":     "IP006",
    },
]

for p in PATIENTS:
    resource = {
        "resourceType": "Patient",
        "id":           p["id"],
        "name": [{
            "use":    "official",
            "family": p["family"],
            "given":  [p["given"]],
            "text":   f"{p['given']} {p['family']}",
        }],
        "birthDate": p["dob"],
        "gender":    p["gender"],
        "identifier": [{
            "system": "https://vabgenrx.com/patient-id",
            "value":  p["ip"],
        }],
    }

    r = requests.put(
        f"{FHIR_BASE}/Patient/{p['id']}",
        json=resource,
        auth=AUTH,
        headers=HEADERS,
    )
    if r.status_code in (200, 201):
        print(f"✅ {p['given']} ({p['id']}) updated")
    else:
        print(f"❌ {p['given']} failed: {r.status_code} {r.text[:200]}")

print("\nDone. Refresh the FHIR portal to see the changes.")