"""
VabGen-Rx — Local Vector Search Setup (SQLite)
Creates local vector database for offline drug interaction search.
Uses IRIS FHIR for patient data, SQLite for vector embeddings.

Run once: python scripts/setup_iris_vectors.py
"""

import sqlite3
import json
import numpy as np
from sentence_transformers import SentenceTransformer
from pathlib import Path

# ── Database path ─────────────────────────────────────────────────────────────
DB_PATH = Path(__file__).parent.parent / "database" / "vabgen_vectors.db"

DRUG_INTERACTIONS = [
    {"drug_pair": "warfarin + amiodarone", "severity": "MAJOR", "mechanism": "Amiodarone inhibits CYP2C9 and CYP3A4, significantly reducing warfarin metabolism.", "abstract_text": "Amiodarone inhibits CYP2C9 enzyme responsible for warfarin metabolism. Co-administration leads to 30-50% increase in INR. Risk of serious bleeding complications including intracranial hemorrhage. Warfarin dose reduction of 30-50% required. Monitor INR weekly for first month.", "source": "FDA_LABEL"},
    {"drug_pair": "warfarin + aspirin", "severity": "MAJOR", "mechanism": "Additive anticoagulant effect and GI bleeding risk.", "abstract_text": "Concurrent use of warfarin and aspirin increases bleeding risk through dual mechanism: aspirin inhibits platelet aggregation and displaces warfarin from protein binding sites. Risk of major GI and intracranial bleeding significantly elevated.", "source": "PUBMED"},
    {"drug_pair": "spironolactone + potassium + ckd", "severity": "MAJOR", "mechanism": "Spironolactone is a potassium-sparing diuretic. In CKD with elevated baseline potassium, risk of life-threatening hyperkalemia.", "abstract_text": "Spironolactone blocks aldosterone receptors causing potassium retention. In patients with CKD (eGFR <45) and baseline potassium >5.0 mEq/L, risk of severe hyperkalemia (K+>6.5) is high. Can cause fatal cardiac arrhythmias. Contraindicated in CKD Stage 4-5 with hyperkalemia.", "source": "FDA_LABEL"},
    {"drug_pair": "metformin + ckd + egfr", "severity": "MAJOR", "mechanism": "Metformin accumulates in renal impairment, causing lactic acidosis.", "abstract_text": "Metformin is renally cleared. In CKD with eGFR <30, metformin accumulates causing life-threatening lactic acidosis. FDA contraindicated when eGFR <30. Requires dose reduction when eGFR 30-45. Monitor renal function every 3-6 months.", "source": "FDA_LABEL"},
    {"drug_pair": "lisinopril + spironolactone + hyperkalemia", "severity": "MAJOR", "mechanism": "Both ACE inhibitors and potassium-sparing diuretics increase serum potassium.", "abstract_text": "ACE inhibitors like lisinopril reduce aldosterone production increasing potassium. Combined with spironolactone (potassium-sparing diuretic), risk of severe hyperkalemia is compounded. Especially dangerous in CKD patients. Monitor potassium levels closely.", "source": "PUBMED"},
    {"drug_pair": "fluoxetine + tramadol", "severity": "MAJOR", "mechanism": "Serotonin syndrome risk and reduced tramadol efficacy via CYP2D6 inhibition.", "abstract_text": "Fluoxetine inhibits CYP2D6 reducing tramadol conversion to active metabolite. Concurrent use risks serotonin syndrome: hyperthermia, agitation, tremor, seizures. Tramadol also lowers seizure threshold. Combination contraindicated especially in patients with seizure history.", "source": "FDA_LABEL"},
    {"drug_pair": "phenytoin + fluoxetine", "severity": "MAJOR", "mechanism": "Fluoxetine inhibits CYP2C9 increasing phenytoin levels to toxic range.", "abstract_text": "Fluoxetine and fluvoxamine inhibit CYP2C9 and CYP2C19 enzymes responsible for phenytoin metabolism. Co-administration causes phenytoin toxicity: nystagmus, ataxia, confusion, seizures paradoxically worsened. Monitor phenytoin levels. Dose reduction may be required.", "source": "PUBMED"},
    {"drug_pair": "phenytoin + tramadol", "severity": "MAJOR", "mechanism": "Tramadol lowers seizure threshold, counteracting phenytoin antiepileptic effect.", "abstract_text": "Tramadol reduces seizure threshold through opioid and serotonergic mechanisms. In epileptic patients on phenytoin, tramadol can precipitate breakthrough seizures. Risk compounded by fluoxetine-mediated CYP2D6 inhibition reducing tramadol clearance.", "source": "FDA_LABEL"},
    {"drug_pair": "warfarin + atorvastatin", "severity": "MODERATE", "mechanism": "Atorvastatin may modestly increase warfarin effect via CYP3A4 competition.", "abstract_text": "Atorvastatin competes with warfarin for CYP3A4 metabolism. Clinical studies show modest INR elevation (10-20%). Monitor INR when initiating or changing atorvastatin dose. Generally manageable with monitoring.", "source": "PUBMED"},
    {"drug_pair": "lisinopril + nsaids", "severity": "MAJOR", "mechanism": "NSAIDs reduce renal prostaglandins, blunting ACE inhibitor effect and causing acute kidney injury.", "abstract_text": "NSAIDs inhibit prostaglandin synthesis reducing renal blood flow. Combined with ACE inhibitors, causes significant reduction in GFR. Risk of acute kidney injury especially in CKD, heart failure, elderly. Avoid combination.", "source": "FDA_LABEL"},
    {"drug_pair": "furosemide + aminoglycosides", "severity": "MAJOR", "mechanism": "Additive ototoxicity and nephrotoxicity.", "abstract_text": "Both furosemide and aminoglycoside antibiotics are independently ototoxic and nephrotoxic. Combination increases risk of permanent hearing loss and acute kidney injury. Avoid concurrent use.", "source": "PUBMED"},
    {"drug_pair": "amlodipine + simvastatin", "severity": "MODERATE", "mechanism": "Amlodipine inhibits CYP3A4, increasing simvastatin levels and myopathy risk.", "abstract_text": "Amlodipine inhibits CYP3A4 increasing simvastatin AUC by 77%. Elevated simvastatin levels increase risk of myopathy and rhabdomyolysis. FDA limits simvastatin dose to 20mg when combined with amlodipine.", "source": "FDA_LABEL"},
    {"drug_pair": "warfarin + ibuprofen", "severity": "MAJOR", "mechanism": "NSAIDs displace warfarin from protein binding and increase GI bleeding risk.", "abstract_text": "Ibuprofen and other NSAIDs displace warfarin from albumin binding increasing free warfarin concentration. Also inhibit platelet aggregation and damage GI mucosa. Combination significantly increases risk of major bleeding.", "source": "FDA_LABEL"},
    {"drug_pair": "amiodarone + digoxin", "severity": "MAJOR", "mechanism": "Amiodarone increases digoxin levels by inhibiting P-glycoprotein and renal clearance.", "abstract_text": "Amiodarone inhibits P-glycoprotein and reduces renal clearance of digoxin, increasing digoxin levels by 70-100%. Risk of digoxin toxicity: nausea, visual disturbances, arrhythmias. Reduce digoxin dose by 50% when starting amiodarone.", "source": "FDA_LABEL"},
    {"drug_pair": "warfarin + fluconazole", "severity": "MAJOR", "mechanism": "Fluconazole inhibits CYP2C9, dramatically increasing warfarin levels.", "abstract_text": "Fluconazole is a potent CYP2C9 inhibitor. Co-administration increases warfarin AUC by 90% and INR dramatically. Serious bleeding risk. Monitor INR closely. Warfarin dose reduction of 25-50% often required.", "source": "FDA_LABEL"},
    {"drug_pair": "phenytoin + carbamazepine", "severity": "MODERATE", "mechanism": "Mutual enzyme induction reducing levels of both drugs.", "abstract_text": "Phenytoin and carbamazepine are both CYP enzyme inducers. Co-administration causes mutual reduction in plasma levels through enzyme induction. Seizure control may be compromised. Monitor drug levels of both.", "source": "PUBMED"},
    {"drug_pair": "lisinopril + amlodipine + hypotension", "severity": "MODERATE", "mechanism": "Additive antihypertensive effect may cause excessive hypotension.", "abstract_text": "Combining ACE inhibitor lisinopril with calcium channel blocker amlodipine provides additive antihypertensive effect. While therapeutically useful, excessive hypotension can occur, especially in elderly or volume-depleted patients.", "source": "PUBMED"},
    {"drug_pair": "metformin + alcohol", "severity": "MODERATE", "mechanism": "Alcohol increases risk of lactic acidosis with metformin.", "abstract_text": "Chronic alcohol use increases risk of lactic acidosis in patients taking metformin by affecting hepatic lactate metabolism. Advise patients to avoid excessive alcohol. Especially relevant in CKD patients.", "source": "FDA_LABEL"},
    {"drug_pair": "lisinopril + ckd + hyperkalemia", "severity": "MAJOR", "mechanism": "ACE inhibitors reduce potassium excretion. In CKD with already elevated K+, severe hyperkalemia risk.", "abstract_text": "ACE inhibitors reduce angiotensin II reducing aldosterone. This decreases renal potassium excretion. In CKD patients with baseline hyperkalemia (K+>5.0), risk of severe hyperkalemia (K+>6.5) requiring urgent treatment.", "source": "FDA_LABEL"},
    {"drug_pair": "amlodipine + metformin + diabetes", "severity": "MINOR", "mechanism": "Calcium channel blockers may slightly impair insulin secretion.", "abstract_text": "Calcium channel blockers including amlodipine may slightly impair glucose tolerance by reducing insulin secretion. Effect is modest. Monitor blood glucose periodically. Generally not clinically significant at standard doses.", "source": "PUBMED"},
]


