-- clinical schema: was the Node.js "patients" database (23 tables).
-- Column list reconstructed from every query in server/index.js
-- (no DDL existed in-repo for this database before this migration).
--
-- Naming note: `ip_refferal` / `op_refferal` preserve the original
-- misspelling intentionally -- renaming would touch ~10+ call sites
-- in server/index.js for a purely cosmetic fix, out of scope here.
--
-- JSON-blob columns are `jsonb`. Every SELECT in server/index.js that
-- feeds one of these into a manual JSON.parse() call must append
-- `::text` to get a plain string back (see server/db.js Phase 2 notes) --
-- do not remove those casts when touching these queries later.

create table if not exists clinical.patient_credential (
    credential_id  bigint generated always as identity primary key,
    ip_no          text,
    op_no          text,
    email          text unique,
    password       text  -- bcrypt hash
);

create table if not exists clinical.patient_records (
    ip_no                     text primary key,
    name                      text,
    age                       integer,
    sex                       text,
    race                      text,
    ethnicity                 text,
    preferred_language        text,
    occupation                text,
    dept                      text,
    assigned_dept             text,
    doa                       date,
    dod                       date,
    reason_for_admission      text,
    past_medical_history      text,
    past_medication_history   text,
    smoker                    text,
    alcoholic                 text,
    insurance_type            text,
    weight_kg                 double precision,
    height_cm                 double precision,
    bmi                       double precision,
    followup_outcome          text
);

create table if not exists clinical.outpatient_records (
    op_no                     text primary key,
    name                      text,
    age                       integer,
    sex                       text,
    race                      text,
    ethnicity                 text,
    preferred_language        text,
    occupation                text,
    dept                      text,
    assigned_dept             text,
    doa                       date,
    reason_for_admission      text,
    past_medical_history      text,
    past_medication_history   text,
    smoker                    text,
    alcoholic                 text,
    insurance_type            text,
    weight_kg                 double precision,
    height_cm                 double precision,
    bmi                       double precision,
    followup_outcome          text
);

-- One row per patient, pre-seeded alongside patient_records/outpatient_records --
-- server/index.js only ever UPDATEs these, never INSERTs.
create table if not exists clinical.ip_diagnosis (
    ip_no                     text primary key references clinical.patient_records(ip_no),
    diagnosis                 text,
    secondary_diagnosis       text,
    clinical_notes            text,
    drugs_prescribed          text,
    drug_drug_interactions    text,
    drug_disease_alerts       text,
    drug_food_alerts          text,
    dose_adjustment_notes     text
);

create table if not exists clinical.op_diagnosis (
    op_no                     text primary key references clinical.outpatient_records(op_no),
    diagnosis                 text,
    secondary_diagnosis       text,
    clinical_notes            text,
    drugs_prescribed          text,
    drug_drug_interactions    text,
    drug_disease_alerts       text,
    drug_food_alerts          text,
    dose_adjustment_notes     text
);

create table if not exists clinical.ip_lab_results (
    ip_no                  text primary key references clinical.patient_records(ip_no),
    pulse                  double precision,
    egfr_ml_min_1_73m2     double precision,
    sodium                 double precision,
    potassium              double precision,
    chloride               double precision,
    total_bilirubin        double precision,
    freet3                 double precision,
    freet4                 double precision,
    tsh                    double precision,
    other_investigations   text
);

create table if not exists clinical.op_lab_results (
    op_no                  text primary key references clinical.outpatient_records(op_no),
    bp_systolic            double precision,
    bp_diastolic           double precision,
    pulse                  double precision,
    temperature            double precision,
    spo2                   double precision,
    hb                     double precision,
    wbc                    double precision,
    platelet_count         double precision,
    rbs                    double precision,
    fbs                    double precision,
    ppbs                   double precision,
    urea                   double precision,
    creatinine             double precision,
    egfr_ml_min_1_73m2     double precision,
    sodium                 double precision,
    potassium              double precision,
    chloride               double precision,
    sgot                   double precision,
    sgpt                   double precision,
    alp                    double precision,
    total_bilirubin        double precision,
    lipid_profile          text,
    ecg                    text,
    xray                   text,
    ultrasound             text,
    ct                     text,
    mri                    text,
    freet3                 double precision,
    freet4                 double precision,
    tsh                    double precision,
    other_investigations   text
);

create table if not exists clinical.drug_inventory (
    id               bigint generated always as identity primary key,
    brand_name       text,
    generic_name     text,
    strength         text,
    route            text,
    stocks           integer,
    cost_per_30_usd  double precision
);

create table if not exists clinical.ip_prescriptions (
    id            bigint generated always as identity primary key,
    ip_no         text references clinical.patient_records(ip_no),
    brand_name    text,
    generic_name  text,
    strength      text,
    route         text,
    frequency     text,
    days          text,
    added_on      timestamptz default now(),
    is_held       boolean default false
);

