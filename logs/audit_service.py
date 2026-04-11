"""
VabGenRx — HIPAA Audit Log Service
Logs all PHI access events to the dedicated audit database.

HIPAA Requirements covered:
- Audit Log Rule: records every PHI access with user, action,
  timestamp, IP address. Retained 6 years (2190 days).
- PHI Minimization: patient IDs are SHA-256 hashed before
  storage — raw OP_No / IP_No never written to audit log.
- Data Retention: enforce_retention_policy() deletes records
  older than their defined retention period.
- Retention policies are defined in code (RETENTION_POLICIES)
  and seeded into the DB on startup — no hardcoded SQL values.


Database: vabgenrx-audit-logs (separate from cache DB)
Credentials: AZURE_SQL_AUDIT_* env vars (separate from cache)
"""

import os
import hashlib
import pyodbc
from datetime import datetime
from threading import local
from typing   import Dict, Optional
from dotenv   import load_dotenv

load_dotenv()

# ── Audit DB connection string ────────────────────────────────────
# Audit DB is on a SEPARATE server from the cache DB.
# AZURE_SQL_AUDIT_SERVER points to admin-vabgen.database.windows.net
# AZURE_SQL_SERVER points to drug-interactions.database.windows.net
# Keeping them on separate servers is correct HIPAA architecture —
# audit logs cannot be tampered with if the cache server is compromised.
_audit_conn_str = (
    f"DRIVER={{ODBC Driver 18 for SQL Server}};"
    f"SERVER={os.getenv('AZURE_SQL_AUDIT_SERVER')};"
    f"DATABASE={os.getenv('AZURE_SQL_AUDIT_DATABASE', 'vabgenrx-audit-logs')};"
    f"UID={os.getenv('AZURE_SQL_AUDIT_USERNAME')};"
    f"PWD={os.getenv('AZURE_SQL_AUDIT_PASSWORD')}"
)

# Thread-local connection — same pattern as main db_connection.py
_thread_local = local()

# ── Retention policies defined in code ───────────────────────────
# Single source of truth — seeded into data_retention_policy table
# on startup. Change here → takes effect on next deploy.
RETENTION_POLICIES = [
    # Cache DB tables — 30 days
    {
        "table_name":     "interaction_cache",
        "database_name":  "vabgenrx-drug-interactions-cache",
        "retention_days": int(os.getenv("CACHE_TTL_DAYS", 30)),
        "description":    "Drug-drug interaction synthesis cache.",
        "hipaa_required": False,
    },
    {
        "table_name":     "disease_cache",
        "database_name":  "vabgenrx-drug-interactions-cache",
        "retention_days": int(os.getenv("CACHE_TTL_DAYS", 30)),
        "description":    "Drug-disease contraindication cache.",
        "hipaa_required": False,
    },
    {
        "table_name":     "food_cache",
        "database_name":  "vabgenrx-drug-interactions-cache",
        "retention_days": int(os.getenv("CACHE_TTL_DAYS", 30)),
        "description":    "Drug-food interaction cache.",
        "hipaa_required": False,
    },
    {
        "table_name":     "drug_counseling_cache",
        "database_name":  "vabgenrx-drug-interactions-cache",
        "retention_days": int(os.getenv("CACHE_TTL_DAYS", 30)),
        "description":    "Drug counseling points cache.",
        "hipaa_required": False,
    },
    {
        "table_name":     "condition_counseling_cache",
        "database_name":  "vabgenrx-drug-interactions-cache",
        "retention_days": int(os.getenv("CACHE_TTL_DAYS", 30)),
        "description":    "Condition counseling cache.",
        "hipaa_required": False,
    },
    # Analysis log — 1 year
    {
        "table_name":     "analysis_log",
        "database_name":  "vabgenrx-drug-interactions-cache",
        "retention_days": int(os.getenv("ANALYSIS_LOG_TTL_DAYS", 365)),
        "description":    "Drug interaction analysis session log.",
        "hipaa_required": False,
    },
    # Audit log — 6 years (HIPAA mandatory minimum)
    {
        "table_name":     "phi_audit_log",
        "database_name":  "vabgenrx-audit-logs",
        "retention_days": int(os.getenv("AUDIT_LOG_TTL_DAYS", 2190)),
        "description":    (
            "PHI access audit log. "
            "HIPAA Audit Log Rule requires minimum 6 years retention."
        ),
        "hipaa_required": True,
    },
]


def _get_audit_connection():
    """
    Get or create a thread-local audit DB connection.
    Each thread gets its own private connection.
    """
    conn = getattr(_thread_local, "connection", None)
    try:
        if conn:
            conn.cursor().execute("SELECT 1")
            return conn
    except Exception:
        _thread_local.connection = None

    _thread_local.connection = pyodbc.connect(
        _audit_conn_str, timeout=10
    )
    return _thread_local.connection


def _hash_patient_id(patient_id: str) -> str:
    """
    SHA-256 hash a patient ID before storing in audit log.
    Raw OP_No / IP_No must never appear in audit records —
    this ensures audit log breach doesn't expose patient identity.
    Returns first 16 hex chars — sufficient for correlation,
    not reversible to original ID.
    """
    if not patient_id:
        return ""
    return hashlib.sha256(
        patient_id.encode("utf-8")
    ).hexdigest()[:16]


