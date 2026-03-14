import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Nav from "../components/nav";
import DiagnosisTab from "../components/diagnosis";
import { apiFetch } from "../services/api";
import "./patientDetails.css";
import PageFooter from "../components/pageFooter";

import patientIcon  from "../assets/patient_s.png";
import labIcon      from "../assets/lab.png";
import referralIcon from "../assets/referral.png";

/* ══════════════════════════════════════
   HERO BANNER NODE ANIMATION
   ══════════════════════════════════════ */
const rand = (min, max) => Math.round(min + Math.random() * (max - min));

const HeroBackground = ({ canvasRef, svgRef }) => {
  useEffect(() => {
    const canvas = canvasRef.current;
    const svg    = svgRef.current;
    if (!canvas || !svg) return;

    const W = canvas.offsetWidth  || 900;
    const H = canvas.offsetHeight || 100;
    const NODE_COUNT = 16;

    const nodes = Array.from({ length: NODE_COUNT }, (_, i) => ({
      id: i,
      x: (0.02 + Math.random() * 0.96) * W,
      y: (0.05 + Math.random() * 0.90) * H,
      dur: 10 + Math.random() * 14,
      del: -(Math.random() * 16),
    }));

    const nodeEls = nodes.map((n) => {
      const wrap = document.createElement("div");
      wrap.className = "hero-node";
      wrap.style.cssText = `
        left:${n.x}px; top:${n.y}px;
        --dx1:${rand(-20,20)}px; --dy1:${rand(-12,12)}px;
        --dx2:${rand(-20,20)}px; --dy2:${rand(-12,12)}px;
        --dx3:${rand(-20,20)}px; --dy3:${rand(-12,12)}px;
        animation: node-drift ${n.dur}s ease-in-out ${n.del}s infinite;
      `;
      const dot  = document.createElement("div");
      dot.className = "hero-node-dot";
      dot.style.animationDelay = `${Math.random() * -3}s`;
      const ring = document.createElement("div");
      ring.className = "hero-node-ring";
      ring.style.animationDelay = `${Math.random() * -3}s`;
      wrap.appendChild(dot);
      wrap.appendChild(ring);
      canvas.appendChild(wrap);
      return wrap;
    });

    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid slice");

    const lines = [];
    const MAX_DIST = W * 0.22;
    nodes.forEach((a) => {
      nodes
        .filter((b) => b.id !== a.id)
        .map((b) => ({ b, d: Math.hypot(b.x - a.x, b.y - a.y) }))
        .sort((x, y) => x.d - y.d)
        .slice(0, 2)
        .forEach(({ b, d }) => {
          if (d > MAX_DIST) return;
          const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
          line.setAttribute("x1", a.x); line.setAttribute("y1", a.y);
          line.setAttribute("x2", b.x); line.setAttribute("y2", b.y);
          line.setAttribute("class", "hero-connector");
          line.style.animationDelay = `${Math.random() * -4}s`;
          svg.appendChild(line);
          lines.push(line);
        });
    });

    return () => {
      nodeEls.forEach(el => el.remove());
      lines.forEach(el => el.remove());
    };
  }, [canvasRef, svgRef]);

  return null;
};

/* ══════════════════════════════════════
   ICONS
   ══════════════════════════════════════ */
const UserIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);
const FlaskIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 3h6v11l3.5 6H5.5L9 14V3z"/><line x1="9" y1="3" x2="15" y2="3"/>
  </svg>
);
const StethoscopeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/>
    <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/>
    <circle cx="20" cy="10" r="2"/>
  </svg>
);
const ReferralIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6.06 6.06l.97-.88a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
);
const BackIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
  </svg>
);
const SendIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);
const CalendarIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);
const WarningIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);

const TabPngIcon = ({ src, alt, active }) => {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  return (
    <img
      src={src} alt={alt}
      style={{
        width: 15, height: 15, objectFit: "contain", flexShrink: 0,
        filter: active
          ? isDark ? "brightness(0) invert(1)" : "none"
          : "brightness(0) invert(0.5)",
      }}
    />
  );
};

