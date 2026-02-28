import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Nav from "../components/nav";
import DiagnosisTab from "../components/diagnosis";
import { apiFetch } from "../services/api";
import "./patientDetails.css";

const Section = ({ title, children }) => (
  <div className="pd-section">
    <h4 className="pd-section-title">{title}</h4>
    <div className="pd-section-body">{children}</div>
  </div>
);

const Row = ({ label, value }) => (
  <div className="pd-row">
    <span className="pd-label">{label}</span>
    <span className="pd-value">{value ?? "—"}</span>
  </div>
);

const PatientInfoTab = ({ p, isOutpatient }) => {
  const doa = p.DOA ? new Date(p.DOA).toLocaleDateString() : "—";
  const dod = p.DOD ? new Date(p.DOD).toLocaleDateString() : null;
  return (
    <div className="pd-tab-content">
      <Section title="👤 Demographics">
        <Row label="Full Name"          value={p.Name} />
        <Row label="Age"                value={`${p.Age} years`} />
        <Row label="Sex"                value={p.Sex === "M" ? "Male" : "Female"} />
        <Row label="Race"               value={p.Race} />
        <Row label="Ethnicity"          value={p.Ethnicity} />
        <Row label="Preferred Language" value={p.Preferred_Language} />
        <Row label="Occupation"         value={p.Occupation} />
        <Row label="Weight"             value={p.Weight_kg ? `${p.Weight_kg} kg` : null} />
        <Row label="Height"             value={p.Height_cm ? `${p.Height_cm} cm` : null} />
        <Row label="BMI"                value={p.BMI} />
        <Row label="Insurance Type"     value={p.Insurance_Type} />
      </Section>
      <Section title="🏥 Visit Info">
        <Row label={isOutpatient ? "OP Number" : "IP Number"} value={isOutpatient ? p.OP_No : p.IP_No} />
        <Row label="Department"              value={p.Dept} />
        <Row label="Date of Admission"       value={doa} />
        {!isOutpatient && <Row label="Date of Discharge" value={dod} />}
        <Row label="Reason for Admission"    value={p.Reason_for_Admission} />
        <Row label="Past Medical History"    value={p.Past_Medical_History} />
        <Row label="Past Medication History" value={p.Past_Medication_History} />
      </Section>
      <Section title="🚬 Lifestyle">
        <Row label="Smoker"    value={p.Smoker} />
        <Row label="Alcoholic" value={p.Alcoholic} />
      </Section>
      <Section title="📋 Outcome">
        <Row label="Follow-up Outcome" value={p.Followup_Outcome} />
      </Section>
    </div>
  );
};

