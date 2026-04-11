"""
VabGen-Rx — FHIR Patient Intake Service
Reads patient medications, lab values, allergies, and conditions
from the InterSystems IRIS FHIR R4 server.

FHIR Server: http://localhost:32783/csp/healthshare/demo/fhir/r4
Auth:        _SYSTEM / ISCDEMO

IP/OP number → FHIR patient ID mapping:
  IP001 → vabgen-IP001  (Apple)
  IP005 → vabgen-IP005  (Banana)
  IP006 → vabgen-IP006  (Cherry)
"""

import os
import requests
from typing import Dict, List, Optional

FHIR_BASE = os.getenv("FHIR_BASE_URL", "http://localhost:32783/csp/healthshare/demo/fhir/r4")
FHIR_AUTH = (
    os.getenv("IRIS_USERNAME", "_SYSTEM"),
    os.getenv("IRIS_PASSWORD", "ISCDEMO"),
)
HEADERS = {"Accept": "application/fhir+json"}

# ── Map VabGen-Rx patient numbers to FHIR patient IDs ────────────────────────
# Add new patients here as needed
PATIENT_ID_MAP: Dict[str, str] = {
    "IP001": "vabgen-IP001",   # Apple   — T2DM + HTN + CKD3
    "IP005": "vabgen-IP005",   # Banana  — Epilepsy + Depression
    "IP006": "vabgen-IP006",   # Cherry  — AF + HTN + Hyperlipidemia
    # OP patients can be added the same way:
    # "OP001": "vabgen-OP001",
}


def resolve_fhir_id(patient_no: str) -> Optional[str]:
    """
    Convert a VabGen-Rx IP/OP number to a FHIR patient ID.
    Returns None if the patient is not in the FHIR server.
    """
    return PATIENT_ID_MAP.get(str(patient_no).strip().upper())


def get_patient_data(patient_no: str) -> Dict:
    """
    Main entry point — returns full patient context for VabGen-Rx analysis.
    Accepts the IP/OP number from VabGen-Rx and maps to FHIR automatically.
    """
    fhir_id = resolve_fhir_id(patient_no)
    if not fhir_id:
        return {
            "patient_no": patient_no,
            "fhir_found": False,
            "error": f"Patient {patient_no} not found in FHIR server. "
                     f"Available: {list(PATIENT_ID_MAP.keys())}",
            "medications": [],
            "lab_values":  {},
            "allergies":   [],
            "conditions":  [],
        }

    return {
        "patient_no":  patient_no,
        "fhir_id":     fhir_id,
        "fhir_found":  True,
        "medications": _get_medications(fhir_id),
        "lab_values":  _get_lab_values(fhir_id),
        "allergies":   _get_allergies(fhir_id),
        "conditions":  _get_conditions(fhir_id),
    }


def _get_medications(fhir_id: str) -> List[str]:
    """Reads active MedicationRequest resources."""
    r = requests.get(
        f"{FHIR_BASE}/MedicationRequest",
        params={"subject": f"Patient/{fhir_id}", "status": "active"},
        auth=FHIR_AUTH, headers=HEADERS, timeout=10,
    )
    r.raise_for_status()
    meds = []
    for e in r.json().get("entry", []):
        med  = e.get("resource", {}).get("medicationCodeableConcept", {})
        name = med.get("text") or med.get("coding", [{}])[0].get("display", "")
        if name:
            meds.append(name)
    return meds


def _get_lab_values(fhir_id: str) -> Dict:
    """
    Reads lab Observations using LOINC codes:
      33914-3 = eGFR
      2823-3  = Potassium
      1975-2  = Bilirubin
      11580-8 = TSH
      2951-2  = Sodium
    """
    loinc_map = {
        "33914-3": "egfr",
        "2823-3":  "potassium",
        "1975-2":  "bilirubin",
        "11580-8": "tsh",
        "2951-2":  "sodium",
    }
    labs = {}
    for loinc, label in loinc_map.items():
        r = requests.get(
            f"{FHIR_BASE}/Observation",
            params={
                "subject": f"Patient/{fhir_id}",
                "code":    loinc,
                "_sort":   "-date",
                "_count":  1,
            },
            auth=FHIR_AUTH, headers=HEADERS, timeout=10,
        )
        r.raise_for_status()
        entries = r.json().get("entry", [])
        if entries:
            val = entries[0]["resource"].get("valueQuantity", {}).get("value")
            if val is not None:
                labs[label] = val
    return labs


def _get_allergies(fhir_id: str) -> List[str]:
    """Reads AllergyIntolerance resources."""
    r = requests.get(
        f"{FHIR_BASE}/AllergyIntolerance",
        params={"patient": f"Patient/{fhir_id}"},
        auth=FHIR_AUTH, headers=HEADERS, timeout=10,
    )
    r.raise_for_status()
    return [
        e["resource"].get("code", {}).get("text", "Unknown")
        for e in r.json().get("entry", [])
    ]


def _get_conditions(fhir_id: str) -> List[str]:
    """Reads active Condition resources."""
    r = requests.get(
        f"{FHIR_BASE}/Condition",
        params={"subject": f"Patient/{fhir_id}", "clinical-status": "active"},
        auth=FHIR_AUTH, headers=HEADERS, timeout=10,
    )
    r.raise_for_status()
    return [
        e["resource"].get("code", {}).get("text", "Unknown")
        for e in r.json().get("entry", [])
    ]