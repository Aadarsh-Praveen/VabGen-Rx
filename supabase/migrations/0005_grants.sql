-- Single application role for the main project, used by both Render
-- services (Node auth/data server + Python agent backend) via DATABASE_URL.
-- No restricted-role split is needed here -- that isolation only applies
-- to the audit project (see supabase-audit/migrations/0001_audit.sql).

do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'vabgenrx_app') then
        create role vabgenrx_app login password :'vabgenrx_app_password';
    end if;
end
$$;

grant usage on schema app, clinical, cache to vabgenrx_app;

grant select, insert, update, delete on all tables in schema app      to vabgenrx_app;
grant select, insert, update, delete on all tables in schema clinical to vabgenrx_app;
grant select, insert, update, delete on all tables in schema cache    to vabgenrx_app;

grant usage, select on all sequences in schema app, clinical, cache to vabgenrx_app;

alter default privileges in schema app      grant select, insert, update, delete on tables to vabgenrx_app;
alter default privileges in schema clinical grant select, insert, update, delete on tables to vabgenrx_app;
alter default privileges in schema cache    grant select, insert, update, delete on tables to vabgenrx_app;

alter default privileges in schema app      grant usage, select on sequences to vabgenrx_app;
alter default privileges in schema clinical grant usage, select on sequences to vabgenrx_app;
alter default privileges in schema cache    grant usage, select on sequences to vabgenrx_app;

-- Run with: psql "$SUPABASE_DB_URL" -v vabgenrx_app_password='<pick-a-strong-password>' -f 0005_grants.sql
