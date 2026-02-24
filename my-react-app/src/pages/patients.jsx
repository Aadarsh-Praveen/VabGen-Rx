import { useEffect, useState } from "react";
import Nav from "../components/nav";
import "./patients.css";

// ── Detail Modal ───────────────────────────────────────────────────────────────
const Section = ({ title, children }) => (
  <div className="pt-section">
    <h4 className="pt-section-title">{title}</h4>
    <div className="pt-section-body">{children}</div>
  </div>
);

const Row = ({ label, value }) => (
  <div className="pt-row">
    <span className="pt-label">{label}</span>
    <span className="pt-value">{value ?? "—"}</span>
  </div>
);

const Badge = ({ value, type }) => (
  <span className={`pt-badge pt-badge-${type}`}>{value}</span>
);

const PatientModal = ({ patient: p, onClose }) => {
  if (!p) return null;
  const doa = p.DOA ? new Date(p.DOA).toLocaleDateString() : "—";

  return (
    <div className="pt-overlay" onClick={onClose}>
      <div className="pt-modal" onClick={e => e.stopPropagation()}>
        <div className="pt-modal-header">
          <div className="pt-modal-avatar">{p.Name?.charAt(0)}</div>
          <div>
            <h2 className="pt-modal-name">{p.Name}</h2>
            <p className="pt-modal-sub">
              {p.IP_No} · {p.Dept} · {p.Sex === "M" ? "Male" : "Female"}, {p.Age} yrs
            </p>
          </div>
          <button className="pt-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="pt-modal-body">
          {/* Demographics */}
          <Section title="👤 Demographics">
            <Row label="Weight" value={`${p.Weight_kg} kg`} />
            <Row label="Height" value={`${p.Height_cm} cm`} />
            <Row label="BMI" value={p.BMI} />
            <Row label="Occupation" value={p.Occupation} />
            <Row label="Marital Status" value={p.Marital_Status} />
            <Row label="Language" value={p.Preferred_Language} />
            <Row label="Race / Ethnicity" value={`${p.Race} · ${p.Ethnicity}`} />
            <Row label="Insurance" value={p.Insurance_Type} />
          </Section>

          {/* Admission */}
          <Section title="🏥 Admission Info">
            <Row label="Date of Admission" value={doa} />
            <Row label="Department" value={p.Dept} />
            <Row label="Reason" value={p.Reason_for_Admission} />
            <Row label="Past Medical Hx" value={p.Past_Medical_History} />
            <Row label="Past Medication Hx" value={p.Past_Medication_History} />
            <Row label="Known Allergies" value={p.Known_Allergies} />
          </Section>

          {/* Lifestyle */}
          <Section title="🚬 Lifestyle">
            <Row label="Smoker" value={p.Smoker} />
            <Row label="Alcoholic" value={p.Alcoholic} />
            <Row label="Tobacco" value={p.Tobacco} />
            <Row label="Teetotaller" value={p.Teetotaller} />
          </Section>

          {/* Vitals */}
          <Section title="❤️ Vitals">
            <Row label="Temp (°C)" value={p.Temp_C} />
            <Row label="BP" value={p.BP} />
            <Row label="Pulse" value={`${p.Pulse} bpm`} />
          </Section>

          {/* Blood Sugar */}
          <Section title="🩸 Blood Sugar & HbA1c">
            <Row label="FBS (mg/dl)" value={p.FBS_mgdl} />
            <Row label="PPBS (mg/dl)" value={p.PPS_mgdl} />
            <Row label="RBS (mg/dl)" value={p.RBS_mgdl} />
            <Row label="HbA1c (%)" value={p.HbA1c_percent} />
          </Section>

          {/* Haematology */}
          <Section title="🧪 Haematology">
            <Row label="Hb (g/dl)" value={p.Hb_gdl} />
            <Row label="TLC (cells/μL)" value={p.TLC_cells} />
            <Row label="Platelets (lakhs)" value={p.Platelets_lakhs} />
            <Row label="ESR (mm/hr)" value={p.ESR_mmhr} />
            <Row label="APTT (sec)" value={p.APTT_sec} />
          </Section>

          {/* LFT */}
          <Section title="🫀 Liver Function">
            <Row label="Total Bilirubin" value={p.Total_Bilirubin} />
            <Row label="Direct Bilirubin" value={p.Direct_Bilirubin} />
            <Row label="Indirect Bilirubin" value={p.Indirect_Bilirubin} />
            <Row label="SGOT (U/L)" value={p.SGOT_UL} />
            <Row label="Albumin (g/dl)" value={p.Albumin_gdl} />
            <Row label="Total Protein (g/dl)" value={p.Total_Protein_gdl} />
          </Section>

          {/* RFT */}
          <Section title="🫘 Renal Function">
            <Row label="Urea (mg/dl)" value={p.Urea_mgdl} />
            <Row label="Creatinine (mg/dl)" value={p.Creatinine_mgdl} />
            <Row label="Uric Acid (mg/dl)" value={p.Uric_Acid_mgdl} />
            <Row label="eGFR" value={`${p.eGFR_mL_min_1_73m2} mL/min/1.73m²`} />
          </Section>

          {/* Electrolytes */}
          <Section title="⚡ Electrolytes">
            <Row label="Sodium" value={p.Sodium} />
            <Row label="Potassium" value={p.Potassium} />
            <Row label="Chloride" value={p.Chloride} />
            <Row label="Bicarbonate" value={p.Bicarbonate} />
          </Section>

          {/* Lipid */}
          <Section title="💊 Lipid Profile">
            <Row label="Triglycerides" value={p.Triglycerides} />
            <Row label="Total Cholesterol" value={p.Total_Cholesterol} />
            <Row label="HDL" value={p.HDL} />
            <Row label="LDL" value={p.LDL} />
            <Row label="VLDL" value={p.VLDL} />
            <Row label="TC/HDL Ratio" value={p.TC_HDL_Ratio} />
          </Section>

          {/* Urine */}
          <Section title="🧫 Urine Analysis">
            <Row label="Albumin" value={p.Urine_Albumin} />
            <Row label="Sugar" value={p.Urine_Sugar} />
            <Row label="WBC" value={p.Urine_WBC} />
            <Row label="RBC" value={p.Urine_RBC} />
          </Section>

          {/* Thyroid */}
          <Section title="🦋 Thyroid">
            <Row label="Free T3" value={p.FreeT3} />
            <Row label="Free T4" value={p.FreeT4} />
            <Row label="TSH" value={p.TSH} />
          </Section>

          {/* Other Investigations */}
          <Section title="🔬 Other Investigations">
            <p className="pt-long-text">{p.Other_Investigations || "—"}</p>
          </Section>

          {/* Drugs */}
          <Section title="💉 Drugs Prescribed">
            <p className="pt-long-text">{p.Drugs_Prescribed || "—"}</p>
          </Section>

          {/* Alerts */}
          <Section title="⚠️ Clinical Alerts">
            <div className="pt-alert-block pt-alert-red">
              <span className="pt-alert-label">Drug–Drug Interactions</span>
              <p>{p.Drug_Drug_Interactions || "None"}</p>
            </div>
            <div className="pt-alert-block pt-alert-orange">
              <span className="pt-alert-label">Drug–Disease Alerts</span>
              <p>{p.Drug_Disease_Alerts || "None"}</p>
            </div>
            <div className="pt-alert-block pt-alert-yellow">
              <span className="pt-alert-label">Drug–Food Alerts</span>
              <p>{p.Drug_Food_Alerts || "None"}</p>
            </div>
          </Section>

          {/* Outcome */}
          <Section title="📋 Outcome & Interventions">
            <Row label="Dose Adjustment Notes" value={p.Dose_Adjustment_Notes} />
            <Row label="Follow-up Outcome" value={p.Followup_Outcome} />
            <Row label="Interventions Made" value={p.Interventions_Made} />
          </Section>
        </div>
      </div>
    </div>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────────────
const Patients = ({ user }) => {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [search, setSearch]     = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const res  = await fetch("http://localhost:8080/api/patients");
        const data = await res.json();
        if (res.ok) setPatients(data.patients);
        else setError(data.message);
      } catch {
        setError("Could not connect to server.");
      } finally {
        setLoading(false);
      }
    };
    fetchPatients();
  }, []);

  const departments = ["All", ...new Set(patients.map(p => p.Dept))];

  const filtered = patients.filter(p => {
    const matchSearch =
      p.Name?.toLowerCase().includes(search.toLowerCase()) ||
      p.IP_No?.toLowerCase().includes(search.toLowerCase()) ||
      p.Reason_for_Admission?.toLowerCase().includes(search.toLowerCase());
    const matchDept = deptFilter === "All" || p.Dept === deptFilter;
    return matchSearch && matchDept;
  });

  const getSexBadge = sex => sex === "M" ? "blue" : "pink";

  return (
    <div className="pt-layout">
      <Nav user={user} />

      <main className="pt-main">
        {/* Header */}
        <div className="pt-header">
          <div>
            <h1 className="pt-title">My Patients</h1>
            <p className="pt-subtitle">{patients.length} patients in the database</p>
          </div>
        </div>

        {/* Filters */}
        <div className="pt-filters">
          <div className="pt-search-wrap">
            <span className="pt-search-icon">🔍</span>
            <input
              className="pt-search"
              placeholder="Search by name, IP No, or reason..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="pt-dept-tabs">
            {departments.map(d => (
              <button
                key={d}
                className={`pt-dept-tab${deptFilter === d ? " active" : ""}`}
                onClick={() => setDeptFilter(d)}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* States */}
        {loading && (
          <div className="pt-state">
            <div className="pt-spinner" />
            <p>Loading patients...</p>
          </div>
        )}
        {error && <div className="pt-state pt-error">⚠️ {error}</div>}

        {/* Table */}
        {!loading && !error && (
          <div className="pt-table-wrap">
            <table className="pt-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Patient</th>
                  <th>IP No</th>
                  <th>Age / Sex</th>
                  <th>Dept</th>
                  <th>DOA</th>
                  <th>Reason for Admission</th>
                  <th>Patient Profile</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="pt-empty">No patients found.</td>
                  </tr>
                ) : (
                  filtered.map((p, i) => (
                    <tr key={p.ID} className="pt-tr">
                      <td className="pt-num">{i + 1}</td>
                      <td>
                        <div className="pt-name-cell">
                          <div className="pt-mini-avatar">{p.Name?.charAt(0)}</div>
                          <span className="pt-name">{p.Name}</span>
                        </div>
                      </td>
                      <td><span className="pt-ip">{p.IP_No}</span></td>
                      <td>
                        {p.Age} <Badge value={p.Sex === "M" ? "M" : "F"} type={getSexBadge(p.Sex)} />
                      </td>
                      <td><span className="pt-dept">{p.Dept}</span></td>
                      <td>{p.DOA ? new Date(p.DOA).toLocaleDateString() : "—"}</td>
                      <td className="pt-reason">{p.Reason_for_Admission}</td>
                      <td>
                        <button className="pt-view-btn" onClick={() => setSelected(p)}>
                          View History
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {selected && <PatientModal patient={selected} onClose={() => setSelected(null)} />}
    </div>
  );
};

export default Patients;