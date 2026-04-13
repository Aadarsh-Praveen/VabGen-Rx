"""
VabGen-Rx — Offline Analysis Pipeline (Full 5-Section, Parallel)
Drug-Drug, Drug-Disease, Drug-Food, Dosing, Counselling
Powered by local Vector Search + Gemma 3 4B
Parallel execution for ~4x speed improvement
"""

import sqlite3
import json
import numpy as np
import requests
import os
from pathlib import Path
from sentence_transformers import SentenceTransformer
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

DB_PATH     = Path(__file__).parent.parent / "database" / "vabgen_vectors.db"
OLLAMA_URL  = os.getenv("OLLAMA_URL", "http://localhost:11434")
GEMMA_MODEL = os.getenv("GEMMA_MODEL", "gemma3:4b")
AUDIT_DB    = Path(__file__).parent.parent / "database" / "offline_audit.db"

print("📦 Loading offline embedding model...")
_model = SentenceTransformer("all-MiniLM-L6-v2")
print("   ✅ Embedding model ready")


def cosine_similarity(a, b):
    a, b = np.array(a), np.array(b)
    norm = np.linalg.norm(a) * np.linalg.norm(b)
    return float(np.dot(a, b) / norm) if norm > 0 else 0.0


def vector_search(query: str, top_k: int = 3) -> list:
    query_embedding = _model.encode(query).tolist()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT drug_pair, severity, mechanism, abstract_text, source, embedding FROM drug_interaction_vectors")
    rows = cursor.fetchall()
    conn.close()
    scored = []
    for row in rows:
        stored = json.loads(row[5])
        score = cosine_similarity(query_embedding, stored)
        scored.append({"score": score, "drug_pair": row[0], "severity": row[1],
                        "mechanism": row[2], "abstract_text": row[3], "source": row[4]})
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_k]


def call_gemma(prompt: str, max_tokens: int = 600) -> str:
    response = requests.post(
        f"{OLLAMA_URL}/api/generate",
        json={"model": GEMMA_MODEL, "prompt": prompt, "stream": False,
              "options": {"temperature": 0.1, "num_predict": max_tokens}},
        timeout=120,
    )
    response.raise_for_status()
    return response.json().get("response", "")


def parse_json_response(raw: str) -> dict:
    try:
        start = raw.find("{")
        end   = raw.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(raw[start:end])
    except Exception:
        pass
    return {}


def parse_json_array(raw: str) -> list:
    try:
        start = raw.find("[")
        end   = raw.rfind("]") + 1
        if start >= 0 and end > start:
            return json.loads(raw[start:end])
    except Exception:
        pass
    return []



def translate_fields(items: list, language: str, fields_to_translate: list) -> list:
    """Translate specific text fields in a list of dicts using Gemma."""
    if not language or language.lower() in ("english", "en", ""):
        return items
    if not items:
        return items

    # Build translation prompt with all text to translate at once
    texts_to_translate = []
    for i, item in enumerate(items):
        for field in fields_to_translate:
            val = item.get(field, "")
            if val and isinstance(val, str) and len(val) > 3:
                texts_to_translate.append(f"[{i}:{field}] {val}")

    if not texts_to_translate:
        return items

    prompt = f"""Translate the following medical texts to {language}.
Rules:
- Keep all drug names in English (Warfarin, Metformin, Spironolactone, etc.)
- Keep severity words in English (MAJOR, MODERATE, MINOR)
- Translate everything else to {language}
- Return ONLY the translations, one per line, keeping the [index:field] prefix exactly

Texts to translate:
{chr(10).join(texts_to_translate)}

Translated versions (keep [index:field] prefix):"""

    try:
        raw = call_gemma(prompt, max_tokens=1200)
        lines = [l.strip() for l in raw.strip().split("\n") if l.strip()]

        translated_map = {}
        for line in lines:
            if line.startswith("[") and "]" in line:
                bracket_end = line.index("]")
                key = line[1:bracket_end]
                value = line[bracket_end+1:].strip()
                if ":" in key:
                    idx_str, field = key.split(":", 1)
                    try:
                        translated_map[(int(idx_str), field)] = value
                    except ValueError:
                        pass

        # Apply translations
        result = []
        for i, item in enumerate(items):
            new_item = dict(item)
            for field in fields_to_translate:
                if (i, field) in translated_map and translated_map[(i, field)]:
                    new_item[field] = translated_map[(i, field)]
            result.append(new_item)
        return result
    except Exception as e:
        print(f"   Translation failed: {e}")
        return items


