const BASE = `${import.meta.env.VITE_AGENT_BASE_URL}/agent`;

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

export async function runPhaseAnalysis({
  medications, diseases, age, sex,
  doseMap, patientProfile, patientLabs,
  preferredLanguage, signal, onPhaseComplete,
  userId = 'unknown', userEmail = '', patientNo = '',
}) {
  const sessionId = crypto.randomUUID();

  const body = JSON.stringify({
    medications,
    diseases:           diseases          || [],
    age:                age               || 45,
    sex:                sex               || 'unknown',
    dose_map:           doseMap           || {},
    patient_profile:    patientProfile    || {},
    patient_labs:       patientLabs       || {},
    preferred_language: preferredLanguage || null,
  });

  const headers = {
    'Content-Type':  'application/json',
    'X-User-ID':     userId,
    'X-User-Email':  userEmail,
    'X-Session-ID':  sessionId,
    'X-Resource-ID': patientNo,
  };

  const runPhase = async (phase, endpoint) => {
    if (signal?.aborted) return;
    try {
      const res  = await fetch(endpoint, { method: 'POST', headers, body, signal });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.detail || `${phase} failed (${res.status})`);
      onPhaseComplete?.(phase, data);
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      console.warn(`⚠️ Phase "${phase}" error:`, err.message);
      onPhaseComplete?.(phase, null);
    }
  };

  await Promise.all([
    runPhase('interactions', `${BASE}/analyze/interactions`),
    runPhase('dosing',       `${BASE}/analyze/dosing`),
  ]);

  if (signal?.aborted) return { status: 'interrupted' };

  await Promise.all([
    runPhase('counselling', `${BASE}/analyze/counselling`),
    runPhase('summary',     `${BASE}/analyze/summary`),
  ]);

  if (signal?.aborted) return { status: 'interrupted' };

  return { status: 'complete' };
}

export async function runAgentAnalysis({
  medications, diseases, age, sex,
  doseMap, patientProfile, patientLabs, preferredLanguage,
}) {
  const res = await fetch(`${BASE}/analyze`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      medications,
      diseases:           diseases          || [],
      age:                age               || 45,
      sex:                sex               || 'unknown',
      dose_map:           doseMap           || {},
      patient_profile:    patientProfile    || {},
      patient_labs:       patientLabs       || {},
      preferred_language: preferredLanguage || null,
    }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data?.detail || data?.message || `Analysis failed (${res.status})`);
  if (!data.analysis) throw new Error('Analysis response missing "analysis" field.');
  return data;
}

export async function quickDrugPairCheck(drug1, drug2) {
  const res  = await fetch(`${BASE}/check/drug-pair`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ drug1, drug2 }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data?.detail || 'Drug pair check failed');
  return data;
}

export async function validateDrugName(drugName) {
  const res = await fetch(`${BASE}/validate/drug`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ drug_name: drugName }),
  });
  if (!res.ok) return { recognised: false };
  return safeJson(res);
}

export async function getDosingOnly({ medications, diseases, age, sex, doseMap, patientLabs }) {
  const res  = await fetch(`${BASE}/dosing`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      medications,
      diseases:     diseases    || [],
      age, sex,
      dose_map:     doseMap     || {},
      patient_labs: patientLabs || {},
    }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data?.detail || 'Dosing request failed');
  return data;
}