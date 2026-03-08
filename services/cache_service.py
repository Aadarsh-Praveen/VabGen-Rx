"""
Azure SQL Cache Service — VabGenRx
Caches drug-drug, drug-disease, and drug-food results
to avoid redundant PubMed/FDA/OpenAI calls.

CHANGES:
- get_drug_disease now normalises evidence{} on read — same
  pattern as get_drug_drug. Ensures pubmed_papers and
  fda_label_sections_count are always present in the nested
  evidence{} sub-object so the frontend badge renders correctly
  for cached disease pairs.
- save_drug_disease now stores fda_label_sections_count as a
  dedicated column AND ensures evidence{} is complete before
  storing full_result — same pattern as save_drug_drug.
- save_drug_drug already had these fixes — unchanged.
- enforce_retention_policy() added — deletes cache records older
  than their defined retention period. Called on app startup by
  the FastAPI startup event in app.py. Reads retention days from
  CACHE_TTL_DAYS and ANALYSIS_LOG_TTL_DAYS env vars so no
  hardcoded values in cleanup logic.
"""

import json
import os
from datetime import datetime
from typing import Dict, Optional
from dotenv import load_dotenv

load_dotenv()

CACHE_TTL_DAYS       = int(os.getenv("CACHE_TTL_DAYS", 30))
ANALYSIS_LOG_TTL_DAYS = int(os.getenv("ANALYSIS_LOG_TTL_DAYS", 365))