def lang_instruction(language: str) -> str:
    """Returns language instruction for Gemma prompt."""
    if not language or language.lower() in ("english", "en", ""):
        return ""
    return f"""

CRITICAL LANGUAGE INSTRUCTION:
- You MUST write ALL text values in {language} language.
- This applies to: mechanism, clinical_effects, recommendation, reason, effect, instruction, title, monitoring, hold_if, current_typical_dose, recommended_dose fields.
- Do NOT translate drug names. Keep ALL drug names in English exactly as written (e.g. Warfarin, Metformin, Spironolactone stay in English).
- Do NOT translate severity values (MAJOR, MODERATE, MINOR, UNKNOWN, CONTRAINDICATED — keep these in English).
- Do NOT translate category values (TIMING, SIDE_EFFECTS, WARNINGS, LIFESTYLE, MONITORING — keep in English).
- Every other text string MUST be written in {language}.
- This is for patient counselling in a rural clinic where patients speak {language}."""


def write_audit_log(entry: dict):
    AUDIT_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(AUDIT_DB)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS offline_audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            patient_no TEXT,
            new_drug TEXT NOT NULL,
            existing_meds TEXT NOT NULL,
            result_severity TEXT,
            mode TEXT DEFAULT 'offline',
            synced INTEGER DEFAULT 0
        )
    """)
    cursor.execute("""
        INSERT INTO offline_audit (timestamp, patient_no, new_drug, existing_meds, result_severity, mode)
        VALUES (?, ?, ?, ?, ?, ?)
    """, [
        datetime.now(timezone.utc).isoformat(),
        entry.get("patient_no", ""),
        entry.get("new_drug", ""),
        json.dumps(entry.get("existing_meds", [])),
        entry.get("severity", "UNKNOWN"),
        "offline",
    ])
    conn.commit()
    conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 1 — DRUG-DRUG
# ══════════════════════════════════════════════════════════════════════════════

def analyze_drug_drug(new_drug, existing_meds, age, sex, egfr, potassium, conditions, language=""):
    results = []
    for med in existing_meds:
        if new_drug.lower().strip() == med.lower().strip():
            continue

        query_parts = [f"{new_drug} {med} drug interaction"]
        if egfr and egfr < 45:      query_parts.append(f"CKD eGFR {egfr} renal impairment")
        if potassium and potassium > 5.0: query_parts.append(f"hyperkalemia potassium {potassium}")
        for c in (conditions or []): query_parts.append(c)

        relevant = vector_search(" ".join(query_parts), top_k=3)

        if not relevant or relevant[0]["score"] < 0.25:
            results.append({
                "drug1": new_drug.title(), "drug2": med.title(),
                "severity": "unknown", "confidence": 0.0,
                "mechanism": "No evidence found in offline database.",
                "clinical_effects": "Unable to assess — verify when connectivity restored.",
                "recommendation": "Apply clinical caution.",
                "evidence_level": "offline-no-data", "offline_mode": True,
            })
            continue

        evidence_context = "\n".join([
            f"Evidence {i+1}: {r['drug_pair']} | {r['severity']} | {r['mechanism']} | {r['abstract_text']}"
            for i, r in enumerate(relevant)
        ])
        lab_ctx = ""
        if egfr:      lab_ctx += f"Patient eGFR: {egfr} mL/min/1.73m2. "
        if potassium: lab_ctx += f"Patient K+: {potassium} mEq/L. "

        prompt = f"""You are a clinical pharmacist analyzing drug interactions.

Patient: Age {age}, Sex {sex}. {lab_ctx}
Conditions: {', '.join(conditions or []) or 'Not specified'}.
New drug: {new_drug} | Existing: {med}