const LabResultsTab = ({ p, isOutpatient }) => {
  const [lab, setLab]         = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const patientNo = isOutpatient ? p.OP_No : p.IP_No;

  useEffect(() => {
    const fetchLab = async () => {
      try {
        const endpoint = isOutpatient
          ? `/api/op-lab/${encodeURIComponent(patientNo)}`
          : `/api/lab/${encodeURIComponent(patientNo)}`;
        const res  = await apiFetch(endpoint);
        const data = await res.json();
        if (res.ok) setLab(data.lab);
        else setError(data.message);
      } catch { setError("Could not load lab results."); }
      finally  { setLoading(false); }
    };
    fetchLab();
  }, [patientNo]);

  if (loading) return <div className="pd-state"><div className="pd-spinner" /><p>Loading lab results...</p></div>;
  if (error)   return <div className="pd-state pd-error">⚠️ {error}</div>;
  if (!lab)    return <div className="pd-state">No lab results found for this patient.</div>;

  return (
    <div className="pd-tab-content">
      <Section title="❤️ Vitals">
        {isOutpatient && <Row label="BP" value={lab.BP_Systolic && lab.BP_Diastolic ? `${lab.BP_Systolic}/${lab.BP_Diastolic} mmHg` : null} />}
        <Row label="Pulse (bpm)" value={lab.Pulse} />
        {isOutpatient && <Row label="Temperature (°C)" value={lab.Temperature} />}
        {isOutpatient && <Row label="SpO2 (%)"          value={lab.SpO2} />}
      </Section>
      {isOutpatient && <Section title="🧪 Haematology">
        <Row label="Hb (g/dl)"      value={lab.Hb} />
        <Row label="WBC (×10³/μL)"  value={lab.WBC} />
        <Row label="Platelet Count" value={lab.Platelet_Count} />
      </Section>}
      {isOutpatient && <Section title="🩸 Blood Sugar">
        <Row label="RBS (mg/dl)"  value={lab.RBS} />
        <Row label="FBS (mg/dl)"  value={lab.FBS} />
        <Row label="PPBS (mg/dl)" value={lab.PPBS} />
      </Section>}
      <Section title="🫘 Renal Function">
        <Row label="Urea (mg/dl)"         value={lab.Urea} />
        <Row label="Creatinine (mg/dl)"   value={lab.Creatinine} />
        <Row label="eGFR (mL/min/1.73m²)" value={lab.eGFR_mL_min_1_73m2} />
      </Section>
      <Section title="⚡ Electrolytes">
        <Row label="Sodium"    value={lab.Sodium} />
        <Row label="Potassium" value={lab.Potassium} />
        <Row label="Chloride"  value={lab.Chloride} />
      </Section>
      <Section title="🫀 Liver Function">
        {isOutpatient && <Row label="SGOT (U/L)" value={lab.SGOT} />}
        {isOutpatient && <Row label="SGPT (U/L)" value={lab.SGPT} />}
        {isOutpatient && <Row label="ALP (U/L)"  value={lab.ALP} />}
        <Row label="Total Bilirubin" value={lab.Total_Bilirubin} />
      </Section>
      {isOutpatient && <Section title="💊 Lipid Profile"><Row label="Result" value={lab.Lipid_Profile} /></Section>}
      {isOutpatient && <Section title="🖼️ Imaging & Special Tests">
        <Row label="ECG"        value={lab.ECG} />
        <Row label="X-Ray"      value={lab.Xray} />
        <Row label="Ultrasound" value={lab.Ultrasound} />
        <Row label="CT Scan"    value={lab.CT} />
        <Row label="MRI"        value={lab.MRI} />
      </Section>}
      <Section title="🦋 Thyroid">
        <Row label="Free T3" value={lab.FreeT3} />
        <Row label="Free T4" value={lab.FreeT4} />
        <Row label="TSH"     value={lab.TSH} />
      </Section>
      <Section title="🔬 Other Investigations">
        <p className="pd-long-text">{lab.Other_Investigations || "—"}</p>
      </Section>
    </div>
  );
};

const ReferralTab = ({ p, isOutpatient }) => {
  const [referral, setReferral] = useState({
    to_dept: "", to_doctor: "", urgency: "Routine",
    reason: "", notes: "", date: new Date().toISOString().split("T")[0],
  });
  const [printed, setPrinted] = useState(false);
  const patientNo = p.IP_No || p.OP_No;

  return (
    <div className="pd-tab-content">
      <Section title="📨 Referral Form">
        <div className="pd-referral-form">
          <div className="pd-print-header">
            <h2>Patient Referral Letter</h2>
            <p><strong>Patient:</strong> {p.Name} &nbsp;|&nbsp; <strong>Age/Sex:</strong> {p.Age} / {p.Sex === "M" ? "Male" : "Female"} &nbsp;|&nbsp; <strong>{isOutpatient ? "OP No" : "IP No"}:</strong> {patientNo}</p>
            <p><strong>Dept:</strong> {p.Dept} &nbsp;|&nbsp; <strong>Date:</strong> {referral.date}</p>
            <hr />
          </div>
          <div className="pd-form-grid">
            <div className="pd-form-group">
              <label>Refer To Department</label>
              <input value={referral.to_dept} onChange={e => setReferral(r => ({ ...r, to_dept: e.target.value }))} placeholder="e.g. Cardiology" />
            </div>
            <div className="pd-form-group">
              <label>Refer To Doctor</label>
              <input value={referral.to_doctor} onChange={e => setReferral(r => ({ ...r, to_doctor: e.target.value }))} placeholder="e.g. Dr. Smith" />
            </div>
            <div className="pd-form-group">
              <label>Urgency</label>
              <select value={referral.urgency} onChange={e => setReferral(r => ({ ...r, urgency: e.target.value }))}>
                <option>Routine</option><option>Urgent</option><option>Emergency</option>
              </select>
            </div>
            <div className="pd-form-group">
              <label>Referral Date</label>
              <input type="date" value={referral.date} onChange={e => setReferral(r => ({ ...r, date: e.target.value }))} />
            </div>
          </div>
          <div className="pd-form-group pd-form-full">
            <label>Reason for Referral</label>
            <textarea rows={3} value={referral.reason} onChange={e => setReferral(r => ({ ...r, reason: e.target.value }))} placeholder="Describe the clinical reason..." />
          </div>
          <div className="pd-form-group pd-form-full">
            <label>Additional Notes</label>
            <textarea rows={3} value={referral.notes} onChange={e => setReferral(r => ({ ...r, notes: e.target.value }))} placeholder="Any additional notes..." />
          </div>
          <div className="pd-print-body">
            <p><strong>Refer To:</strong> {referral.to_dept} — {referral.to_doctor}</p>
            <p><strong>Urgency:</strong> {referral.urgency}</p>
            <p><strong>Reason:</strong> {referral.reason}</p>
            <p><strong>Notes:</strong> {referral.notes}</p>
            <br /><br /><p>_______________________</p><p>Referring Doctor's Signature</p>
          </div>
        </div>
        <div className="pd-referral-actions">
          <button className="pd-print-btn" onClick={() => { window.print(); setPrinted(true); }}>🖨️ Print Referral</button>
          {printed && <span className="pd-print-done">✅ Sent to printer</span>}
        </div>
      </Section>
    </div>
  );
};

