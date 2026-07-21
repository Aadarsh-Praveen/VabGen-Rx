require('dotenv').config();
const { Pool, types } = require('pg');

// pg returns bigint (identity PK) columns as strings by default, to avoid
// precision loss outside Number.MAX_SAFE_INTEGER. This app's IDs never
// approach that range and the rest of the code (JS numbers, JSON) expects
// plain numbers here, exactly like mssql's INT IDENTITY columns produced.
types.setTypeParser(20, val => parseInt(val, 10));

// Inert type markers. Every `.input(name, sql.Something, value)` call site
// across index.js keeps working unchanged -- these values are never
// inspected, they only existed so mssql knew how to bind params.
const sql = {
  VarChar: 'VarChar', NVarChar: 'NVarChar', Text: 'Text',
  Int: 'Int', BigInt: 'BigInt', Float: 'Float', Bit: 'Bit',
  Date: 'Date', DateTime: 'DateTime',
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ── Case restoration ────────────────────────────────────────────────────────
// Postgres folds every unquoted identifier to lowercase, both in the table
// definition and in query results -- unlike SQL Server, which preserves
// whatever case a column was declared with. The `clinical` schema's columns
// were declared PascalCase-ish (IP_No, DD_Severe, BMI, ...) to match the
// original SQL Server table shape the frontend/backend already expect, so
// every query result on that schema needs its keys restored to that casing.
//
// `app.users` is exempt: it already used snake_case/lowercase columns
// (hospital_id, licence_no, ...) so no restoration is needed there -- and
// some names collide (e.g. "email"/"name"/"id" mean something different in
// app.users than in the clinical-schema patient-portal join query), so
// restoration is skipped entirely for any query touching app.users.
const CLINICAL_CASE_MAP = {
  credential_id: 'Credential_ID', ip_no: 'IP_No', op_no: 'OP_No',
  email: 'Email', password: 'Password',
  id: 'ID', name: 'Name', age: 'Age', sex: 'Sex', race: 'Race',
  ethnicity: 'Ethnicity', preferred_language: 'Preferred_Language',
  occupation: 'Occupation', dept: 'Dept', assigned_dept: 'Assigned_Dept',
  doa: 'DOA', dod: 'DOD', reason_for_admission: 'Reason_for_Admission',
  past_medical_history: 'Past_Medical_History',
  past_medication_history: 'Past_Medication_History',
  smoker: 'Smoker', alcoholic: 'Alcoholic', insurance_type: 'Insurance_Type',
  weight_kg: 'Weight_kg', height_cm: 'Height_cm', bmi: 'BMI',
  followup_outcome: 'Followup_Outcome',
  diagnosis: 'Diagnosis', secondary_diagnosis: 'Secondary_Diagnosis',
  clinical_notes: 'Clinical_Notes', drugs_prescribed: 'Drugs_Prescribed',
  drug_drug_interactions: 'Drug_Drug_Interactions',
  drug_disease_alerts: 'Drug_Disease_Alerts', drug_food_alerts: 'Drug_Food_Alerts',
  dose_adjustment_notes: 'Dose_Adjustment_Notes',
  pulse: 'Pulse', egfr_ml_min_1_73m2: 'eGFR_mL_min_1_73m2', sodium: 'Sodium',
  potassium: 'Potassium', chloride: 'Chloride', total_bilirubin: 'Total_Bilirubin',
  freet3: 'FreeT3', freet4: 'FreeT4', tsh: 'TSH',
  other_investigations: 'Other_Investigations',
  bp_systolic: 'BP_Systolic', bp_diastolic: 'BP_Diastolic',
  temperature: 'Temperature', spo2: 'SpO2', hb: 'Hb', wbc: 'WBC',
  platelet_count: 'Platelet_Count', rbs: 'RBS', fbs: 'FBS', ppbs: 'PPBS',
  urea: 'Urea', creatinine: 'Creatinine', sgot: 'SGOT', sgpt: 'SGPT',
  alp: 'ALP', lipid_profile: 'Lipid_Profile', ecg: 'ECG', xray: 'Xray',
  ultrasound: 'Ultrasound', ct: 'CT', mri: 'MRI',
  brand_name: 'Brand_Name', generic_name: 'Generic_Name', strength: 'Strength',
  route: 'Route', stocks: 'Stocks', cost_per_30_usd: 'Cost_Per_30_USD',
  frequency: 'Frequency', days: 'Days', added_on: 'Added_On', is_held: 'Is_Held',
  notes: 'Notes',
  dd_severe: 'DD_Severe', dd_moderate: 'DD_Moderate', dd_minor: 'DD_Minor',
  ddis_contraindicated: 'DDis_Contraindicated', ddis_moderate: 'DDis_Moderate',
  ddis_minor: 'DDis_Minor', drug_food: 'Drug_Food', updated_at: 'Updated_At',
  high: 'High', medium: 'Medium',
  drug_counselling: 'Drug_Counselling', condition_counselling: 'Condition_Counselling',
  refer_to_department: 'Refer_To_Department', refer_to_doctor: 'Refer_To_Doctor',
  urgency: 'Urgency', referral_date: 'Referral_Date',
  reason_for_referral: 'Reason_For_Referral', additional_notes: 'Additional_Notes',
  created_at: 'Created_At',
  patient_no: 'Patient_No', patient_type: 'Patient_Type', from_dept: 'From_Dept',
  to_dept: 'To_Dept', referred_by: 'Referred_By',
  patient_name: 'Patient_Name', doctor_name: 'Doctor_Name', doctor_dept: 'Doctor_Dept',
  appointment_date: 'Appointment_Date', appointment_time: 'Appointment_Time',
  reason: 'Reason', status: 'Status',
  blob_name: 'Blob_Name', duration_seconds: 'Duration_Seconds',
  recorded_by: 'Recorded_By', transcript: 'Transcript',
  diarized_transcript: 'Diarized_Transcript', soap_note: 'Soap_Note',
  language_detected: 'Language_Detected', has_transcript: 'Has_Transcript',
};

const restoreCase = (rows, skip) => {
  if (skip) return rows;
  return rows.map(row => {
    const out = {};
    for (const key of Object.keys(row)) {
      out[CLINICAL_CASE_MAP[key] || key] = row[key];
    }
    return out;
  });
};

class RequestBuilder {
  constructor() {
    this._params = [];
  }

  input(name, _type, value) {
    this._params.push({ name, value });
    return this;
  }

  async query(text) {
    // Rewrite every `@paramName` into a positional `$N`, first-appearance
    // order, so the same named param can be referenced more than once.
    const seen = new Map();
    let n = 0;
    const rewritten = text.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => {
      if (!seen.has(name)) { n += 1; seen.set(name, n); }
      return `$${seen.get(name)}`;
    });

    const values = new Array(seen.size);
    for (const { name, value } of this._params) {
      const idx = seen.get(name);
      if (idx) values[idx - 1] = value;
    }

    const result = await pool.query(rewritten, values);
    const skipRestore = /\bapp\.users\b/i.test(text);
    return { recordset: restoreCase(result.rows, skipRestore), rowsAffected: [result.rowCount] };
  }
}

const poolLike = { request: () => new RequestBuilder() };

const poolPromise = Promise.resolve(poolLike);
const patientsPoolPromise = Promise.resolve(poolLike);

module.exports = { sql, poolPromise, patientsPoolPromise };