Evidence:
{evidence_context}

Respond ONLY with this JSON:{lang_instruction(language)}
{{
  "severity": "MAJOR or MODERATE or MINOR or UNKNOWN",
  "confidence": 0.85,
  "mechanism": "1-2 sentence mechanism",
  "clinical_effects": "1-2 sentence clinical effect for this patient",
  "recommendation": "1-2 sentence recommendation for doctor"
}}"""

        try:
            raw = call_gemma(prompt)
            parsed = parse_json_response(raw)
            results.append({
                "drug1": new_drug.title(), "drug2": med.title(),
                "severity": parsed.get("severity", "UNKNOWN").upper(),
                "confidence": parsed.get("confidence", 0.7),
                "mechanism": parsed.get("mechanism", ""),
                "clinical_effects": parsed.get("clinical_effects", ""),
                "recommendation": parsed.get("recommendation", ""),
                "evidence_level": f"offline-vector (score: {relevant[0]['score']:.2f})",
                "offline_mode": True,
            })
        except Exception:
            results.append({
                "drug1": new_drug.title(), "drug2": med.title(),
                "severity": relevant[0]["severity"] if relevant else "UNKNOWN",
                "confidence": relevant[0]["score"] if relevant else 0.0,
                "mechanism": relevant[0]["mechanism"] if relevant else "",
                "clinical_effects": relevant[0]["abstract_text"][:300] if relevant else "",
                "recommendation": "Verify when connectivity restored.",
                "evidence_level": "offline-vector-fallback", "offline_mode": True,
            })
    return results


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 2 — DRUG-DISEASE
# ══════════════════════════════════════════════════════════════════════════════

def analyze_drug_disease(new_drug, conditions, age, egfr, potassium, language=""):
    if not conditions:
        return []
    prompt = f"""You are a clinical pharmacist checking drug-disease contraindications.

Patient: Age {age}. eGFR: {egfr or 'unknown'}. K+: {potassium or 'unknown'}.
New drug: {new_drug}
Conditions: {', '.join(conditions)}

Respond ONLY with JSON array:{lang_instruction(language)}
[
  {{
    "condition": "condition name",
    "contraindicated": true or false,
    "severity": "CONTRAINDICATED or MODERATE or MINOR",
    "reason": "1-2 sentences why",
    "recommendation": "1 sentence action",
    "alternatives": ["alt1", "alt2"]
  }}
]
Only include conditions with meaningful interactions."""

    try:
        raw = call_gemma(prompt, max_tokens=700)
        items = parse_json_array(raw)
        return [{
            "drug": new_drug.title(),
            "condition": item.get("condition", ""),
            "contraindicated": item.get("contraindicated", False),
            "severity": item.get("severity", "MODERATE"),
            "reason": item.get("reason", ""),
            "recommendation": item.get("recommendation", ""),
            "alternatives": item.get("alternatives", []),
            "offline_mode": True,
        } for item in items]
    except Exception:
        return []


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 3 — DRUG-FOOD
# ══════════════════════════════════════════════════════════════════════════════

def analyze_drug_food(new_drug, existing_meds, language=""):
    all_drugs = [new_drug] + existing_meds
    prompt = f"""You are a clinical pharmacist checking drug-food interactions.

Drugs: {', '.join(all_drugs)}

Respond ONLY with JSON array (max 6 items):{lang_instruction(language)}
[
  {{
    "drug": "drug name",
    "food": "food or drink name",
    "severity": "MAJOR or MODERATE or MINOR",
    "effect": "1 sentence effect",
    "recommendation": "1 sentence patient instruction"
  }}
]
Only clinically significant interactions."""

    try:
        raw = call_gemma(prompt, max_tokens=500)
        items = parse_json_array(raw)
        return [{
            "drug": item.get("drug", "").title(),
            "food": item.get("food", ""),
            "severity": item.get("severity", "MODERATE"),
            "effect": item.get("effect", ""),
            "recommendation": item.get("recommendation", ""),
            "offline_mode": True,
        } for item in items]
    except Exception:
        return []


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 4 — DOSING
# ══════════════════════════════════════════════════════════════════════════════

def analyze_dosing(new_drug, existing_meds, age, sex, egfr, potassium, conditions, language=""):
    all_drugs = [new_drug] + existing_meds
    lab_ctx = ""
    if egfr:      lab_ctx += f"eGFR: {egfr} ({'CKD4' if egfr<30 else 'CKD3' if egfr<60 else 'Normal'}). "
    if potassium: lab_ctx += f"K+: {potassium} ({'HIGH' if potassium>5.0 else 'Normal'}). "

    prompt = f"""You are a clinical pharmacist providing dosing recommendations.

