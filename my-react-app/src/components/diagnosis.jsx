import { useEffect, useState } from "react";
import "./diagnosisTab.css";

const DiagnosisTab = ({ p }) => {
  const isOutpatient  = p.OP_No ? true : false;
  const patientNo     = p.OP_No || p.IP_No;

  const [diagnosis, setDiagnosis]     = useState({ primary: "", secondary: "", notes: "" });
  const [diagLoading, setDiagLoading] = useState(true);
  const [saving, setSaving]           = useState(false);
  const [saveMsg, setSaveMsg]         = useState(null); // "success" | "error"
  const [intTab, setIntTab]           = useState("drug-drug");
  const [counselTab, setCounselTab]   = useState("drug");
  const [openMenu, setOpenMenu]       = useState(null);
  const [showOOS, setShowOOS]         = useState(false);
  const [noteText, setNoteText]       = useState("");

  // ── Fetch diagnosis on mount ──
  useEffect(() => {
    const fetchDiagnosis = async () => {
      try {
        const endpoint = isOutpatient
          ? `/api/op-diagnosis/${encodeURIComponent(patientNo)}`
          : `/api/ip-diagnosis/${encodeURIComponent(patientNo)}`;
        const res  = await fetch(endpoint);
        const data = await res.json();
        if (res.ok && data.diagnosis) {
          setDiagnosis({
            primary:   data.diagnosis.Diagnosis           || "",
            secondary: data.diagnosis.Secondary_Diagnosis || "",
            notes:     data.diagnosis.Clinical_Notes      || "",
          });
        }
      } catch {
        // silently fail — form stays blank
      } finally {
        setDiagLoading(false);
      }
    };
    fetchDiagnosis();
  }, [patientNo]);

  // ── Save diagnosis ──
  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const endpoint = isOutpatient ? '/api/op-diagnosis' : '/api/ip-diagnosis';
      const body = isOutpatient
        ? { opNo: patientNo, primary: diagnosis.primary, secondary: diagnosis.secondary, notes: diagnosis.notes }
        : { ipNo: patientNo, primary: diagnosis.primary, secondary: diagnosis.secondary, notes: diagnosis.notes };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setSaveMsg(res.ok ? 'success' : 'error');
    } catch {
      setSaveMsg('error');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  };

  const medications = [
    { id: 1, brand: "Glucophage", generic: "Metformin",                     dose: "1000 mg", route: "PO", freq: "BID",   days: "Ongoing", critical: false },
    { id: 2, brand: "Zestril",    generic: "Lisinopril",                    dose: "10 mg",   route: "PO", freq: "Daily", days: "Ongoing", critical: false },
    { id: 3, brand: "Coumadin ⚠", generic: "Warfarin",                     dose: "▲ 10 mg", route: "PO", freq: "Daily", days: "Ongoing", critical: true  },
    { id: 4, brand: "Bactrim DS", generic: "Sulfamethoxazole/Trimethoprim", dose: "1 tab",   route: "PO", freq: "BID",   days: "7 days",  critical: true  },
    { id: 5, brand: "Ecotrin",    generic: "Aspirin",                       dose: "81 mg",   route: "PO", freq: "Daily", days: "Ongoing", critical: false },
  ];

  const interactions = {
    "drug-drug": {
      badges: [
        { label: "Critical (1)", cls: "diag-badge-red"    },
        { label: "Major (1)",    cls: "diag-badge-orange" },
        { label: "Moderate (0)", cls: "diag-badge-gray"   },
      ],
      title: "Warfarin + Bactrim",
      desc:  "Significantly increased bleeding risk — Bactrim inhibits Warfarin metabolism via CYP2C9.",
      rec:   "Consider alternative antibiotic: Azithromycin 500 mg × 1, then 250 mg daily × 4 days.",
      note:  "⚠ Amoxicillin contraindicated — patient has Penicillin allergy.",
    },
    "drug-disease": {
      badges: [
        { label: "Major (2)",    cls: "diag-badge-orange" },
        { label: "Moderate (1)", cls: "diag-badge-gray"   },
      ],
      title: "Metformin + CKD (eGFR 45)",
      desc:  "Metformin is contraindicated when eGFR < 30 mL/min. Current eGFR 45 requires dose reduction.",
      rec:   "Reduce Metformin to 500 mg BID. Recheck eGFR in 4 weeks. Hold if eGFR drops below 30.",
      note:  null,
    },
    "drug-food": {
      badges: [
        { label: "Major (1)",    cls: "diag-badge-orange" },
        { label: "Moderate (2)", cls: "diag-badge-gray"   },
      ],
      title: "Warfarin + Vitamin K Foods",
      desc:  "Large or inconsistent intake of Vitamin K-rich foods can destabilise INR levels.",
      rec:   "Maintain consistent Vitamin K intake — do not eliminate, but avoid sudden large changes.",
      note:  null,
    },
  };

  const dosingRecs = [
    { type: "critical", tag: "⚠ Renal Adjustment",  text: <><strong>Metformin</strong> — eGFR currently 45 mL/min. Hold if eGFR drops below 30.</> },
    { type: "warning",  tag: "⚡ INR Monitoring",    text: <><strong>Warfarin</strong> unchanged at 10 mg/day. Re-check INR within 3–5 days of starting Bactrim.</> },
    { type: "info",     tag: "💊 Antibiotic Switch", text: <>Consider replacing <strong>Bactrim</strong> with <strong>Azithromycin</strong> 500 mg × 1, then 250 mg × 4 days.</> },
    { type: "neutral",  tag: "✓ Aspirin",            text: <>Continue <strong>Aspirin</strong> 81 mg daily. Monitor additive bleeding risk with Warfarin.</> },
  ];

  const drugCounsel = [
    { icon: "🩸", title: "Bleeding Risk — Warfarin",    desc: "Watch for unusual bruising, blood in urine/stool, prolonged bleeding from cuts.", approved: true  },
    { icon: "🥬", title: "Diet — Vitamin K Interaction", desc: "Avoid major changes to Vitamin K intake. Consistency helps maintain stable INR.",  approved: true  },
    { icon: "⏰", title: "Medication Timing",            desc: "Take Warfarin at the same time each day. Do not double dose if missed.",            approved: false },
    { icon: "🔬", title: "INR Monitoring",               desc: "Schedule INR check within 3–5 days of starting or stopping any antibiotic.",       approved: false },
  ];

  const condCounsel = [
    { icon: "🩺", title: "Diabetes — Blood Sugar Monitoring", desc: "Check fasting blood glucose daily. Target: 80–130 mg/dL before meals.",         approved: true  },
    { icon: "❤️", title: "Hypertension — BP Management",      desc: "Monitor BP twice daily. Target: below 130/80 mmHg. Reduce sodium intake.",      approved: true  },
    { icon: "🏃", title: "Lifestyle — Exercise & Diet",        desc: "Aim for 30 min moderate activity 5 days/week. Low-glycaemic, low-sodium diet.", approved: false },
    { icon: "🫘", title: "Renal Health — Follow-up",           desc: "Avoid NSAIDs. Schedule nephrology follow-up within 4 weeks.",                  approved: false },
  ];

  const int    = interactions[intTab];
  const counsel = counselTab === "drug" ? drugCounsel : condCounsel;

  useEffect(() => {
    const close = () => setOpenMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  return (
    <div className="diag-wrap">

      {/* ── Diagnosis ── */}
      <div className="diag-card">
        <div className="diag-card-header">
          <span>🩻</span>
          <span className="diag-card-title">Diagnosis</span>
        </div>
        <div className="diag-card-body">
          <div className="diag-row-2">
            <div className="diag-field">
              <label className="diag-lbl">Primary Diagnosis</label>
              <input className="diag-inp"
                placeholder={diagLoading ? "Loading..." : "e.g. Type 2 Diabetes Mellitus"}
                value={diagnosis.primary}
                disabled={diagLoading}
                onChange={e => setDiagnosis(d => ({ ...d, primary: e.target.value }))} />
            </div>
            <div className="diag-field">
              <label className="diag-lbl">Secondary Diagnosis</label>
              <input className="diag-inp"
                placeholder={diagLoading ? "Loading..." : "e.g. Hypertension, CKD Stage 3"}
                value={diagnosis.secondary}
                disabled={diagLoading}
                onChange={e => setDiagnosis(d => ({ ...d, secondary: e.target.value }))} />
            </div>
          </div>
          <div className="diag-field">
            <label className="diag-lbl">Clinical Notes</label>
            <textarea className="diag-ta" rows={3}
              placeholder={diagLoading ? "Loading..." : "Additional clinical observations..."}
              value={diagnosis.notes}
              disabled={diagLoading}
              onChange={e => setDiagnosis(d => ({ ...d, notes: e.target.value }))} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: "0.75rem" }}>
            {saveMsg === "success" && <span style={{ fontSize: "0.8rem", color: "#16a34a", fontWeight: 600 }}>✅ Saved successfully</span>}
            {saveMsg === "error"   && <span style={{ fontSize: "0.8rem", color: "#e05252", fontWeight: 600 }}>❌ Failed to save</span>}
            <button className="diag-save-diagnosis-btn" onClick={handleSave} disabled={saving || diagLoading}>
              {saving ? "Saving..." : "💾 Save Diagnosis"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Medication + Prescriber Notes ── */}
      <div className="diag-grid-2">

        <div className="diag-card" style={{ overflow: "visible" }}>
          <div className="diag-card-header">
            <span className="diag-card-title">💊 Medication List</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="diag-table">
              <thead>
                <tr>
                  <th>#</th><th>Brand</th><th>Generic</th><th>Dose</th>
                  <th>Route</th><th>Freq</th><th>Days</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {medications.map((m, i) => (
                  <tr key={m.id} className={m.critical ? "diag-row-critical" : ""}>
                    <td className="diag-sno">{i + 1}</td>
                    <td className={`diag-med-name${m.critical ? " diag-med-red" : ""}`}>{m.brand}</td>
                    <td className={`diag-generic${m.critical ? " diag-med-red" : ""}`}>{m.generic}</td>
                    <td className={`diag-mono${m.critical ? " diag-text-red" : ""}`}>{m.dose}</td>
                    <td><span className="diag-route">{m.route}</span></td>
                    <td><span className="diag-freq">{m.freq}</span></td>
                    <td className="diag-days">{m.days}</td>
                    <td style={{ position: "relative" }}>
                      <button
                        className={`diag-menu-btn${m.critical ? " diag-menu-warn" : ""}`}
                        onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === m.id ? null : m.id); }}
                      >⋮</button>
                      {openMenu === m.id && (
                        <div className="diag-dropdown">
                          <div className="diag-drop-item">✏️ Edit</div>
                          <div className="diag-drop-item">⏸ Hold</div>
                          <div className="diag-drop-item">🗑 Discontinue</div>
                          {m.critical && <div className="diag-drop-item diag-drop-warn">⚠ View Alert</div>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="diag-add-row">
            <div className="diag-add-btn" onClick={() => setShowOOS(true)}>+ Add Medication</div>
            <div className="diag-search-btn" onClick={() => setShowOOS(true)}>🔍 Search Other Drugs</div>
          </div>
        </div>

        <div className="diag-card">
          <div className="diag-card-header">
            <span className="diag-card-title">📝 Prescriber Notes</span>
          </div>
          <div className="diag-card-body">
            <div className="diag-note-item">
              <div className="diag-note-name diag-med-red">Warfarin</div>
              <div className="diag-note-text">INR target 2.0–3.0. Last INR 2.4 on Jan 20 — within range. Monitor closely with new antibiotic.</div>
              <div className="diag-note-meta">Jan 20 · Dr. Kang</div>
            </div>
            <div className="diag-divider" />
            <div className="diag-note-item">
              <div className="diag-note-name" style={{ color: "#f59e0b" }}>Bactrim DS</div>
              <div className="diag-note-text">Started for UTI — 7-day course. Allergy reassessed as mild, tolerable with monitoring.</div>
              <div className="diag-note-meta">Today · Dr. Kang</div>
            </div>
            <input className="diag-note-inp" placeholder="Add a clinical note..."
              value={noteText} onChange={e => setNoteText(e.target.value)} />
            <button className="diag-save-btn">Save Note</button>
          </div>
        </div>
      </div>

      {/* ── Drug Interactions + Dosing ── */}
      <div className="diag-grid-2">

        <div className="diag-card">
          <div className="diag-int-header">
            <div className="diag-card-title" style={{ color: "#e05252" }}>⚠️ Drug Interaction Warning</div>
            <div className="diag-int-tabs">
              {["drug-drug", "drug-disease", "drug-food"].map(t => (
                <button key={t}
                  className={`diag-int-tab${intTab === t ? " active" : ""}`}
                  onClick={() => setIntTab(t)}>
                  {t === "drug-drug" ? "Drug–Drug" : t === "drug-disease" ? "Drug–Disease" : "Drug–Food"}
                </button>
              ))}
            </div>
          </div>
          <div className="diag-card-body">
            <div className="diag-badge-row">
              {int.badges.map(b => (
                <span key={b.label} className={`diag-badge ${b.cls}`}>{b.label}</span>
              ))}
            </div>
            <div className="diag-int-title">{int.title}</div>
            <div className="diag-int-desc">{int.desc}</div>
            <div className="diag-rec-box">
              <div className="diag-rec-label">Recommendation</div>
              <div className="diag-rec-text">{int.rec}</div>
              {int.note && <div className="diag-rec-note">{int.note}</div>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="diag-btn-dark">View Details</button>
              <button className="diag-btn-warn">Override ⚠</button>
            </div>
          </div>
        </div>

        <div className="diag-card">
          <div className="diag-card-header">
            <span className="diag-card-title">📋 Dosing Recommendation</span>
          </div>
          <div className="diag-card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {dosingRecs.map((r, i) => (
              <div key={i} className={`diag-dose-item diag-dose-${r.type}`}>
                <div className="diag-dose-tag">{r.tag}</div>
                <div className="diag-dose-text">{r.text}</div>
              </div>
            ))}
            <button className="diag-review-btn">Review Full Dosing Plan</button>
          </div>
        </div>
      </div>

      {/* ── Patient Counselling ── */}
      <div className="diag-card">
        <div className="diag-counsel-header">
          <div className="diag-card-title">
            🩺 Patient Counselling
            <span className="diag-points-badge">8 points</span>
          </div>
          <button className="diag-preview-btn">⟳ Preview for Patient</button>
        </div>
        <div className="diag-counsel-tabs">
          {[{ key: "drug", label: "💊 Drug Counselling" }, { key: "condition", label: "🫀 Condition Counselling" }].map(t => (
            <button key={t.key}
              className={`diag-ctab${counselTab === t.key ? " active" : ""}`}
              onClick={() => setCounselTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="diag-card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {counsel.map((c, i) => (
            <div key={i} className="diag-counsel-item">
              <div className="diag-counsel-top">
                <span className="diag-counsel-icon">{c.icon}</span>
                <span className="diag-counsel-title">{c.title}</span>
              </div>
              <div className="diag-counsel-desc">{c.desc}</div>
              <div className="diag-counsel-actions">
                {c.approved
                  ? <span className="diag-badge-approved">✓ APPROVED</span>
                  : <span className="diag-badge-pending">PENDING</span>}
                {!c.approved && <button className="diag-action-btn diag-action-approve">✓ Approve</button>}
                <button className="diag-action-btn">Remove</button>
                <button className="diag-action-btn">Preview</button>
              </div>
            </div>
          ))}
          <button className="diag-add-counsel">+ Add new counselling point</button>
        </div>
      </div>

      {/* ── OOS Finder ── */}
      {showOOS && (
        <div className="diag-card">
          <div className="diag-oos-header">
            <span className="diag-card-title">📦 Out-of-Stock Medication Finder</span>
            <button className="diag-oos-close" onClick={() => setShowOOS(false)}>×</button>
          </div>
          <div className="diag-card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="diag-oos-inp" placeholder="Search medication by brand or generic name..." />
              <button className="diag-oos-search-btn">🔍 Search</button>
            </div>
            <div className="diag-oos-banner">
              <span className="diag-oos-drug-name">Warfarin 10 mg</span>
              <span className="diag-oos-detail">| PO daily</span>
              <span className="diag-oos-stock-badge">💊 Out of Stock</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>
              Available Alternatives{" "}
              <span style={{ color: "#888", fontWeight: 400 }}>(Same compound, same dose)</span>
            </div>
            <table className="diag-oos-table">
              <thead>
                <tr>
                  <th>Brand / Generic</th><th>Strength</th><th>Form</th>
                  <th>Price (30-day)</th><th>In Stock</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: "Warfarin (Generic X)", badge: true,  price: "$6",  stock: "18 units", avail: true  },
                  { name: "Warfarin (Generic Y)", badge: false, price: "$12", stock: "7 units",  avail: true  },
                  { name: "Warfarin (Brand)",     badge: false, price: "$48", stock: "0 units",  avail: false },
                ].map((alt, i) => (
                  <tr key={i} style={{ opacity: alt.avail ? 1 : 0.5 }}>
                    <td>
                      <span>{alt.avail ? "🟢" : "🔴"} </span>
                      <span style={{ fontWeight: 500 }}>{alt.name}</span>
                      {alt.badge && <span className="diag-lowest-badge">✦ Lowest Cost</span>}
                    </td>
                    <td style={{ color: "#888" }}>10 mg</td>
                    <td style={{ color: "#888" }}>Pill</td>
                    <td style={{ color: alt.avail ? "#16a34a" : "#f59e0b", fontWeight: 700 }}>{alt.price}</td>
                    <td style={{ color: alt.avail ? "#16a34a" : "#e05252", fontWeight: 700 }}>{alt.stock}</td>
                    <td>
                      <button className="diag-switch-btn"
                        disabled={!alt.avail}
                        style={{ opacity: alt.avail ? 1 : 0.4, cursor: alt.avail ? "pointer" : "not-allowed" }}>
                        💊 Switch
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: "0.75rem", color: "#888", fontStyle: "italic" }}>
              Prices &amp; availability shown are real-time from hospital pharmacy database.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiagnosisTab;