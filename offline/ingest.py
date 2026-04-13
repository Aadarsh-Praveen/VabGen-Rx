"""
VabGen-Rx — Document Ingestion Pipeline
Converts PDF/TXT documents into vector embeddings stored in the local database.
This grows the offline knowledge base without internet.

Usage:
  python scripts/ingest_document.py --file path/to/document.pdf
  python scripts/ingest_document.py --file path/to/document.txt

Called by FastAPI: POST /offline/ingest
"""

import sqlite3
import json
import re
import os
import argparse
import numpy as np
from pathlib import Path
from datetime import datetime
from sentence_transformers import SentenceTransformer

DB_PATH = Path(__file__).parent.parent / "database" / "vabgen_vectors.db"

# Load model once
_model = None

def get_model():
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def extract_text_from_pdf(file_path: str) -> str:
    """Extract text from PDF using pypdf."""
    try:
        import pypdf
        reader = pypdf.PdfReader(file_path)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        return text
    except ImportError:
        raise ImportError("pypdf not installed. Run: pip install pypdf --break-system-packages")


def extract_text_from_txt(file_path: str) -> str:
    """Read plain text file."""
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()


def extract_text(file_path: str) -> str:
    """Extract text from file based on extension."""
    ext = Path(file_path).suffix.lower()
    if ext == ".pdf":
        return extract_text_from_pdf(file_path)
    elif ext in (".txt", ".md", ".text"):
        return extract_text_from_txt(file_path)
    else:
        raise ValueError(f"Unsupported file type: {ext}. Use PDF or TXT.")


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list:
    """Split text into overlapping chunks for better semantic coverage."""
    # Clean text
    text = re.sub(r'\s+', ' ', text).strip()
    
    chunks = []
    words = text.split()
    
    i = 0
    while i < len(words):
        chunk_words = words[i:i + chunk_size]
        chunk = " ".join(chunk_words)
        if len(chunk) > 50:  # Skip very short chunks
            chunks.append(chunk)
        i += chunk_size - overlap
    
    return chunks


def detect_severity(text: str) -> str:
    """Detect severity level from chunk text."""
    text_lower = text.lower()
    if any(w in text_lower for w in ["contraindicated", "fatal", "life-threatening", "severe", "major", "do not use", "avoid"]):
        return "MAJOR"
    elif any(w in text_lower for w in ["moderate", "caution", "monitor", "reduce dose", "adjust"]):
        return "MODERATE"
    elif any(w in text_lower for w in ["minor", "minimal", "unlikely", "theoretical"]):
        return "MINOR"
    return "UNKNOWN"


def extract_drug_pair(text: str) -> str:
    """Try to extract drug names from chunk text."""
    # Look for common drug interaction patterns
    patterns = [
        r'(\w+)\s+and\s+(\w+)\s+(?:interaction|combination)',
        r'(?:interaction|combination)\s+(?:between|of)\s+(\w+)\s+and\s+(\w+)',
        r'(\w+)\s+(?:inhibits|increases|decreases|reduces)\s+.*?(\w+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return f"{match.group(1)} + {match.group(2)}"
    return "drug interaction"


def ingest_file(file_path: str, source_name: str = None) -> dict:
    """
    Main ingestion function.
    Returns: { chunks_added, source, file_name }
    """
    file_name   = Path(file_path).name
    source_name = source_name or file_name
    model       = get_model()

    print(f"📄 Ingesting: {file_name}")

    # Extract text
    print("   Extracting text...")
    text = extract_text(file_path)
    print(f"   ✅ Extracted {len(text)} characters")

    # Chunk text
    chunks = chunk_text(text, chunk_size=400, overlap=40)
    print(f"   ✅ Split into {len(chunks)} chunks")

    # Connect to database
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn   = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Ensure table exists
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS drug_interaction_vectors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            drug_pair TEXT NOT NULL,
            severity TEXT NOT NULL,
            mechanism TEXT NOT NULL,
            abstract_text TEXT NOT NULL,
            source TEXT NOT NULL,
            embedding TEXT NOT NULL
        )
    """)

    # Embed and insert chunks
    print(f"   Embedding {len(chunks)} chunks...")
    added = 0
    for i, chunk in enumerate(chunks):
        # Skip chunks that don't seem medically relevant
        medical_keywords = ["drug", "medication", "dose", "patient", "interaction",
                           "adverse", "effect", "treatment", "therapy", "clinical",
                           "mg", "contraindicated", "monitor", "risk", "warning"]
        if not any(kw in chunk.lower() for kw in medical_keywords):
            continue

        drug_pair  = extract_drug_pair(chunk)
        severity   = detect_severity(chunk)
        embedding  = model.encode(chunk).tolist()

        cursor.execute("""
            INSERT INTO drug_interaction_vectors
            (drug_pair, severity, mechanism, abstract_text, source, embedding)
            VALUES (?, ?, ?, ?, ?, ?)
        """, [
            drug_pair,
            severity,
            f"Extracted from {source_name}",
            chunk[:2000],
            source_name,
            json.dumps(embedding),
        ])
        added += 1

        if (i + 1) % 10 == 0:
            print(f"   ... {i+1}/{len(chunks)} chunks processed")

    conn.commit()

    # Get total count
    cursor.execute("SELECT COUNT(*) FROM drug_interaction_vectors")
    total = cursor.fetchone()[0]
    conn.close()

    print(f"\n✅ Ingestion complete!")
    print(f"   Chunks added: {added}")
    print(f"   Total in database: {total}")

    return {
        "chunks_added": added,
        "total_in_db":  total,
        "source":       source_name,
        "file_name":    file_name,
    }


def get_database_stats() -> dict:
    """Get current stats about the vector database."""
    if not DB_PATH.exists():
        return {"total_pairs": 0, "sources": []}

    conn   = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM drug_interaction_vectors")
    total = cursor.fetchone()[0]

    cursor.execute("SELECT DISTINCT source, COUNT(*) as cnt FROM drug_interaction_vectors GROUP BY source")
    sources = [{"source": row[0], "count": row[1]} for row in cursor.fetchall()]

    cursor.execute("SELECT severity, COUNT(*) FROM drug_interaction_vectors GROUP BY severity")
    by_severity = {row[0]: row[1] for row in cursor.fetchall()}

    conn.close()

    return {
        "total_pairs": total,
        "sources":     sources,
        "by_severity": by_severity,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest document into VabGen-Rx vector database")
    parser.add_argument("--file", required=True, help="Path to PDF or TXT file")
    parser.add_argument("--source", help="Source name (default: filename)")
    args = parser.parse_args()

    result = ingest_file(args.file, args.source)
    print(json.dumps(result, indent=2))