Patient: Age {age}, {sex}. {lab_ctx}
Conditions: {', '.join(conditions or []) or 'Not specified'}.
Drugs: {', '.join(all_drugs)}

Respond ONLY with JSON array (max 4 items):{lang_instruction(language)}
[
  {{
    "drug": "drug name",
    "priority": "HIGH or MEDIUM",
    "adjustment_type": "RENAL_ADJUSTMENT or AGE_ADJUSTMENT or STANDARD",
    "current_typical_dose": "standard dose",
    "recommended_dose": "adjusted dose for this patient",
    "reason": "1-2 sentence reason",
    "monitoring": "what to monitor",
    "hold_if": "condition to hold"
  }}
]
Only include drugs needing adjustment."""

    try:
        raw = call_gemma(prompt, max_tokens=700)
        items = parse_json_array(raw)
        return [{
            "drug": item.get("drug", "").title(),
            "priority": item.get("priority", "MEDIUM"),
            "adjustment_type": item.get("adjustment_type", "STANDARD"),
            "current_typical_dose": item.get("current_typical_dose", ""),
            "recommended_dose": item.get("recommended_dose", ""),
            "reason": item.get("reason", ""),
            "monitoring": item.get("monitoring", ""),
            "hold_if": item.get("hold_if", ""),
            "lab_values": {"egfr": egfr, "potassium": potassium},
            "offline_mode": True,
        } for item in items]
    except Exception:
        return []


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 5 — DRUG COUNSELLING (no condition counselling)
# ══════════════════════════════════════════════════════════════════════════════

def analyze_counselling(new_drug, existing_meds, age, conditions, language=""):
    all_drugs = [new_drug] + existing_meds
    prompt = f"""You are a clinical pharmacist writing patient counselling points.

Patient: Age {age}. Conditions: {', '.join(conditions or []) or 'Not specified'}.
Drugs: {', '.join(all_drugs)}

