// my-react-app/src/services/agentApi.js

const BASE = '/agent';

export function buildPatientProfile(patient) {
  const profile = {};
  if (patient?.Smoker    === 'Yes') profile.smokes         = true;
  if (patient?.Smoker    === 'No')  profile.smokes         = false;
  if (patient?.Alcoholic === 'Yes') profile.drinks_alcohol = true;
  if (patient?.Alcoholic === 'No')  profile.drinks_alcohol = false;
  if (patient?.Sex === 'M')         profile.is_pregnant    = false;
  return profile;
}

export function buildPatientLabs(lab, patient) {
  const labs = {};
  if (patient?.Weight_kg)       labs.weight_kg = parseFloat(patient.Weight_kg);
  if (patient?.Height_cm)       labs.height_cm = parseFloat(patient.Height_cm);
  if (patient?.BMI)             labs.bmi       = parseFloat(patient.BMI);
  if (lab?.eGFR_mL_min_1_73m2) labs.egfr      = parseFloat(lab.eGFR_mL_min_1_73m2);
  if (lab?.Sodium)              labs.sodium    = parseFloat(lab.Sodium);
  if (lab?.Potassium)           labs.potassium = parseFloat(lab.Potassium);
  if (lab?.Total_Bilirubin)     labs.bilirubin = parseFloat(lab.Total_Bilirubin);
  if (lab?.TSH)                 labs.tsh       = parseFloat(lab.TSH);
  if (lab?.FreeT3)              labs.free_t3   = parseFloat(lab.FreeT3);
  if (lab?.FreeT4)              labs.free_t4   = parseFloat(lab.FreeT4);
  if (lab?.Pulse)               labs.pulse     = parseInt(lab.Pulse);

  const standard = new Set([
    'eGFR_mL_min_1_73m2','Sodium','Potassium','Total_Bilirubin',
    'TSH','FreeT3','FreeT4','Pulse','IP_No','OP_No',
  ]);
  const other = {};
  for (const [k, v] of Object.entries(lab || {})) {
    if (!standard.has(k) && v != null && v !== '') other[k] = v;
  }
  if (Object.keys(other).length > 0) labs.other_investigations = other;
  return labs;
}

async function safeJson(res) {
  const text = await res.text();
  if (!text || text.trim() === '')
    throw new Error('Server returned an empty response.');
  try { return JSON.parse(text); }
  catch { throw new Error(`Server returned invalid JSON: ${text.slice(0, 120)}`); }
}

function buildPayload({ medications, diseases, age, sex, doseMap, patientProfile, patientLabs, preferredLanguage }) {
  return {
    medications,
    diseases:           diseases          || [],
    age:                age               || 45,
    sex:                sex               || 'unknown',
    dose_map:           doseMap           || {},
    patient_profile:    patientProfile    || {},
    patient_labs:       patientLabs       || {},
    preferred_language: preferredLanguage || null,
  };
}