# ── Action constants ──────────────────────────────────────────────
class AuditAction:
    ANALYSIS    = "ANALYSIS"    # Drug interaction analysis
    READ        = "READ"        # Reading patient data
    EXPORT      = "EXPORT"      # PDF generation
    TRANSLATE   = "TRANSLATE"   # Translation (contains PHI)
    LOGIN       = "LOGIN"       # User login
    LOGOUT      = "LOGOUT"      # User logout
    COUNSELLING = "COUNSELLING" # Patient counselling generation
    DOSING      = "DOSING"      # Dosing recommendation
    VOICE_TRANSCRIPTION = "VOICE_TRANSCRIPTION" # Audio → transcript + SOAP note
    VOICE_NOTE_ACCESS   = "VOICE_NOTE_ACCESS"   # Voice note list accessed
    VOICE_NOTE_DELETE   = "VOICE_NOTE_DELETE"   # Voice note deleted


# ── Resource type constants ───────────────────────────────────────
class ResourceType:
    DRUG_ANALYSIS   = "drug_analysis"
    DRUG_DISEASE    = "drug_disease"
    DRUG_FOOD       = "drug_food"
    COUNSELLING     = "counselling"
    DOSING          = "dosing"
    PRESCRIPTION    = "prescription"
    DIAGNOSIS       = "diagnosis"
    TRANSLATION     = "translation"
    VOICE_NOTE      = "voice_note"