create table if not exists clinical.op_prescriptions (
    id            bigint generated always as identity primary key,
    op_no         text references clinical.outpatient_records(op_no),
    brand_name    text,
    generic_name  text,
    strength      text,
    route         text,
    frequency     text,
    days          text,
    added_on      timestamptz default now(),
    is_held       boolean default false
);

create table if not exists clinical.ip_prescription_notes (
    id        bigint generated always as identity primary key,
    ip_no     text references clinical.patient_records(ip_no),
    notes     text,
    added_on  timestamptz default now()
);

create table if not exists clinical.op_prescription_notes (
    id        bigint generated always as identity primary key,
    op_no     text references clinical.outpatient_records(op_no),
    notes     text,
    added_on  timestamptz default now()
);

-- One row per patient, upserted via existence-check + INSERT/UPDATE in
-- server/index.js -> becomes an ON CONFLICT (ip_no)/(op_no) upsert.
create table if not exists clinical.ip_drug_interactions (
    id                     bigint generated always as identity primary key,
    ip_no                  text unique references clinical.patient_records(ip_no),
    dd_severe              jsonb,
    dd_moderate            jsonb,
    dd_minor               jsonb,
    ddis_contraindicated   jsonb,
    ddis_moderate          jsonb,
    ddis_minor             jsonb,
    drug_food              jsonb,
    updated_at             timestamptz
);

create table if not exists clinical.op_drug_interactions (
    id                     bigint generated always as identity primary key,
    op_no                  text unique references clinical.outpatient_records(op_no),
    dd_severe              jsonb,
    dd_moderate            jsonb,
    dd_minor               jsonb,
    ddis_contraindicated   jsonb,
    ddis_moderate          jsonb,
    ddis_minor             jsonb,
    drug_food              jsonb,
    updated_at             timestamptz
);

create table if not exists clinical.ip_dosing_recommendations (
    id          bigint generated always as identity primary key,
    ip_no       text unique references clinical.patient_records(ip_no),
    high        jsonb,
    medium      jsonb,
    updated_at  timestamptz
);

create table if not exists clinical.op_dosing_recommendations (
    id          bigint generated always as identity primary key,
    op_no       text unique references clinical.outpatient_records(op_no),
    high        jsonb,
    medium      jsonb,
    updated_at  timestamptz
);

create table if not exists clinical.ip_patient_counselling (
    id                      bigint generated always as identity primary key,
    ip_no                   text unique references clinical.patient_records(ip_no),
    drug_counselling        jsonb,
    condition_counselling   jsonb,
    updated_at              timestamptz
);

create table if not exists clinical.op_patient_counselling (
    id                      bigint generated always as identity primary key,
    op_no                   text unique references clinical.outpatient_records(op_no),
    drug_counselling        jsonb,
    condition_counselling   jsonb,
    updated_at              timestamptz
);

create table if not exists clinical.ip_refferal (
    id                      bigint generated always as identity primary key,
    ip_no                   text references clinical.patient_records(ip_no),
    refer_to_department     text,
    refer_to_doctor         text,
    urgency                 text default 'Routine',
    referral_date           date,
    reason_for_referral     text,
    additional_notes        text,
    created_at              timestamptz default now()
);

create table if not exists clinical.op_refferal (
    id                      bigint generated always as identity primary key,
    op_no                   text references clinical.outpatient_records(op_no),
    refer_to_department     text,
    refer_to_doctor         text,
    urgency                 text default 'Routine',
    referral_date           date,
    reason_for_referral     text,
    additional_notes        text,
    created_at              timestamptz default now()
);

create table if not exists clinical.patient_referral_access (
    id            bigint generated always as identity primary key,
    patient_no    text,
    patient_type  text,
    from_dept     text,
    to_dept       text,
    referred_by   text
);

create table if not exists clinical.appointments (
    id                  bigint generated always as identity primary key,
    patient_no          text,
    patient_type        text,
    patient_name        text,
    doctor_name         text,
    doctor_dept         text,
    appointment_date    date,
    appointment_time    text,
    reason              text,
    status              text default 'Scheduled',
    created_at          timestamptz default now()
);

create table if not exists clinical.voice_notes (
    id                    bigint generated always as identity primary key,
    patient_no            text not null,
    patient_type          text not null,
    blob_name             text not null,  -- Supabase Storage object path post-migration (was an Azure Blob name)
    duration_seconds      double precision,
    recorded_by           text,
    transcript            text,           -- raw Whisper transcript
    diarized_transcript   jsonb,          -- [{speaker, text}, ...]
    soap_note             jsonb,          -- {subjective, objective, assessment, plan}
    language_detected     text,
    created_at            timestamptz default now()
);