const SECTION_ICONS = {
  "Demographics":            <UserIcon />,
  "Visit Info":              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  "Lifestyle":               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>,
  "Outcome":                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>,
  "Vitals":                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  "Haematology":             <FlaskIcon />,
  "Blood Sugar":             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/></svg>,
  "Renal Function":          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="12" rx="4" ry="8"/><path d="M12 4C8 4 4 8 4 12s4 8 8 8"/></svg>,
  "Electrolytes":            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  "Liver Function":          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  "Lipid Profile":           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  "Imaging & Special Tests": <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  "Thyroid":                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  "Other Investigations":    <FlaskIcon />,
  "Referral Form":           <ReferralIcon />,
  "Past Referrals":          <CalendarIcon />,
};

const TABS = [
  { key: "info",      label: "Patient Information",      png: patientIcon,  alt: "patient"  },
  { key: "lab",       label: "Lab Results",              png: labIcon,      alt: "lab"      },
  { key: "diagnosis", label: "Diagnosis & Prescription", png: null,         alt: null       },
  { key: "referral",  label: "Referral",                 png: referralIcon, alt: "referral" },
];

const Section = ({ title, children }) => {
  const icon = SECTION_ICONS[title] || null;
  return (
    <div className="pd-section">
      <h4 className="pd-section-title">
        {icon && <span className="pd-section-icon">{icon}</span>}
        {title}
      </h4>
      <div className="pd-section-body">{children}</div>
    </div>
  );
};

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
      <Section title="Demographics">
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
      <Section title="Visit Info">
        <Row label={isOutpatient ? "OP Number" : "IP Number"} value={isOutpatient ? p.OP_No : p.IP_No} />
        <Row label="Department"              value={p.Dept} />
        <Row label="Date of Admission"       value={doa} />
        {!isOutpatient && <Row label="Date of Discharge" value={dod} />}
        <Row label="Reason for Admission"    value={p.Reason_for_Admission} />
        <Row label="Past Medical History"    value={p.Past_Medical_History} />
        <Row label="Past Medication History" value={p.Past_Medication_History} />
      </Section>
      <Section title="Lifestyle">
        <Row label="Smoker"    value={p.Smoker} />
        <Row label="Alcoholic" value={p.Alcoholic} />
      </Section>
      <Section title="Outcome">
        <Row label="Follow-up Outcome" value={p.Followup_Outcome} />
      </Section>
    </div>
  );
};

const LabResultsTab = ({ p, isOutpatient }) => {
  const [lab,     setLab]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
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
  if (error)   return <div className="pd-state pd-error"><WarningIcon /> {error}</div>;
  if (!lab)    return <div className="pd-state">No lab results found for this patient.</div>;

  return (
    <div className="pd-tab-content">
      <Section title="Vitals">
        {isOutpatient && <Row label="BP" value={lab.BP_Systolic && lab.BP_Diastolic ? `${lab.BP_Systolic}/${lab.BP_Diastolic} mmHg` : null} />}
        <Row label="Pulse (bpm)" value={lab.Pulse} />
        {isOutpatient && <Row label="Temperature (°C)" value={lab.Temperature} />}
        {isOutpatient && <Row label="SpO2 (%)"          value={lab.SpO2} />}
      </Section>
      {isOutpatient && (
        <Section title="Haematology">
          <Row label="Hb (g/dl)"      value={lab.Hb} />
          <Row label="WBC (×10³/μL)"  value={lab.WBC} />
          <Row label="Platelet Count" value={lab.Platelet_Count} />
        </Section>
      )}
      {isOutpatient && (
        <Section title="Blood Sugar">
          <Row label="RBS (mg/dl)"  value={lab.RBS} />
          <Row label="FBS (mg/dl)"  value={lab.FBS} />
          <Row label="PPBS (mg/dl)" value={lab.PPBS} />
        </Section>
      )}
      <Section title="Renal Function">
        <Row label="Urea (mg/dl)"          value={lab.Urea} />
        <Row label="Creatinine (mg/dl)"    value={lab.Creatinine} />
        <Row label="eGFR (mL/min/1.73m²)" value={lab.eGFR_mL_min_1_73m2} />
      </Section>
      <Section title="Electrolytes">
        <Row label="Sodium"    value={lab.Sodium} />
        <Row label="Potassium" value={lab.Potassium} />
        <Row label="Chloride"  value={lab.Chloride} />
      </Section>
      <Section title="Liver Function">
        {isOutpatient && <Row label="SGOT (U/L)" value={lab.SGOT} />}
        {isOutpatient && <Row label="SGPT (U/L)" value={lab.SGPT} />}
        {isOutpatient && <Row label="ALP (U/L)"  value={lab.ALP} />}
        <Row label="Total Bilirubin" value={lab.Total_Bilirubin} />
      </Section>
      {isOutpatient && (
        <Section title="Lipid Profile">
          <Row label="Result" value={lab.Lipid_Profile} />
        </Section>
      )}
      {isOutpatient && (
        <Section title="Imaging & Special Tests">
          <Row label="ECG"        value={lab.ECG} />
          <Row label="X-Ray"      value={lab.Xray} />
          <Row label="Ultrasound" value={lab.Ultrasound} />
          <Row label="CT Scan"    value={lab.CT} />
          <Row label="MRI"        value={lab.MRI} />
        </Section>
      )}
      <Section title="Thyroid">
        <Row label="Free T3" value={lab.FreeT3} />
        <Row label="Free T4" value={lab.FreeT4} />
        <Row label="TSH"     value={lab.TSH} />
      </Section>
      <Section title="Other Investigations">
        <p className="pd-long-text">{lab.Other_Investigations || "—"}</p>
      </Section>
    </div>
  );
};