export async function runAgentAnalysis({ medications, diseases, age, sex, doseMap, patientProfile, patientLabs, preferredLanguage }) {
  const res  = await fetch(`${BASE}/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildPayload({ medications, diseases, age, sex, doseMap, patientProfile, patientLabs, preferredLanguage })),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data?.detail || data?.message || `Analysis failed (${res.status})`);
  if (!data.analysis) throw new Error('Analysis response was empty or missing the "analysis" field.');
  return data;
}

// ── Phase analysis — ALL phases fire in parallel ──────────────────
// Each phase calls onPhaseComplete the moment it finishes.
// The UI updates immediately per phase — no waiting for all.
//
// Why parallel not sequential:
//   Sequential = user waits for interactions (~30s) THEN dosing
//   (~15s) THEN counselling (~10s) = 55s total visible wait.
//
//   Parallel = all start at once. Dosing arrives ~15s,
//   counselling ~10s, interactions ~30s, summary ~20s.
//   User sees dosing and counselling in ~10-15s while
//   interactions is still processing. Total time = ~30s
//   (the slowest phase) not 55s (sum of all phases).
//
//   The PubMed rate limit issue from before was caused by the
//   summary endpoint running the full pipeline again in parallel.
//   That is now fixed — summary only runs OrchestratorAgent.
//   So parallel phase calls are safe again.
export async function runPhaseAnalysis({
  medications, diseases, age, sex,
  doseMap, patientProfile, patientLabs,
  preferredLanguage, onPhaseComplete,
}) {
  const payload = buildPayload({ medications, diseases, age, sex, doseMap, patientProfile, patientLabs, preferredLanguage });
  const headers = { 'Content-Type': 'application/json' };
  const body    = JSON.stringify(payload);

  // Accumulated result — merged as each phase completes
  const result = {
    drug_drug:              [],
    drug_disease:           [],
    drug_food:              [],
    dosing_recommendations: [],
    drug_counseling:        [],
    condition_counseling:   [],
    compounding_signals:    {},
    risk_summary:           {},
  };

  // Fire all four phases simultaneously
  const fetchInteractions = fetch(`${BASE}/analyze/interactions`, { method: 'POST', headers, body })
    .then(safeJson)
    .then(data => {
      result.drug_drug           = data.drug_drug           || [];
      result.drug_disease        = data.drug_disease        || [];
      result.drug_food           = data.drug_food           || [];
      result.compounding_signals = data.compounding_signals || {};
      onPhaseComplete?.('interactions', { ...result });
      return data;
    })
    .catch(err => { console.error('Interactions phase failed:', err); onPhaseComplete?.('interactions', null); return null; });

  const fetchDosing = fetch(`${BASE}/analyze/dosing`, { method: 'POST', headers, body })
    .then(safeJson)
    .then(data => {
      result.dosing_recommendations = data.dosing_recommendations || [];
      onPhaseComplete?.('dosing', { ...result });
      return data;
    })
    .catch(err => { console.error('Dosing phase failed:', err); onPhaseComplete?.('dosing', null); return null; });

  const fetchCounselling = fetch(`${BASE}/analyze/counselling`, { method: 'POST', headers, body })
    .then(safeJson)
    .then(data => {
      result.drug_counseling      = data.drug_counseling      || [];
      result.condition_counseling = data.condition_counseling || [];
      onPhaseComplete?.('counselling', { ...result });
      return data;
    })
    .catch(err => { console.error('Counselling phase failed:', err); onPhaseComplete?.('counselling', null); return null; });

  const fetchSummary = fetch(`${BASE}/analyze/summary`, { method: 'POST', headers, body })
    .then(safeJson)
    .then(data => {
      result.risk_summary = data.risk_summary || {};
      if (data.compounding_signals && Object.keys(data.compounding_signals).length > 0)
        result.compounding_signals = data.compounding_signals;
      onPhaseComplete?.('summary', { ...result });
      return data;
    })
    .catch(err => { console.error('Summary phase failed:', err); onPhaseComplete?.('summary', null); return null; });

  // Wait for all — but UI already updated as each arrived
  await Promise.allSettled([fetchInteractions, fetchDosing, fetchCounselling, fetchSummary]);

  return { status: 'completed', analysis: result };
}

export async function quickDrugPairCheck(drug1, drug2) {
  const res  = await fetch(`${BASE}/check/drug-pair`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drug1, drug2 }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data?.detail || 'Drug pair check failed');
  return data;
}

export async function validateDrugName(drugName) {
  const res = await fetch(`${BASE}/validate/drug`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drug_name: drugName }),
  });
  if (!res.ok) return { recognised: false };
  return safeJson(res);
}

export async function getDosingOnly({ medications, diseases, age, sex, doseMap, patientLabs }) {
  const res  = await fetch(`${BASE}/dosing`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ medications, diseases: diseases || [], age, sex, dose_map: doseMap || {}, patient_labs: patientLabs || {} }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data?.detail || 'Dosing request failed');
  return data;
}