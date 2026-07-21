-- cache schema: was the Python "cache DB" (6 tables), used by
-- services/cache_service.py, services/patient/counselling_service.py,
-- services/patient/condition_service.py.
--
-- Two schema-drift bugs from the original Azure SQL DDL are fixed here,
-- not ported:
--   1. fda_label_sections_count is read/written by cache_service.py but
--      was missing from database/drug_database.py's DDL -- added below.
--   2. analysis_log's retention-cleanup query filtered on `logged_at`,
--      but the DDL defined `analyzed_at` -- standardized on `analyzed_at`
--      (services/cache_service.py's enforce_retention_policy() must be
--      fixed to match in Phase 3, not the other way around).
--
-- full_result (and any other jsonb column an app service reads back via
-- json.loads()) must be selected with `::text` -- see Phase 3 notes.

create table if not exists cache.interaction_cache (
    id                          bigint generated always as identity primary key,
    drug1                       text not null,
    drug2                       text not null,
    interaction_type            text not null default 'drug_drug',
    severity                    text,
    confidence                  double precision,
    pubmed_papers               integer default 0,
    fda_reports                 integer default 0,
    fda_label_sections_count    integer default 0,
    full_result                 jsonb not null,
    cached_at                   timestamptz default now(),
    last_accessed               timestamptz default now(),
    access_count                integer default 1,
    constraint uq_drug_pair unique (drug1, drug2)
);

create table if not exists cache.disease_cache (
    id                          bigint generated always as identity primary key,
    drug                        text not null,
    disease                     text not null,
    contraindicated             boolean default false,
    severity                    text,
    confidence                  double precision,
    pubmed_papers               integer default 0,
    fda_label_sections_count    integer default 0,
    full_result                 jsonb not null,
    cached_at                   timestamptz default now(),
    last_accessed               timestamptz default now(),
    access_count                integer default 1,
    constraint uq_drug_disease unique (drug, disease)
);

create table if not exists cache.food_cache (
    id                  bigint generated always as identity primary key,
    drug                text not null unique,
    foods_to_avoid      jsonb,
    foods_to_separate   jsonb,
    foods_to_monitor    jsonb,
    pubmed_papers       integer default 0,
    full_result         jsonb not null,
    cached_at           timestamptz default now(),
    last_accessed       timestamptz default now(),
    access_count        integer default 1
);

create table if not exists cache.analysis_log (
    id            bigint generated always as identity primary key,
    session_id    text,
    medications   text,   -- comma-joined string written by cache_service.py, not JSON
    diseases      text,   -- comma-joined string written by cache_service.py, not JSON
    risk_level    text,
    severe_ddi    integer default 0,
    moderate_ddi  integer default 0,
    total_papers  integer default 0,
    analyzed_at   timestamptz default now()
);

create table if not exists cache.drug_counseling_cache (
    id            bigint generated always as identity primary key,
    cache_key     text not null unique,  -- drug|sex|age_group
    drug          text not null,
    sex           text,
    age_group     text,
    full_result   jsonb not null,
    cached_at     timestamptz default now(),
    access_count  integer default 1
);

create table if not exists cache.condition_counseling_cache (
    id            bigint generated always as identity primary key,
    cache_key     text not null unique,  -- condition|sex|age_group
    condition     text not null,
    sex           text,
    age_group     text,
    full_result   jsonb not null,
    cached_at     timestamptz default now(),
    access_count  integer default 1
);