def cosine_similarity(a, b):
    a, b = np.array(a), np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


def setup_database(db_path):
    print(f"📊 Setting up vector database at {db_path}...")
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS drug_interaction_vectors")
    cursor.execute("""
        CREATE TABLE drug_interaction_vectors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            drug_pair TEXT NOT NULL,
            severity TEXT NOT NULL,
            mechanism TEXT NOT NULL,
            abstract_text TEXT NOT NULL,
            source TEXT NOT NULL,
            embedding TEXT NOT NULL
        )
    """)
    conn.commit()
    print("   ✅ Database and table created")
    return conn


def embed_and_insert(conn, model, interactions):
    cursor = conn.cursor()
    print(f"\n🔢 Embedding {len(interactions)} drug interaction pairs...")
    for i, interaction in enumerate(interactions):
        text_to_embed = (
            f"Drug interaction: {interaction['drug_pair']}. "
            f"Severity: {interaction['severity']}. "
            f"Mechanism: {interaction['mechanism']} "
            f"{interaction['abstract_text']}"
        )
        embedding = model.encode(text_to_embed).tolist()
        cursor.execute("""
            INSERT INTO drug_interaction_vectors
            (drug_pair, severity, mechanism, abstract_text, source, embedding)
            VALUES (?, ?, ?, ?, ?, ?)
        """, [
            interaction["drug_pair"], interaction["severity"],
            interaction["mechanism"], interaction["abstract_text"],
            interaction["source"], json.dumps(embedding),
        ])
        print(f"   ✅ [{i+1}/{len(interactions)}] {interaction['drug_pair']} ({interaction['severity']})")
    conn.commit()
    print(f"\n✅ All {len(interactions)} pairs embedded and stored")


