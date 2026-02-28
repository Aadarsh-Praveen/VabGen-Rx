// my-react-app/src/services/agentApi.js

const BASE = '/agent';

// ── Build patient profile from patient record ─────────────────────
export function buildPatientProfile(patient) {
  const profile = {};
  if (patient?.Smoker   === 'Yes') profile.smokes         = true;
  if (patient?.Smoker   === 'No')  profile.smokes         = false;
  if (patient?.Alcoholic === 'Yes') profile.drinks_alcohol = true;
  if (patient?.Alcoholic === 'No')  profile.drinks_alcohol = false;
  if (patient?.Sex === 'M')         profile.is_pregnant    = false;
  return profile;
}

// ── Build lab data from lab results record ─────────────────────────
export function buildPatientLabs(lab, patient) {
  const labs = {};
  if (patient?.Weight_kg)           labs.weight_kg  = parseFloat(patient.Weight_kg);
  if (patient?.Height_cm)           labs.height_cm  = parseFloat(patient.Height_cm);
  if (patient?.BMI)                 labs.bmi        = parseFloat(patient.BMI);
  if (lab?.eGFR_mL_min_1_73m2)     labs.egfr       = parseFloat(lab.eGFR_mL_min_1_73m2);
  if (lab?.Sodium)                  labs.sodium     = parseFloat(lab.Sodium);
  if (lab?.Potassium)               labs.potassium  = parseFloat(lab.Potassium);
  if (lab?.Total_Bilirubin)         labs.bilirubin  = parseFloat(lab.Total_Bilirubin);
  if (lab?.TSH)                     labs.tsh        = parseFloat(lab.TSH);
  if (lab?.FreeT3)                  labs.free_t3    = parseFloat(lab.FreeT3);
  if (lab?.FreeT4)                  labs.free_t4    = parseFloat(lab.FreeT4);
  if (lab?.Pulse)                   labs.pulse      = parseInt(lab.Pulse);

  // Pass any extra lab fields automatically as other_investigations
  const standard = new Set([
    'eGFR_mL_min_1_73m2','Sodium','Potassium','Total_Bilirubin',
    'TSH','FreeT3','FreeT4','Pulse','IP_No','OP_No'
  ]);
  const other = {};
  for (const [k, v] of Object.entries(lab || {})) {
    if (!standard.has(k) && v != null && v !== '') other[k] = v;
  }
  if (Object.keys(other).length > 0) labs.other_investigations = other;

  return labs;
}

// ── Full agent analysis (Safety + Disease + Counseling + Dosing) ───
export async function runAgentAnalysis({
  medications,
  diseases,
  age,
  sex,
  doseMap,
  patientProfile,
  patientLabs,
  preferredLanguage,
}) {
  const res = await fetch(`${BASE}/agent/analyze`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      medications,
      diseases:           diseases        || [],
      age:                age             || 45,
      sex:                sex             || 'unknown',
      dose_map:           doseMap         || {},
      patient_profile:    patientProfile  || {},
      patient_labs:       patientLabs     || {},
      preferred_language: preferredLanguage || null,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Agent analysis failed');
  }
  return res.json();
}

// ── Quick drug pair check (when doctor adds a new drug) ────────────
export async function quickDrugPairCheck(drug1, drug2) {
  const res = await fetch(`${BASE}/check/drug-pair`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drug1, drug2 }),
  });
  if (!res.ok) throw new Error('Drug pair check failed');
  return res.json();
}

// ── Validate drug name against FDA (while doctor types) ────────────
export async function validateDrugName(drugName) {
  const res = await fetch(`${BASE}/validate/drug`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drug_name: drugName }),
  });
  if (!res.ok) return { recognised: false };
  return res.json();
}

// ── Dosing only (without full agent) ──────────────────────────────
export async function getDosingOnly({ medications, diseases, age, sex, doseMap, patientLabs }) {
  const res = await fetch(`${BASE}/dosing`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      medications,
      diseases:     diseases     || [],
      age,
      sex,
      dose_map:     doseMap      || {},
      patient_labs: patientLabs  || {},
    }),
  });
  if (!res.ok) throw new Error('Dosing request failed');
  return res.json();
}