class AzureSQLCacheService:

    def __init__(self):
        self.available = self._test_connection()

    # ── Connection ────────────────────────────────────────────────────────────

    def _test_connection(self) -> bool:
        try:
            from services.db_connection import get_connection
            conn = get_connection()
            conn.cursor().execute("SELECT 1")
            return True
        except Exception as e:
            print(f"⚠️  Azure SQL Cache unavailable: {e}")
            print("   Running without cache (results won't be stored)")
            return False

    def _conn(self):
        try:
            from services.db_connection import get_connection
            return get_connection()
        except Exception:
            import pyodbc
            conn_str = (
                f"DRIVER={{ODBC Driver 18 for SQL Server}};"
                f"SERVER={os.getenv('AZURE_SQL_SERVER')};"
                f"DATABASE={os.getenv('AZURE_SQL_DATABASE')};"
                f"UID={os.getenv('AZURE_SQL_USERNAME')};"
                f"PWD={os.getenv('AZURE_SQL_PASSWORD')}"
            )
            return pyodbc.connect(conn_str, timeout=10)

    # ── Shared normaliser ─────────────────────────────────────────────────────

    @staticmethod
    def _normalise_evidence(result: Dict, fields: list) -> Dict:
        """
        Ensure the nested evidence{} sub-object contains all
        expected fields, promoting top-level fields as fallback.

        fields = list of (evidence_key, top_level_fallback_key)

        Applied on every cache read so the frontend always finds
        badge counts in item.evidence.* regardless of when the
        entry was originally cached.
        """
        ev = result.get("evidence", {})
        if not isinstance(ev, dict):
            ev = {}
        for ev_key, fallback_key in fields:
            if not ev.get(ev_key):
                ev[ev_key] = result.get(fallback_key, 0)
        result["evidence"] = ev
        return result

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
                print(f"      💾 Cache HIT: {d1}+{d2} "
                      f"(cached {age}d ago, "
                      f"{row.access_count} uses)")
                result = json.loads(row.full_result)
                result = self._normalise_evidence(result, [
                    ("pubmed_papers",           "pubmed_papers"),
                    ("fda_reports",             "fda_reports"),
                    ("fda_label_sections_count","fda_label_sections_count"),
                ])
                return result
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

            ev            = result.get("evidence", {})
            pubmed_papers = (
                ev.get("pubmed_papers")
                or result.get("pubmed_papers", 0)
            )
            fda_reports   = (
                ev.get("fda_reports")
                or result.get("fda_reports", 0)
            )
            fda_sec_count = (
                ev.get("fda_label_sections_count")
                or result.get("fda_label_sections_count", 0)
            )

            # Ensure evidence{} is complete before storing
            ev["pubmed_papers"]            = pubmed_papers
            ev["fda_reports"]              = fda_reports
            ev["fda_label_sections_count"] = fda_sec_count
            result["evidence"]             = ev

            cur.execute("""
                MERGE interaction_cache AS t
                USING (SELECT ? AS drug1, ? AS drug2) AS s
                ON t.drug1 = s.drug1 AND t.drug2 = s.drug2
                WHEN MATCHED THEN UPDATE SET
                    full_result              = ?,
                    severity                 = ?,
                    confidence               = ?,
                    pubmed_papers            = ?,
                    fda_reports              = ?,
                    fda_label_sections_count = ?,
                    cached_at                = GETDATE()
                WHEN NOT MATCHED THEN INSERT
                    (drug1, drug2, interaction_type,
                     severity, confidence,
                     pubmed_papers, fda_reports,
                     fda_label_sections_count, full_result)
                VALUES (?, ?, 'drug_drug', ?, ?, ?, ?, ?, ?);
            """,
                d1, d2,
                json.dumps(result),
                result.get("severity"),
                result.get("confidence", 0.0),
                pubmed_papers,
                fda_reports,
                fda_sec_count,
                d1, d2,
                result.get("severity"),
                result.get("confidence", 0.0),
                pubmed_papers,
                fda_reports,
                fda_sec_count,
                json.dumps(result)
            )
            conn.commit()
            print(f"      💾 Saved drug-drug cache: {d1}+{d2}")
        except Exception as e:
            print(f"      ⚠️  Cache save error: {e}")

    # ── Drug-Disease Cache ────────────────────────────────────────────────────

    def get_drug_disease(
        self, drug: str, disease: str
    ) -> Optional[Dict]:
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
                    SET access_count  = access_count + 1,
                        last_accessed = GETDATE()
                    WHERE drug = ? AND disease = ?
                """, d, dis)
                conn.commit()
                age = (datetime.now() - row.cached_at).days
                print(f"      💾 Cache HIT: {d}+{dis} "
                      f"(cached {age}d ago)")
                result = json.loads(row.full_result)

                # Disease blobs store pubmed count as "pubmed_count"
                # at the top level — different from DDI blobs which
                # use "pubmed_papers". Check both fallback names.
                ev = result.get("evidence", {})
                if not isinstance(ev, dict):
                    ev = {}

                if not ev.get("pubmed_papers"):
                    ev["pubmed_papers"] = (
                        result.get("pubmed_papers")
                        or result.get("pubmed_count", 0)
                    )
                if not ev.get("fda_label_sections_count"):
                    ev["fda_label_sections_count"] = (
                        result.get("fda_label_sections_count", 0)
                    )
                if not ev.get("fda_label_sections_found"):
                    ev["fda_label_sections_found"] = (
                        result.get("fda_label_sections_found", [])
                    )
                result["evidence"] = ev
                return result
            print(f"      ❌ Cache MISS: {d}+{dis}")
            return None
        except Exception as e:
            print(f"      ⚠️  Cache read error: {e}")
            return None

    def save_drug_disease(
        self, drug: str, disease: str, result: Dict
    ):
        if not self.available:
            return
        d, dis = drug.lower(), disease.lower()
        try:
            conn = self._conn()
            cur  = conn.cursor()

            ev            = result.get("evidence", {})
            pubmed_papers = (
                ev.get("pubmed_papers")
                or result.get("pubmed_papers")
                or result.get("pubmed_count", 0)
            )
            fda_sec_count = (
                ev.get("fda_label_sections_count")
                or result.get("fda_label_sections_count", 0)
            )
            sections_found = (
                ev.get("fda_label_sections_found")
                or result.get("fda_label_sections_found", [])
            )

            # Ensure evidence{} is complete before storing
            ev["pubmed_papers"]            = pubmed_papers
            ev["fda_label_sections_count"] = fda_sec_count
            ev["fda_label_sections_found"] = sections_found
            result["evidence"]             = ev

            cur.execute("""
                MERGE disease_cache AS t
                USING (SELECT ? AS drug, ? AS disease) AS s
                ON t.drug = s.drug AND t.disease = s.disease
                WHEN MATCHED THEN UPDATE SET
                    full_result              = ?,
                    severity                 = ?,
                    confidence               = ?,
                    pubmed_papers            = ?,
                    fda_label_sections_count = ?,
                    contraindicated          = ?,
                    cached_at                = GETDATE()
                WHEN NOT MATCHED THEN INSERT
                    (drug, disease, contraindicated, severity,
                     confidence, pubmed_papers,
                     fda_label_sections_count, full_result)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
                d, dis,
                json.dumps(result),
                result.get("severity"),
                result.get("confidence", 0.0),
                pubmed_papers,
                fda_sec_count,
                1 if result.get("contraindicated") else 0,
                d, dis,
                1 if result.get("contraindicated") else 0,
                result.get("severity"),
                result.get("confidence", 0.0),
                pubmed_papers,
                fda_sec_count,
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
                print(f"      💾 Cache HIT: {d} food "
                      f"(cached {age}d ago)")
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
                json.dumps(result.get("foods_to_avoid", [])),
                json.dumps(result.get("foods_to_separate", [])),
                json.dumps(result.get("foods_to_monitor", [])),
                result.get("pubmed_count", 0),
                d,
                json.dumps(result.get("foods_to_avoid", [])),
                json.dumps(result.get("foods_to_separate", [])),
                json.dumps(result.get("foods_to_monitor", [])),
                result.get("pubmed_count", 0),
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
            ddi      = results.get("drug_drug", [])
            severe   = sum(
                1 for r in ddi if r.get("severity") == "severe"
            )
            moderate = sum(
                1 for r in ddi if r.get("severity") == "moderate"
            )
            food_papers = sum(
                r.get("pubmed_count", 0)
                for r in results.get("drug_food", [])
            )
            ddi_papers = sum(
                r.get("evidence", {}).get("pubmed_papers", 0)
                or r.get("pubmed_papers", 0)
                for r in ddi
            )
            dis_papers = sum(
                r.get("evidence", {}).get("pubmed_papers", 0)
                or r.get("pubmed_count", 0)
                for r in results.get("drug_disease", [])
            )
            risk = (
                "HIGH"     if severe > 0 else
                "MODERATE" if moderate > 0 else
                "LOW"
            )
            conn = self._conn()
            cur  = conn.cursor()
            cur.execute("""
                INSERT INTO analysis_log
                    (session_id, medications, diseases,
                     risk_level, severe_ddi, moderate_ddi,
                     total_papers)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
                session_id,
                ", ".join(medications),
                ", ".join(diseases) if diseases else "",
                risk, severe, moderate,
                ddi_papers + dis_papers + food_papers
            )
            conn.commit()
            print(f"   📊 Analysis logged "
                  f"(session: {session_id}, risk: {risk})")
        except Exception as e:
            print(f"   ⚠️  Log error: {e}")

    # ── Retention Policy Enforcement ──────────────────────────────────────────

    def enforce_retention_policy(self) -> Dict:
        """
        Delete cache and log records older than their defined
        retention period. Called on app startup by the FastAPI
        startup event in app.py.

        Retention periods come from env vars — no hardcoded values:
          CACHE_TTL_DAYS        → cache tables  (default 30 days)
          ANALYSIS_LOG_TTL_DAYS → analysis_log  (default 365 days)

        PHI audit log retention (6 years) is handled separately
        by AuditLogService.enforce_retention_policy() in logs/
        because it lives in a different database.

        Returns dict of {table_name: rows_deleted} for logging.
        Never raises — retention cleanup must never break startup.
        """
        if not self.available:
            return {}

        results = {}
        try:
            conn = self._conn()
            cur  = conn.cursor()

            # ── Cache tables — CACHE_TTL_DAYS (default 30) ────────
            for table, col in [
                ("interaction_cache",          "cached_at"),
                ("disease_cache",              "cached_at"),
                ("food_cache",                 "cached_at"),
                ("drug_counseling_cache",      "cached_at"),
                ("condition_counseling_cache", "cached_at"),
            ]:
                cur.execute(f"""
                    DELETE FROM {table}
                    WHERE DATEDIFF(day, {col}, GETUTCDATE())
                          > ?
                """, CACHE_TTL_DAYS)
                deleted         = cur.rowcount
                results[table]  = deleted
                if deleted > 0:
                    print(f"   🗑️  Retention: deleted {deleted} "
                          f"rows from {table} "
                          f"(>{CACHE_TTL_DAYS} days old)")

            # ── Analysis log — ANALYSIS_LOG_TTL_DAYS (default 365) ─
            cur.execute("""
                DELETE FROM analysis_log
                WHERE DATEDIFF(day, logged_at, GETUTCDATE())
                      > ?
            """, ANALYSIS_LOG_TTL_DAYS)
            deleted                  = cur.rowcount
            results["analysis_log"]  = deleted
            if deleted > 0:
                print(f"   🗑️  Retention: deleted {deleted} "
                      f"rows from analysis_log "
                      f"(>{ANALYSIS_LOG_TTL_DAYS} days old)")

            conn.commit()
            print(f"   ✅ Cache retention policy enforced — "
                  f"total deleted: {sum(results.values())} rows")
            return results

        except Exception as e:
            print(f"   ⚠️  Cache retention cleanup error: {e}")
            return {}

    # ── Stats ─────────────────────────────────────────────────────────────────

    def get_stats(self) -> Dict:
        if not self.available:
            return {"cache_location": "Azure SQL (not connected)"}
        try:
            conn = self._conn()
            cur  = conn.cursor()
            cur.execute(
                "SELECT COUNT(*), SUM(access_count) "
                "FROM interaction_cache"
            )
            ddi_row  = cur.fetchone()
            cur.execute(
                "SELECT COUNT(*), SUM(access_count) "
                "FROM disease_cache"
            )
            dis_row  = cur.fetchone()
            cur.execute("SELECT COUNT(*) FROM food_cache")
            food_row = cur.fetchone()
            cur.execute("SELECT COUNT(*) FROM analysis_log")
            log_row  = cur.fetchone()
            return {
                "drug_drug_cached":    ddi_row[0]  or 0,
                "drug_disease_cached": dis_row[0]  or 0,
                "food_cached":         food_row[0] or 0,
                "total_analyses":      log_row[0]  or 0,
                "total_cache_hits":    (
                    (ddi_row[1] or 0) + (dis_row[1] or 0)
                ),
                "cache_location":      "Azure SQL Database",
            }
        except Exception as e:
            return {
                "error":          str(e),
                "cache_location": "Azure SQL (error)",
            }