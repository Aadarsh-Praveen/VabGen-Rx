/*
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
// userId and userEmail are passed as X-User-ID and X-User-Email
// headers on every PHI-touching request so the HIPAA audit log
// records the doctor who ran the analysis instead of "anonymous".
//
// signal (AbortSignal) is accepted and passed to every fetch so the
// doctor can click Stop at any time and cancel all in-flight requests
// instantly. Phases that have already completed keep their results.
// Aborted phases are silently ignored (not treated as errors).
export async function runPhaseAnalysis({
  medications, diseases, age, sex,
  doseMap, patientProfile, patientLabs,
  preferredLanguage, onPhaseComplete,
  signal,       // AbortSignal from parent
  userId,       // doctor's ID — sent as X-User-ID for HIPAA audit
  userEmail,    // doctor's email — sent as X-User-Email for HIPAA audit
}) {
  const payload = buildPayload({
    medications, diseases, age, sex,
    doseMap, patientProfile, patientLabs, preferredLanguage,
  });

  // ── HIPAA audit headers ───────────────────────────────────────
  // X-User-ID and X-User-Email identify the doctor in phi_audit_log.
  // X-Session-ID groups all four phase calls under one analysis
  // session so a compliance auditor can correlate them.
  // crypto.randomUUID() is available in all modern browsers.
  const sessionId = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

  const headers = {
    'Content-Type': 'application/json',
    'X-User-ID':    userId    || 'anonymous',
    'X-User-Email': userEmail || '',
    'X-Session-ID': sessionId,
  };

  const body = JSON.stringify(payload);

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

  // Helper — wraps each phase fetch with abort awareness
  // If aborted: resolves silently with null (not an error)
  // If failed:  logs error, calls onPhaseComplete with null
  const makePhase = (name, url, onData) =>
    fetch(url, { method: 'POST', headers, body, signal })
      .then(safeJson)
      .then(data => {
        if (signal?.aborted) return null;
        onData(data);
        onPhaseComplete?.(name, { ...result });
        return data;
      })
      .catch(err => {
        if (err.name === 'AbortError') return null;
        console.error(`${name} phase failed:`, err);
        onPhaseComplete?.(name, null);
        return null;
      });

  // Fire all four phases simultaneously
  const fetchInteractions = makePhase(
    'interactions',
    `${BASE}/analyze/interactions`,
    data => {
      result.drug_drug           = data.drug_drug           || [];
      result.drug_disease        = data.drug_disease        || [];
      result.drug_food           = data.drug_food           || [];
      result.compounding_signals = data.compounding_signals || {};
    }
  );

  const fetchDosing = makePhase(
    'dosing',
    `${BASE}/analyze/dosing`,
    data => {
      result.dosing_recommendations = data.dosing_recommendations || [];
    }
  );

  const fetchCounselling = makePhase(
    'counselling',
    `${BASE}/analyze/counselling`,
    data => {
      result.drug_counseling      = data.drug_counseling      || [];
      result.condition_counseling = data.condition_counseling || [];
    }
  );

  const fetchSummary = makePhase(
    'summary',
    `${BASE}/analyze/summary`,
    data => {
      result.risk_summary = data.risk_summary || {};
      if (data.compounding_signals && Object.keys(data.compounding_signals).length > 0)
        result.compounding_signals = data.compounding_signals;
    }
  );

  // Wait for all — UI already updated as each arrived
  await Promise.allSettled([
    fetchInteractions, fetchDosing, fetchCounselling, fetchSummary,
  ]);

  // If aborted, reflect that in the return status
  if (signal?.aborted) return { status: 'interrupted', analysis: result };

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
    body: JSON.stringify({
      medications,
      diseases:     diseases  || [],
      age, sex,
      dose_map:     doseMap   || {},
      patient_labs: patientLabs || {},
    }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data?.detail || 'Dosing request failed');
  return data;
}*/



// my-react-app/src/services/agentApi.js
import { apiFetch } from "./api";

const BASE = '/agent';

// ── Build patient profile from patient record ─────────────────────
export function buildPatientProfile(patient) {
  const profile = {};
  if (patient?.Smoker    === 'Yes') profile.smokes         = true;
  if (patient?.Smoker    === 'No')  profile.smokes         = false;
  if (patient?.Alcoholic === 'Yes') profile.drinks_alcohol = true;
  if (patient?.Alcoholic === 'No')  profile.drinks_alcohol = false;
  if (patient?.Sex === 'M')         profile.is_pregnant    = false;
  return profile;
}