def test_vector_search(conn, model):
    print("\n🔍 Testing vector search...")
    cursor = conn.cursor()
    query = "warfarin amiodarone INR bleeding risk"
    query_embedding = model.encode(query).tolist()
    cursor.execute("SELECT drug_pair, severity, mechanism, embedding FROM drug_interaction_vectors")
    rows = cursor.fetchall()
    scored = []
    for row in rows:
        stored_embedding = json.loads(row[3])
        score = cosine_similarity(query_embedding, stored_embedding)
        scored.append((score, row[0], row[1], row[2]))
    scored.sort(reverse=True)
    top3 = scored[:3]
    print(f"   Query: '{query}'")
    print(f"   Top results:")
    for score, drug_pair, severity, mechanism in top3:
        print(f"   → {drug_pair} | {severity} | score: {score:.4f}")
    return len(top3) > 0


if __name__ == "__main__":
    print("=" * 60)
    print("VabGen-Rx — Vector Search Setup")
    print("Powers offline drug interaction checking")
    print("=" * 60)
    print("\n📦 Loading sentence-transformers model (all-MiniLM-L6-v2)...")
    model = SentenceTransformer("all-MiniLM-L6-v2")
    print("   ✅ Model loaded (384 dimensions)")
    conn = setup_database(DB_PATH)
    embed_and_insert(conn, model, DRUG_INTERACTIONS)
    success = test_vector_search(conn, model)
    conn.close()
    if success:
        print(f"\n🎉 Vector search ready for offline mode!")
        print(f"   Database: {DB_PATH}")
        print(f"   {len(DRUG_INTERACTIONS)} drug interaction pairs embedded")
    else:
        print("\n❌ Vector search test failed")