Write clear patient counselling for these drugs (2-3 points per drug, max 10 total).
Use simple language a patient can understand.
Respond ONLY with JSON array:{lang_instruction(language)}
[
  {{
    "drug": "drug name in English",
    "category": "TIMING or SIDE_EFFECTS or WARNINGS or LIFESTYLE or MONITORING",
    "title": "short title",
    "instruction": "clear patient instruction in 1-2 sentences"
  }}
]"""

    try:
        raw = call_gemma(prompt, max_tokens=800)
        items = parse_json_array(raw)
        return [{
            "drug": item.get("drug", "").title(),
            "category": item.get("category", "GENERAL"),
            "title": item.get("title", ""),
            "instruction": item.get("instruction", ""),
            "offline_mode": True,
        } for item in items]
    except Exception:
        return []


# ══════════════════════════════════════════════════════════════════════════════
# MAIN ORCHESTRATOR — PARALLEL EXECUTION
# ══════════════════════════════════════════════════════════════════════════════

def offline_analyze(
    new_drug: str,
    existing_meds: list,
    age: int = 45,
    sex: str = "unknown",
    egfr: float = None,
    potassium: float = None,
    conditions: list = None,
    patient_no: str = "",
    language: str = "",
) -> dict:
    conditions = conditions or []
    print(f"\n🔍 Offline analysis: {new_drug} | language: {language or 'English'}")

    # ── Run all 5 sections in PARALLEL ────────────────────────────────────────
    results = {}
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {
            executor.submit(analyze_drug_drug,    new_drug, existing_meds, age, sex, egfr, potassium, conditions, language): "drug_drug",
            executor.submit(analyze_drug_disease,  new_drug, conditions, age, egfr, potassium, language):                     "drug_disease",
            executor.submit(analyze_drug_food,     new_drug, existing_meds, language):                                        "drug_food",
            executor.submit(analyze_dosing,        new_drug, existing_meds, age, sex, egfr, potassium, conditions, language): "dosing",
            executor.submit(analyze_counselling,   new_drug, existing_meds, age, conditions, language):                       "counselling",
        }
        for future in as_completed(futures):
            key = futures[future]
            try:
                results[key] = future.result()
                print(f"   ✅ {key} done")
            except Exception as e:
                print(f"   ❌ {key} failed: {e}")
                results[key] = []

    drug_drug    = results.get("drug_drug", [])
    drug_disease = results.get("drug_disease", [])
    drug_food    = results.get("drug_food", [])
    dosing       = results.get("dosing", [])
    counselling  = results.get("counselling", [])

    severities           = [r["severity"] for r in drug_drug]
    has_contraindicated  = any(r.get("contraindicated") for r in drug_disease)
    risk_level = (
        "HIGH"     if "MAJOR" in severities or has_contraindicated else
        "MODERATE" if "MODERATE" in severities else
        "LOW"
    )

    write_audit_log({
        "patient_no": patient_no, "new_drug": new_drug,
        "existing_meds": existing_meds, "severity": risk_level,
    })

    # ── Translation: counselling only, stored in separate field ─────────────
    # Clinical content (Drug-Drug, Drug-Disease, Drug-Food, Dosing) stays in
    # English for doctor review. Only counselling gets translated for the patient.
    translated_counselling = None
    if language and language.lower() not in ("english", "en", ""):
        print(f"   🌐 Translating counselling to {language} for patient...")
        translated_counselling = translate_fields(counselling, language,
            ["title", "instruction"])
        print(f"   ✅ Counselling translated to {language}")

    return {
        "session_id":   f"offline-{datetime.now(timezone.utc).strftime('%H%M%S')}",
        "mode":         "offline",
        "new_drug":     new_drug.title(),
        "language":     language or "English",
        "medications":  [m.title() for m in existing_meds] + [new_drug.title()],
        "drug_drug":    drug_drug,
        "drug_disease": drug_disease,
        "drug_food":    drug_food,
        "dosing":       dosing,
        "counselling":           counselling,
        "translated_counselling": translated_counselling,
        "risk_summary": {
            "level":              risk_level,
            "severe_ddi_count":   sum(1 for r in drug_drug    if r["severity"] == "MAJOR"),
            "moderate_ddi_count": sum(1 for r in drug_drug    if r["severity"] == "MODERATE"),
            "contraindicated":    sum(1 for r in drug_disease if r.get("contraindicated")),
            "drug_disease_count": len(drug_disease),
            "drug_food_count":    len(drug_food),
            "dosing_alerts":      len([d for d in dosing      if d["priority"] == "HIGH"]),
            "counselling_points": len(counselling),
            "offline_mode":       True,
            "evidence_source":    "InterSystems IRIS Vector Search + Gemma 3 4B",
        },
    }


if __name__ == "__main__":
    import time
    print("\n🧪 Testing parallel offline pipeline...")
    t = time.time()
    result = offline_analyze(
        new_drug="Spironolactone",
        existing_meds=["Metformin", "Amlodipine", "Lisinopril"],
        age=65, sex="male", egfr=38, potassium=5.6,
        conditions=["CKD Stage 3", "Hypertension", "Type 2 Diabetes"],
        patient_no="IP001-test",
        language="Hindi",
    )
    elapsed = time.time() - t
    print(f"\n✅ Completed in {elapsed:.1f}s")
    print(f"   Risk: {result['risk_summary']['level']}")
    print(f"   Drug-Drug: {len(result['drug_drug'])}")
    print(f"   Drug-Disease: {len(result['drug_disease'])}")
    print(f"   Drug-Food: {len(result['drug_food'])}")
    print(f"   Dosing: {len(result['dosing'])}")
    print(f"   Counselling: {len(result['counselling'])}")