// ── Build lab data from lab results record ─────────────────────────
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

// ── Safely parse JSON from a fetch response ────────────────────────
async function safeJson(res) {
  const text = await res.text();
  if (!text || text.trim() === '') {
    throw new Error('Server returned an empty response.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Server returned invalid JSON: ${text.slice(0, 120)}`);
  }
}

// ── Phase-based analysis (used by diagnosis.jsx) ──────────────────
export async function runPhaseAnalysis({
  medications,
  diseases,
  age,
  sex,
  doseMap,
  patientProfile,
  patientLabs,
  preferredLanguage,
  signal,
  onPhaseComplete,
  userId     = 'unknown',
  userEmail  = '',
  patientNo  = '',           // ← IP_No or OP_No — sent as header, hashed server-side
}) {
  // ── Generate one session UUID for all 4 phases ────────────────
  // This means all 4 audit log rows share the same session_id
  // so you can trace one complete analysis in the audit log.
  const sessionId = crypto.randomUUID();

  const body = JSON.stringify({
    medications,
    diseases:           diseases         || [],
    age:                age              || 45,
    sex:                sex              || 'unknown',
    dose_map:           doseMap          || {},
    patient_profile:    patientProfile   || {},
    patient_labs:       patientLabs      || {},
    preferred_language: preferredLanguage || null,
  });

  const headers = {
    'Content-Type':   'application/json',
    'X-User-ID':      userId,
    'X-User-Email':   userEmail,
    'X-Session-ID':   sessionId,     // ← same UUID across all 4 phases
    'X-Resource-ID':  patientNo,     // ← raw ID sent over HTTPS, hashed server-side
  };

  // ── Helper: run one phase, notify callback ─────────────────────
  const runPhase = async (phase, endpoint) => {
    if (signal?.aborted) return;
    try {
      const res  = await apiFetch(endpoint, { method: 'POST', headers, body });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.detail || `${phase} failed (${res.status})`);
      onPhaseComplete?.(phase, data);
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      console.warn(`⚠️ Phase "${phase}" error:`, err.message);
      onPhaseComplete?.(phase, null);
    }
  };

  // Interactions and dosing in parallel
  await Promise.all([
    runPhase('interactions', `${BASE}/analyze/interactions`),
    runPhase('dosing',       `${BASE}/analyze/dosing`),
  ]);

  if (signal?.aborted) return { status: 'interrupted' };

  // Counselling and summary in parallel
  await Promise.all([
    runPhase('counselling', `${BASE}/analyze/counselling`),
    runPhase('summary',     `${BASE}/analyze/summary`),
  ]);

  if (signal?.aborted) return { status: 'interrupted' };

  return { status: 'complete' };
}

// ── Full single-call analysis ─────────────────────────────────────
export async function runAgentAnalysis({
  medications, diseases, age, sex,
  doseMap, patientProfile, patientLabs, preferredLanguage,
}) {
  const res = await apiFetch(`${BASE}/analyze`, {
    method: 'POST',
    body: JSON.stringify({
      medications,
      diseases:           diseases         || [],
      age:                age              || 45,
      sex:                sex              || 'unknown',
      dose_map:           doseMap          || {},
      patient_profile:    patientProfile   || {},
      patient_labs:       patientLabs      || {},
      preferred_language: preferredLanguage || null,
    }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data?.detail || data?.message || `Analysis failed (${res.status})`);
  if (!data.analysis) throw new Error('Analysis response missing "analysis" field.');
  return data;
}

// ── Quick drug pair check ──────────────────────────────────────────
export async function quickDrugPairCheck(drug1, drug2) {
  const res  = await apiFetch(`${BASE}/check/drug-pair`, {
    method: 'POST',
    body:   JSON.stringify({ drug1, drug2 }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data?.detail || 'Drug pair check failed');
  return data;
}

// ── Validate drug name against FDA ────────────────────────────────
export async function validateDrugName(drugName) {
  const res = await apiFetch(`${BASE}/validate/drug`, {
    method: 'POST',
    body:   JSON.stringify({ drug_name: drugName }),
  });
  if (!res.ok) return { recognised: false };
  return safeJson(res);
}

// ── Dosing only ───────────────────────────────────────────────────
export async function getDosingOnly({ medications, diseases, age, sex, doseMap, patientLabs }) {
  const res  = await apiFetch(`${BASE}/dosing`, {
    method: 'POST',
    body:   JSON.stringify({
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