const PatientDetail = ({ user }) => {
  const { id: patientNo } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [activeTab, setActiveTab] = useState("info");

  const isOutpatient = patientNo?.toUpperCase().startsWith("OP");

  useEffect(() => {
    const fetchPatient = async () => {
      try {
        const endpoint = isOutpatient
          ? `/api/outpatients/${encodeURIComponent(patientNo)}`
          : `/api/patients/${encodeURIComponent(patientNo)}`;
        const res  = await apiFetch(endpoint);
        const data = await res.json();
        if (res.ok) setPatient(data.patient);
        else setError(data.message);
      } catch { setError("Could not connect to server."); }
      finally  { setLoading(false); }
    };
    fetchPatient();
  }, [patientNo]);

  const tabs = [
    { key: "info",      label: "👤 Patient Information" },
    { key: "lab",       label: "🧪 Lab Results" },
    { key: "diagnosis", label: "🩺 Diagnosis & Prescription" },
    { key: "referral",  label: "📨 Referral" },
  ];

  return (
    <div className="pd-layout">
      <Nav user={user} />
      <main className="pd-main">
        <button className="pd-back-btn" onClick={() => navigate(-1)}>← Back to Patients</button>
        {loading && <div className="pd-state"><div className="pd-spinner" /><p>Loading patient...</p></div>}
        {error   && <div className="pd-state pd-error">⚠️ {error}</div>}
        {patient && (
          <>
            <div className="pd-hero">
              <div className="pd-hero-avatar">{patient.Name?.charAt(0)}</div>
              <div className="pd-hero-info">
                <h1 className="pd-hero-name">{patient.Name}</h1>
                <p className="pd-hero-sub">
                  {patient.IP_No || patient.OP_No} &nbsp;·&nbsp; {patient.Dept} &nbsp;·&nbsp;
                  {patient.Sex === "M" ? "Male" : "Female"}, {patient.Age} yrs &nbsp;·&nbsp; {patient.Insurance_Type}
                </p>
              </div>
              <div className={`pd-hero-badge pd-badge-${patient.Sex === "M" ? "blue" : "pink"}`}>
                {isOutpatient ? "Out-Patient" : "In-Patient"}
              </div>
            </div>
            <div className="pd-tabs">
              {tabs.map(t => (
                <button key={t.key} className={`pd-tab-btn${activeTab === t.key ? " active" : ""}`}
                  onClick={() => setActiveTab(t.key)}>{t.label}</button>
              ))}
            </div>
            {activeTab === "info"      && <PatientInfoTab p={patient} isOutpatient={isOutpatient} />}
            {activeTab === "lab"       && <LabResultsTab  p={patient} isOutpatient={isOutpatient} />}
            {activeTab === "diagnosis" && <DiagnosisTab   p={patient} />}
            {activeTab === "referral"  && <ReferralTab    p={patient} isOutpatient={isOutpatient} />}
          </>
        )}
      </main>
    </div>
  );
};

export default PatientDetail;