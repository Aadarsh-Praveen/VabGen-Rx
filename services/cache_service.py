"""
Azure SQL Cache Service — VabGenRx
Caches drug-drug, drug-disease, and drug-food results
to avoid redundant PubMed/FDA/OpenAI calls.

Uses shared persistent connection from db_connection.py
to avoid Login timeout errors from creating new connections
on every cache call.
"""

import json
import os
from datetime import datetime
from typing import Dict, Optional
from dotenv import load_dotenv

load_dotenv()

CACHE_TTL_DAYS = int(os.getenv("CACHE_TTL_DAYS", 30))


class AzureSQLCacheService:

    def __init__(self):
        self.available = self._test_connection()

    # ── Connection — uses shared persistent connection ────────────────────────

    def _test_connection(self) -> bool:
        try:
            from services.db_connection import get_connection
            conn = get_connection()  # already prints ✅ on first connect only
            conn.cursor().execute("SELECT 1")
            return True
        except Exception as e:
            print(f"⚠️  Azure SQL Cache unavailable: {e}")
            print("   Running without cache (results won't be stored)")
            return False

    def _conn(self):
        """
        Returns the shared persistent connection.
        Falls back to a fresh pyodbc connection if shared connection fails.
        """
        try:
            from services.db_connection import get_connection
            return get_connection()
        except Exception:
            # Fallback — direct connection
            import pyodbc
            conn_str = (
                f"DRIVER={{ODBC Driver 18 for SQL Server}};"
                f"SERVER={os.getenv('AZURE_SQL_SERVER')};"
                f"DATABASE={os.getenv('AZURE_SQL_DATABASE')};"
                f"UID={os.getenv('AZURE_SQL_USERNAME')};"
                f"PWD={os.getenv('AZURE_SQL_PASSWORD')}"
            )
            return pyodbc.connect(conn_str, timeout=10)

    # ── Drug-Drug Cache ───────────────────────────────────────────────────────

    def get_drug_drug(self, drug1: str, drug2: str) -> Optional[Dict]:
        if not self.available:
            return None
        d1, d2 = sorted([drug1.lower(), drug2.lower()])
        try:
            conn = self._conn()
            cur  = conn.cursor()
            cur.execute("""
                SELECT full_result, cached_at, access_count
                FROM interaction_cache
                WHERE drug1 = ? AND drug2 = ?
                  AND DATEDIFF(day, cached_at, GETDATE()) < ?
            """, d1, d2, CACHE_TTL_DAYS)
            row = cur.fetchone()
            if row:
                cur.execute("""
                    UPDATE interaction_cache
                    SET access_count  = access_count + 1,
                        last_accessed = GETDATE()
                    WHERE drug1 = ? AND drug2 = ?
                """, d1, d2)
                conn.commit()
                age = (datetime.now() - row.cached_at).days
                print(f"      💾 Cache HIT: {d1}+{d2} (cached {age}d ago, {row.access_count} uses)")
                return json.loads(row.full_result)
            print(f"      ❌ Cache MISS: {d1}+{d2}")
            return None
        except Exception as e:
            print(f"      ⚠️  Cache read error: {e}")
            return None

    def save_drug_drug(self, drug1: str, drug2: str, result: Dict):
        if not self.available:
            return
        d1, d2 = sorted([drug1.lower(), drug2.lower()])
        try:
            conn = self._conn()
            cur  = conn.cursor()
            cur.execute("""
                MERGE interaction_cache AS t
                USING (SELECT ? AS drug1, ? AS drug2) AS s
                ON t.drug1 = s.drug1 AND t.drug2 = s.drug2
                WHEN MATCHED THEN UPDATE SET
                    full_result   = ?,
                    severity      = ?,
                    confidence    = ?,
                    pubmed_papers = ?,
                    fda_reports   = ?,
                    cached_at     = GETDATE()
                WHEN NOT MATCHED THEN INSERT
                    (drug1, drug2, interaction_type, severity, confidence,
                     pubmed_papers, fda_reports, full_result)
                VALUES (?, ?, 'drug_drug', ?, ?, ?, ?, ?);
            """,
                d1, d2,
                json.dumps(result),
                result.get('severity'),
                result.get('confidence', 0.0),
                result.get('pubmed_papers', 0),
                result.get('fda_reports', 0),
                d1, d2,
                result.get('severity'),
                result.get('confidence', 0.0),
                result.get('pubmed_papers', 0),
                result.get('fda_reports', 0),
                json.dumps(result)
            )
            conn.commit()
            print(f"      💾 Saved drug-drug cache: {d1}+{d2}")
        except Exception as e:
            print(f"      ⚠️  Cache save error: {e}")

    # ── Drug-Disease Cache ────────────────────────────────────────────────────

    def get_drug_disease(self, drug: str, disease: str) -> Optional[Dict]:
        if not self.available:
            return None
        d, dis = drug.lower(), disease.lower()
        try:
            conn = self._conn()
            cur  = conn.cursor()
            cur.execute("""
                SELECT full_result, cached_at, access_count
                FROM disease_cache
                WHERE drug = ? AND disease = ?
                  AND DATEDIFF(day, cached_at, GETDATE()) < ?
            """, d, dis, CACHE_TTL_DAYS)
            row = cur.fetchone()
            if row:
                cur.execute("""
                    UPDATE disease_cache
                    SET access_count = access_count + 1,
                        last_accessed = GETDATE()
                    WHERE drug = ? AND disease = ?
                """, d, dis)
                conn.commit()
                age = (datetime.now() - row.cached_at).days
                print(f"      💾 Cache HIT: {d}+{dis} (cached {age}d ago)")
                return json.loads(row.full_result)
            print(f"      ❌ Cache MISS: {d}+{dis}")
            return None
        except Exception as e:
            print(f"      ⚠️  Cache read error: {e}")
            return None

    def save_drug_disease(self, drug: str, disease: str, result: Dict):
        if not self.available:
            return
        d, dis = drug.lower(), disease.lower()
        try:
            conn = self._conn()
            cur  = conn.cursor()
            cur.execute("""
                MERGE disease_cache AS t
                USING (SELECT ? AS drug, ? AS disease) AS s
                ON t.drug = s.drug AND t.disease = s.disease
                WHEN MATCHED THEN UPDATE SET
                    full_result     = ?,
                    severity        = ?,
                    confidence      = ?,
                    pubmed_papers   = ?,
                    contraindicated = ?,
                    cached_at       = GETDATE()
                WHEN NOT MATCHED THEN INSERT
                    (drug, disease, contraindicated, severity, confidence,
                     pubmed_papers, full_result)
                VALUES (?, ?, ?, ?, ?, ?, ?);
            """,
                d, dis,
                json.dumps(result),
                result.get('severity'),
                result.get('confidence', 0.0),
                result.get('pubmed_count', 0),
                1 if result.get('contraindicated') else 0,
                d, dis,
                1 if result.get('contraindicated') else 0,
                result.get('severity'),
                result.get('confidence', 0.0),
                result.get('pubmed_count', 0),
                json.dumps(result)
            )
            conn.commit()
            print(f"      💾 Saved drug-disease cache: {d}+{dis}")
        except Exception as e:
            print(f"      ⚠️  Cache save error: {e}")

    # ── Drug-Food Cache ───────────────────────────────────────────────────────

    def get_food(self, drug: str) -> Optional[Dict]:
        if not self.available:
            return None
        d = drug.lower()
        try:
            conn = self._conn()
            cur  = conn.cursor()
            cur.execute("""
                SELECT full_result, cached_at, access_count
                FROM food_cache
                WHERE drug = ?
                  AND DATEDIFF(day, cached_at, GETDATE()) < ?
            """, d, CACHE_TTL_DAYS)
            row = cur.fetchone()
            if row:
                cur.execute("""
                    UPDATE food_cache
                    SET access_count  = access_count + 1,
                        last_accessed = GETDATE()
                    WHERE drug = ?
                """, d)
                conn.commit()
                age = (datetime.now() - row.cached_at).days
                print(f"      💾 Cache HIT: {d} food (cached {age}d ago)")
                return json.loads(row.full_result)
            print(f"      ❌ Cache MISS: {d} food")
            return None
        except Exception as e:
            print(f"      ⚠️  Cache read error: {e}")
            return None

    def save_food(self, drug: str, result: Dict):
        if not self.available:
            return
        d = drug.lower()
        try:
            conn = self._conn()
            cur  = conn.cursor()
            cur.execute("""
                MERGE food_cache AS t
                USING (SELECT ? AS drug) AS s
                ON t.drug = s.drug
                WHEN MATCHED THEN UPDATE SET
                    full_result       = ?,
                    foods_to_avoid    = ?,
                    foods_to_separate = ?,
                    foods_to_monitor  = ?,
                    pubmed_papers     = ?,
                    cached_at         = GETDATE()
                WHEN NOT MATCHED THEN INSERT
                    (drug, foods_to_avoid, foods_to_separate,
                     foods_to_monitor, pubmed_papers, full_result)
                VALUES (?, ?, ?, ?, ?, ?);
            """,
                d,
                json.dumps(result),
                json.dumps(result.get('foods_to_avoid', [])),
                json.dumps(result.get('foods_to_separate', [])),
                json.dumps(result.get('foods_to_monitor', [])),
                result.get('pubmed_count', 0),
                d,
                json.dumps(result.get('foods_to_avoid', [])),
                json.dumps(result.get('foods_to_separate', [])),
                json.dumps(result.get('foods_to_monitor', [])),
                result.get('pubmed_count', 0),
                json.dumps(result)
            )
            conn.commit()
            print(f"      💾 Saved food cache: {d}")
        except Exception as e:
            print(f"      ⚠️  Cache save error: {e}")

    # ── Analysis Log ──────────────────────────────────────────────────────────

    def log_analysis(self, session_id: str, medications: list,
                     diseases: list, results: Dict):
        if not self.available:
            return
        try:
            ddi      = results.get('drug_drug', [])
            severe   = sum(1 for r in ddi if r.get('severity') == 'severe')
            moderate = sum(1 for r in ddi if r.get('severity') == 'moderate')
            food_papers = sum(r.get('pubmed_count', 0) for r in results.get('drug_food', []))
            ddi_papers  = sum(r.get('pubmed_papers', 0) for r in ddi)
            dis_papers  = sum(r.get('pubmed_count', 0) for r in results.get('drug_disease', []))
            risk = 'HIGH' if severe > 0 else 'MODERATE' if moderate > 0 else 'LOW'

            conn = self._conn()
            cur  = conn.cursor()
            cur.execute("""
                INSERT INTO analysis_log
                    (session_id, medications, diseases, risk_level,
                     severe_ddi, moderate_ddi, total_papers)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
                session_id,
                ', '.join(medications),
                ', '.join(diseases) if diseases else '',
                risk, severe, moderate,
                ddi_papers + dis_papers + food_papers
            )
            conn.commit()
            print(f"   📊 Analysis logged (session: {session_id}, risk: {risk})")
        except Exception as e:
            print(f"   ⚠️  Log error: {e}")

    # ── Stats ─────────────────────────────────────────────────────────────────

    def get_stats(self) -> Dict:
        if not self.available:
            return {'cache_location': 'Azure SQL (not connected)'}
        try:
            conn = self._conn()
            cur  = conn.cursor()

            cur.execute("SELECT COUNT(*), SUM(access_count) FROM interaction_cache")
            ddi_row  = cur.fetchone()
            cur.execute("SELECT COUNT(*), SUM(access_count) FROM disease_cache")
            dis_row  = cur.fetchone()
            cur.execute("SELECT COUNT(*) FROM food_cache")
            food_row = cur.fetchone()
            cur.execute("SELECT COUNT(*) FROM analysis_log")
            log_row  = cur.fetchone()

            return {
                'drug_drug_cached':    ddi_row[0]  or 0,
                'drug_disease_cached': dis_row[0]  or 0,
                'food_cached':         food_row[0] or 0,
                'total_analyses':      log_row[0]  or 0,
                'total_cache_hits':    (ddi_row[1] or 0) + (dis_row[1] or 0),
                'cache_location':      'Azure SQL Database'
            }
        except Exception as e:
            return {'error': str(e), 'cache_location': 'Azure SQL (error)'}