const ReferralTab = ({ p, isOutpatient }) => {
  const patientNo = p.OP_No || p.IP_No;

  const [referral, setReferral] = useState({
    to_dept: "", to_doctor: "", urgency: "Routine",
    reason: "", notes: "", date: new Date().toISOString().split("T")[0],
  });
  const [allUsers,    setAllUsers]    = useState([]);
  const [saving,      setSaving]      = useState(false);
  const [saveMsg,     setSaveMsg]     = useState(null);
  const [referrals,   setReferrals]   = useState([]);
  const [loadingList, setLoadingList] = useState(true);

  const allDepts = [...new Set(allUsers.map(u => u.department).filter(Boolean))].sort();
  const filteredDoctors = allUsers.filter(u =>
    !referral.to_dept || u.department?.toLowerCase() === referral.to_dept.toLowerCase()
  );

  useEffect(() => {
    apiFetch("/api/users")
      .then(r => r.json())
      .then(d => { if (d.users) setAllUsers(d.users); })
      .catch(() => {});
  }, []);

  const fetchReferrals = async () => {
    setLoadingList(true);
    try {
      const ep  = isOutpatient
        ? `/api/op-referral/${encodeURIComponent(patientNo)}`
        : `/api/ip-referral/${encodeURIComponent(patientNo)}`;
      const res = await apiFetch(ep);
      const d   = await res.json();
      if (res.ok) setReferrals(d.referrals || []);
    } catch {}
    finally { setLoadingList(false); }
  };

  useEffect(() => { fetchReferrals(); }, [patientNo]);

  const handleDeptChange = (val) => {
    setReferral(r => ({ ...r, to_dept: val, to_doctor: "" }));
  };

  const handleSend = async () => {
    if (!referral.to_dept || !referral.reason) return setSaveMsg("error-validation");
    setSaving(true); setSaveMsg(null);
    try {
      const ep   = isOutpatient ? "/api/op-referral" : "/api/ip-referral";
      const body = isOutpatient
        ? { opNo: patientNo, ...referral }
        : { ipNo: patientNo, ...referral };
      const res  = await apiFetch(ep, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSaveMsg("success");
        setReferral({
          to_dept: "", to_doctor: "", urgency: "Routine",
          reason: "", notes: "", date: new Date().toISOString().split("T")[0],
        });
        await fetchReferrals();
      } else setSaveMsg("error");
    } catch { setSaveMsg("error"); }
    finally { setSaving(false); setTimeout(() => setSaveMsg(null), 3000); }
  };

  const handleRevoke = async (r) => {
    if (!window.confirm(`Revoke referral to ${r.Refer_To_Doctor || r.Refer_To_Department}?`)) return;
    try {
      const ep  = isOutpatient ? "/api/op-referral/delete" : "/api/ip-referral/delete";
      const res = await apiFetch(ep, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientNo,
          to_doctor: r.Refer_To_Doctor,
          to_dept:   r.Refer_To_Department,
          date:      r.Referral_Date,
        }),
      });
      if (res.ok) setReferrals(prev => prev.filter(x =>
        !(x.Refer_To_Doctor     === r.Refer_To_Doctor &&
          x.Refer_To_Department === r.Refer_To_Department &&
          x.Referral_Date       === r.Referral_Date)
      ));
    } catch (err) { console.error(err); }
  };

  const fmtDate      = d => d ? new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : "—";
  const urgencyClass = u => u === "Emergency" ? "ref-badge-emergency" : u === "Urgent" ? "ref-badge-urgent" : "ref-badge-routine";

  return (
    <div className="pd-tab-content">
      <Section title="Referral Form">
        <div className="pd-referral-form">
          <div className="pd-form-grid">
            <div className="pd-form-group">
              <label>Refer To Department <span style={{ color: "#e05252" }}>*</span></label>
              <select
                value={referral.to_dept}
                onChange={e => handleDeptChange(e.target.value)}
                className={!referral.to_dept && saveMsg === "error-validation" ? "pd-input-error" : ""}
              >
                <option value="">— Select Department —</option>
                {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="pd-form-group">
              <label>Refer To Doctor</label>
              <select
                value={referral.to_doctor}
                onChange={e => setReferral(r => ({ ...r, to_doctor: e.target.value }))}
                disabled={!referral.to_dept}
              >
                <option value="">— Select Doctor —</option>
                {filteredDoctors.map((u, i) => (
                  <option key={i} value={u.name}>
                    {u.name}{u.designation ? ` (${u.designation})` : ""}
                  </option>
                ))}
              </select>
              {!referral.to_dept && <span className="pd-form-hint">Select a department first</span>}
            </div>
            <div className="pd-form-group">
              <label>Urgency</label>
              <select value={referral.urgency} onChange={e => setReferral(r => ({ ...r, urgency: e.target.value }))}>
                <option>Routine</option>
                <option>Urgent</option>
                <option>Emergency</option>
              </select>
            </div>
            <div className="pd-form-group">
              <label>Referral Date</label>
              <input type="date" value={referral.date} onChange={e => setReferral(r => ({ ...r, date: e.target.value }))} />
            </div>
          </div>
          <div className="pd-form-group pd-form-full">
            <label>Reason for Referral <span style={{ color: "#e05252" }}>*</span></label>
            <textarea
              rows={3} value={referral.reason}
              onChange={e => setReferral(r => ({ ...r, reason: e.target.value }))}
              placeholder="Describe the clinical reason..."
              className={!referral.reason && saveMsg === "error-validation" ? "pd-input-error" : ""}
            />
          </div>
          <div className="pd-form-group pd-form-full">
            <label>Additional Notes</label>
            <textarea
              rows={3} value={referral.notes}
              onChange={e => setReferral(r => ({ ...r, notes: e.target.value }))}
              placeholder="Any additional notes..."
            />
          </div>
        </div>
        <div className="pd-referral-actions">
          {saveMsg === "error-validation" && <span className="ref-msg ref-msg-error"><WarningIcon /> Department and Reason are required.</span>}
          {saveMsg === "success"          && <span className="ref-msg ref-msg-success"><CheckIcon /> Referral sent successfully!</span>}
          {saveMsg === "error"            && <span className="ref-msg ref-msg-error"><WarningIcon /> Failed to save referral.</span>}
          <button className="pd-send-btn" onClick={handleSend} disabled={saving}>
            {saving ? "Sending..." : <><SendIcon /> Send Referral</>}
          </button>
        </div>
      </Section>

      <Section title="Past Referrals">
        {loadingList ? (
          <div className="pd-state"><div className="pd-spinner" /><p>Loading referrals...</p></div>
        ) : referrals.length === 0 ? (
          <div className="ref-empty"><ReferralIcon /><p>No referrals found for this patient.</p></div>
        ) : (
          <div className="ref-list">
            {referrals.map((r, i) => (
              <div key={i} className="ref-card">
                <div className="ref-card-header">
                  <div className="ref-card-title">
                    <span className="ref-dept">{r.Refer_To_Department}</span>
                    {r.Refer_To_Doctor && <span className="ref-doctor">→ {r.Refer_To_Doctor}</span>}
                  </div>
                  <div className="ref-card-actions">
                    <span className={`ref-badge ${urgencyClass(r.Urgency)}`}>{r.Urgency}</span>
                    <button className="ref-revoke-btn" onClick={() => handleRevoke(r)}>
                      <TrashIcon /> Revoke
                    </button>
                  </div>
                </div>
                <div className="ref-card-body">
                  <p className="ref-reason"><strong>Reason:</strong> {r.Reason_For_Referral}</p>
                  {r.Additional_Notes && <p className="ref-notes"><strong>Notes:</strong> {r.Additional_Notes}</p>}
                </div>
                <div className="ref-card-footer">
                  <CalendarIcon />
                  <span>Referral Date: {fmtDate(r.Referral_Date)}</span>
                  <span className="ref-dot">·</span>
                  <span>Saved: {fmtDate(r.Created_At)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
};

/* ══════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════ */
const PatientDetail = ({ user, onLogout }) => {
  const { id: patientNo } = useParams();
  const navigate          = useNavigate();
  const [patient,   setPatient]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [activeTab, setActiveTab] = useState("info");

  const heroCanvasRef = useRef(null);
  const heroSvgRef    = useRef(null);

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

  return (
    <div className="pd-layout">
      <Nav user={user} onLogout={onLogout} />
      <main className="pd-main">
        <button className="pd-back-btn" onClick={() => navigate(-1)}>
          <BackIcon /> Back to Patients
        </button>

        {loading && <div className="pd-state"><div className="pd-spinner" /><p>Loading patient...</p></div>}
        {error   && <div className="pd-state pd-error"><WarningIcon /> {error}</div>}

        {patient && (
          <>
            {/* ── Hero banner with node animation ── */}
            <div className="pd-hero">
              {/* background layers */}
              <div className="hero-blob hero-blob-1" />
              <div className="hero-blob hero-blob-2" />
              <div className="hero-mesh" />
              <svg  className="hero-svg"    ref={heroSvgRef}    />
              <div  className="hero-canvas" ref={heroCanvasRef} />
              <HeroBackground canvasRef={heroCanvasRef} svgRef={heroSvgRef} />

              {/* content */}
              <div className="pd-hero-avatar">{patient.Name?.charAt(0)}</div>
              <div className="pd-hero-info">
                <h1 className="pd-hero-name">{patient.Name}</h1>
                <p className="pd-hero-sub">
                  {patient.IP_No || patient.OP_No} &nbsp;·&nbsp;
                  {patient.Dept} &nbsp;·&nbsp;
                  {patient.Sex === "M" ? "Male" : "Female"}, {patient.Age} yrs &nbsp;·&nbsp;
                  {patient.Insurance_Type}
                </p>
              </div>
              <div className="pd-hero-chip-right">
                <span className="pd-hero-chip white">{isOutpatient ? "Out-Patient" : "In-Patient"}</span>
              </div>
            </div>

            <div className="pd-tabs">
              {TABS.map(({ key, label, png, alt }) => (
                <button
                  key={key}
                  className={`pd-tab-btn${activeTab === key ? " active" : ""}`}
                  onClick={() => setActiveTab(key)}
                >
                  <span className="pd-tab-icon">
                    {png ? <TabPngIcon src={png} alt={alt} active={activeTab === key} /> : <StethoscopeIcon />}
                  </span>
                  {label}
                </button>
              ))}
            </div>

            {activeTab === "info"      && <PatientInfoTab p={patient} isOutpatient={isOutpatient} />}
            {activeTab === "lab"       && <LabResultsTab  p={patient} isOutpatient={isOutpatient} />}
            {activeTab === "diagnosis" && <DiagnosisTab   p={patient} user={user} />}
            {activeTab === "referral"  && <ReferralTab    p={patient} isOutpatient={isOutpatient} user={user} />}
          </>
        )}

        <PageFooter />
      </main>
    </div>
  );
};

export default PatientDetail;