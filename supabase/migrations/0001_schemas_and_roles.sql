-- VabGen-Rx: main Supabase project schema setup.
-- Run against the MAIN Supabase project (not the audit project).
--
-- Mirrors the original 3 logical Azure SQL databases as 3 Postgres schemas:
--   app      -> Node.js "credentials" DB (doctor accounts)
--   clinical -> Node.js "patients" DB (26 tables)
--   cache    -> Python "cache DB" (6 tables)
--
-- The HIPAA audit log intentionally lives in a SEPARATE Supabase project
-- (see supabase-audit/migrations/0001_audit.sql), preserving the original
-- "audit logs can't be tampered with if the cache/app server is compromised"
-- rationale from logs/audit_service.py.

create schema if not exists app;
create schema if not exists clinical;
create schema if not exists cache;
