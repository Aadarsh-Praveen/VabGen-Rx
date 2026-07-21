    -- VabGen-Rx: AUDIT Supabase project (separate from the main project).
    -- Run this against the dedicated audit Supabase project -- its own URL,
    -- its own connection string, its own service-role key, no credential
    -- overlap with the main project. This is the Postgres-native equivalent
    -- of the original "audit DB on a physically separate Azure SQL server"
    -- design (logs/audit_service.py): a leaked main-project credential or
    -- service-role key has no path to this project at all.
    --
    -- No DDL for phi_audit_log/data_retention_policy existed anywhere in the
    -- repo before this migration -- both are reconstructed here from the
    -- exact columns logs/audit_service.py inserts/queries.

    create schema if not exists audit;

    create table if not exists audit.phi_audit_log (
        id             bigint generated always as identity primary key,
        user_id        text,
        user_email     text,
        action         text,
        resource_type  text,
        resource_id    text,   -- SHA-256 hash of patient IP_No/OP_No, never the raw value
        ip_address     text,
        session_id     text,
        endpoint       text,
        http_method    text,
        status_code    integer,
        success        boolean,
        detail         text,
        event_time     timestamptz default now()
    );

    create table if not exists audit.data_retention_policy (
        table_name      text primary key,
        database_name   text,
        retention_days  integer,
        description     text,
        hipaa_required  boolean
    );

    -- ── Restricted roles ──────────────────────────────────────────────
    -- audit_writer: used by the day-to-day AuditLogService connection.
    -- INSERT/SELECT only -- explicitly no UPDATE/DELETE, so a leaked
    -- request-path credential can append but never tamper with history.
    do $$
    begin
        if not exists (select 1 from pg_roles where rolname = 'audit_writer') then
            create role audit_writer login password :'audit_writer_password';
        end if;
        if not exists (select 1 from pg_roles where rolname = 'audit_admin') then
            create role audit_admin login password :'audit_admin_password';
        end if;
    end
    $$;

    grant usage on schema audit to audit_writer, audit_admin;

    grant select, insert on audit.phi_audit_log, audit.data_retention_policy to audit_writer;
    grant usage, select on all sequences in schema audit to audit_writer;

    -- audit_admin: used ONLY by the scheduled enforce_retention_policy() job
    -- (the one legitimate path that needs DELETE, for the 6-year HIPAA purge)
    -- and by the startup seed of data_retention_policy (needs UPDATE for the
    -- MERGE-equivalent upsert).
    grant select, insert, update, delete on audit.phi_audit_log, audit.data_retention_policy to audit_admin;
    grant usage, select on all sequences in schema audit to audit_admin;

    -- IMPORTANT: connect to this project using audit_writer's / audit_admin's
    -- plain Postgres connection string (psycopg2), never the Supabase
    -- service_role key -- service_role bypasses these grants entirely.
    --
    -- Run with:
    --   psql "$AUDIT_SUPABASE_DB_URL" \
    --     -v audit_writer_password='<pick-a-strong-password>' \
    --     -v audit_admin_password='<pick-a-strong-password>' \
    --     -f 0001_audit.sql