class AuditLogService:
    """
    HIPAA-compliant audit logging service.
    Writes to dedicated vabgenrx-audit-logs database.
    Never breaks the main request pipeline on failure.
    Retention policies are defined in RETENTION_POLICIES above
    and seeded into the DB on first startup.
    """

    def __init__(self):
        self.available = self._test_connection()
        if self.available:
            self._seed_retention_policies()

    def _test_connection(self) -> bool:
        try:
            conn = _get_audit_connection()
            conn.cursor().execute("SELECT 1")
            print("✅ Audit Log DB connected "
                  "(vabgenrx-audit-logs)")
            return True
        except Exception as e:
            print(f"⚠️  Audit Log DB unavailable: {e}")
            print("   PHI audit logging disabled — "
                  "check AZURE_SQL_AUDIT_* env vars")
            return False

    def _seed_retention_policies(self):
        """
        Seed data_retention_policy table from RETENTION_POLICIES.
        Uses MERGE so re-running on startup is always safe —
        existing rows are updated, new rows are inserted.
        """
        try:
            conn = _get_audit_connection()
            cur  = conn.cursor()
            for policy in RETENTION_POLICIES:
                cur.execute("""
                    MERGE data_retention_policy AS t
                    USING (SELECT ? AS table_name) AS s
                    ON t.table_name = s.table_name
                    WHEN MATCHED THEN UPDATE SET
                        retention_days = ?,
                        database_name  = ?,
                        description    = ?,
                        hipaa_required = ?
                    WHEN NOT MATCHED THEN INSERT
                        (table_name, database_name,
                         retention_days, description,
                         hipaa_required)
                    VALUES (?, ?, ?, ?, ?);
                """,
                    policy["table_name"],
                    policy["retention_days"],
                    policy["database_name"],
                    policy["description"],
                    1 if policy["hipaa_required"] else 0,
                    policy["table_name"],
                    policy["database_name"],
                    policy["retention_days"],
                    policy["description"],
                    1 if policy["hipaa_required"] else 0,
                )
            conn.commit()
            print(f"   ✅ Retention policies seeded "
                  f"({len(RETENTION_POLICIES)} tables)")
        except Exception as e:
            print(f"   ⚠️  Retention policy seed error: {e}")

    # ── Core log method ───────────────────────────────────────────

    def log(
        self,
        action:        str,
        resource_type: str,
        user_id:       str           = "anonymous",
        user_email:    str           = "",
        patient_id:    str           = "",  # legacy — hashed here
        resource_id:   str           = "",  # from middleware — already hashed
        ip_address:    str           = "",
        session_id:    str           = "",
        endpoint:      str           = "",
        http_method:   str           = "",
        status_code:   Optional[int] = None,
        success:       bool          = True,
        detail:        str           = "",
    ) -> bool:
        """
        Log a PHI access event.

        Accepts both resource_id and patient_id:
        - resource_id: sent by the HIPAA middleware in app.py.
          Already SHA-256 hashed by the middleware — stored as-is.
        - patient_id: legacy parameter used by direct callers.
          Raw value — hashed here before storage.

        Raw OP_No / IP_No must NEVER appear in the audit log.
        Both paths ensure only a hash is ever stored.

        Returns True if logged successfully, False otherwise.
        Never raises — audit logging must never break requests.
        """
        if not self.available:
            return False
        try:
            # ── Resolve which ID to store ─────────────────────────
            # Priority: resource_id (already hashed by middleware)
            # Fallback: patient_id (hash it here)
            if resource_id:
                hashed_id = resource_id   # already hashed by app.py middleware
            else:
                hashed_id = _hash_patient_id(patient_id)  # hash raw ID

            conn = _get_audit_connection()
            cur  = conn.cursor()
            cur.execute("""
                INSERT INTO phi_audit_log
                    (user_id, user_email, action, resource_type,
                     resource_id, ip_address, session_id,
                     endpoint, http_method, status_code,
                     success, detail)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                user_id, user_email, action, resource_type,
                hashed_id, ip_address, session_id,
                endpoint, http_method, status_code,
                1 if success else 0, detail
            )
            conn.commit()
            return True
        except Exception as e:
            print(f"   ⚠️  Audit log write error: {e}")
            return False

    # ── Convenience methods ───────────────────────────────────────

    def log_analysis(
        self,
        user_id:     str,
        endpoint:    str,
        ip_address:  str = "",
        session_id:  str = "",
        resource_id: str = "",
        success:     bool = True,
        status_code: int  = 200,
    ):
        """Log a drug interaction analysis request."""
        return self.log(
            action        = AuditAction.ANALYSIS,
            resource_type = ResourceType.DRUG_ANALYSIS,
            user_id       = user_id,
            ip_address    = ip_address,
            session_id    = session_id,
            resource_id   = resource_id,
            endpoint      = endpoint,
            http_method   = "POST",
            status_code   = status_code,
            success       = success,
            detail        = f"Analysis via {endpoint}",
        )

    def log_export(
        self,
        user_id:    str,
        ip_address: str = "",
        detail:     str = "PDF export",
    ):
        """Log a PDF counselling export (contains PHI)."""
        return self.log(
            action        = AuditAction.EXPORT,
            resource_type = ResourceType.COUNSELLING,
            user_id       = user_id,
            ip_address    = ip_address,
            http_method   = "POST",
            status_code   = 200,
            success       = True,
            detail        = detail,
        )

    def log_translation(
        self,
        user_id:    str,
        language:   str,
        ip_address: str = "",
    ):
        """Log a translation request (contains PHI counselling)."""
        return self.log(
            action        = AuditAction.TRANSLATE,
            resource_type = ResourceType.TRANSLATION,
            user_id       = user_id,
            ip_address    = ip_address,
            endpoint      = "/agent/translate",
            http_method   = "POST",
            status_code   = 200,
            success       = True,
            detail        = f"Translated to {language}",
        )

    # ── Retention enforcement ─────────────────────────────────────

    def enforce_retention_policy(self) -> Dict:
        """
        Delete phi_audit_log records older than 6 years.
        HIPAA requires minimum 6 years (2190 days) retention —
        this deletes anything BEYOND that window.

        Cache table cleanup is handled by cache_service.py.
        This method only manages the audit DB tables.
        """
        if not self.available:
            return {}
        results = {}
        try:
            conn = _get_audit_connection()
            cur  = conn.cursor()

            cur.execute("""
                DELETE FROM phi_audit_log
                WHERE DATEDIFF(day, event_time, GETUTCDATE())
                      > 2190
            """)
            results["phi_audit_log_deleted"] = cur.rowcount

            conn.commit()
            print(f"   🗑️  Audit retention cleanup: "
                  f"{results['phi_audit_log_deleted']} "
                  f"old records removed")
            return results

        except Exception as e:
            print(f"   ⚠️  Audit retention cleanup error: {e}")
            return {}

    # ── Stats for health check ────────────────────────────────────

    def get_stats(self) -> Dict:
        """
        Return audit log statistics for compliance reporting
        and the /health endpoint.
        """
        if not self.available:
            return {
                "available":   False,
                "audit_db":    "vabgenrx-audit-logs",
                "status":      "unavailable"
            }
        try:
            conn = _get_audit_connection()
            cur  = conn.cursor()

            cur.execute("""
                SELECT
                    COUNT(*)                          AS total_events,
                    SUM(CASE WHEN success = 1
                        THEN 1 ELSE 0 END)            AS successful,
                    SUM(CASE WHEN success = 0
                        THEN 1 ELSE 0 END)            AS failed,
                    MIN(event_time)                   AS oldest_record,
                    MAX(event_time)                   AS newest_record
                FROM phi_audit_log
            """)
            row = cur.fetchone()

            cur.execute("""
                SELECT action, COUNT(*) AS cnt
                FROM phi_audit_log
                GROUP BY action
                ORDER BY cnt DESC
            """)
            by_action = {
                r[0]: r[1] for r in cur.fetchall()
            }

            return {
                "available":     True,
                "audit_db":      "vabgenrx-audit-logs",
                "total_events":  row[0] or 0,
                "successful":    row[1] or 0,
                "failed":        row[2] or 0,
                "oldest_record": str(row[3]) if row[3] else None,
                "newest_record": str(row[4]) if row[4] else None,
                "by_action":     by_action,
                "retention":     "6 years (HIPAA compliant)",
            }
        except Exception as e:
            return {
                "available": False,
                "error":     str(e)
            }