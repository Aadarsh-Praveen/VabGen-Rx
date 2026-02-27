import { useEffect, useState, useRef } from "react";
import "./diagnosisTab.css";

const DiagnosisTab = ({ p }) => {
  const isOutpatient = p.OP_No ? true : false;
  const patientNo    = p.OP_No || p.IP_No;

  const [diagnosis, setDiagnosis]         = useState({ primary: "", secondary: "", notes: "" });
  const [diagLoading, setDiagLoading]     = useState(true);
  const [saving, setSaving]               = useState(false);
  const [saveMsg, setSaveMsg]             = useState(null);
  const [intTab, setIntTab]               = useState("drug-drug");
  const [counselTab, setCounselTab]       = useState("drug");
  const [openMenu, setOpenMenu]           = useState(null);
  const [medications, setMedications]     = useState([]);
  const [medLoading, setMedLoading]       = useState(true);
  const [showAddRow, setShowAddRow]       = useState(false);
  const [searchQ, setSearchQ]             = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]         = useState(false);
  const [newMed, setNewMed]               = useState(null);
  const [newForm, setNewForm]             = useState({ route: "", frequency: "", days: "" });
  const [newErrors, setNewErrors]         = useState({});
  const [addSaving, setAddSaving]         = useState(false);
  const [editingId, setEditingId]         = useState(null);
  const [editValues, setEditValues]       = useState({});
  const [menuPos, setMenuPos]             = useState({ top: 0, left: 0 });
  const searchInputRef                    = useRef(null);
  const [dropdownPos, setDropdownPos]     = useState({ top: 0, left: 0, width: 0 });
  const debounceRef                       = useRef(null);

  // ── Prescriber Notes state ────────────────────────────────────
  const [prescriberNotes, setPrescriberNotes] = useState([]);
  const [noteText, setNoteText]               = useState("");
  const [noteSaving, setNoteSaving]           = useState(false);
  const [noteMsg, setNoteMsg]                 = useState(null);
  const [editingNoteId, setEditingNoteId]     = useState(null);
  const [editNoteText, setEditNoteText]       = useState("");

  // ── Fetch prescriptions ──────────────────────────────────────
  const fetchMeds = async () => {
    setMedLoading(true);
    try {
      const ep = isOutpatient
        ? `http://localhost:8080/api/op-prescriptions/${encodeURIComponent(patientNo)}`
        : `http://localhost:8080/api/ip-prescriptions/${encodeURIComponent(patientNo)}`;
      const res  = await fetch(ep);
      const data = await res.json();
      if (res.ok) setMedications(data.prescriptions || []);
    } catch { setMedications([]); }
    finally { setMedLoading(false); }
  };

  // ── Fetch prescriber notes ────────────────────────────────────
  const fetchNotes = async () => {
    try {
      const ep = isOutpatient
        ? `http://localhost:8080/api/op-prescription-notes/${encodeURIComponent(patientNo)}`
        : `http://localhost:8080/api/ip-prescription-notes/${encodeURIComponent(patientNo)}`;
      const res  = await fetch(ep);
      const data = await res.json();
      if (res.ok) setPrescriberNotes(data.notes || []);
    } catch { setPrescriberNotes([]); }
  };

  useEffect(() => { fetchMeds(); fetchNotes(); }, [patientNo]);

  // ── Edit prescriber note ─────────────────────────────────────
  const handleEditNote = (n) => {
    setEditingNoteId(n.ID);
    setEditNoteText(n.Notes);
  };

  const handleSaveNoteEdit = async (id) => {
    if (!editNoteText.trim()) return;
    try {
      const ep = isOutpatient
        ? 'http://localhost:8080/api/op-prescription-notes/update'
        : 'http://localhost:8080/api/ip-prescription-notes/update';
      await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, notes: editNoteText.trim() }),
      });
      setPrescriberNotes(ns => ns.map(n => n.ID === id ? { ...n, Notes: editNoteText.trim() } : n));
    } catch {}
    setEditingNoteId(null);
    setEditNoteText("");
  };

  // ── Delete prescriber note ────────────────────────────────────
  const handleDeleteNote = async (id) => {
    try {
      const ep = isOutpatient
        ? 'http://localhost:8080/api/op-prescription-notes/delete'
        : 'http://localhost:8080/api/ip-prescription-notes/delete';
      await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setPrescriberNotes(ns => ns.filter(n => n.ID !== id));
    } catch {}
  };

  // ── Save prescriber note ──────────────────────────────────────
  const handleSaveNote = async () => {
    if (!noteText.trim()) return;
    setNoteSaving(true); setNoteMsg(null);
    try {
      const ep   = isOutpatient
        ? 'http://localhost:8080/api/op-prescription-notes'
        : 'http://localhost:8080/api/ip-prescription-notes';
      const body = isOutpatient
        ? { opNo: patientNo, notes: noteText.trim() }
        : { ipNo: patientNo, notes: noteText.trim() };
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setNoteText("");
        setNoteMsg('success');
        fetchNotes();
      } else {
        setNoteMsg('error');
      }
    } catch { setNoteMsg('error'); }
    finally {
      setNoteSaving(false);
      setTimeout(() => setNoteMsg(null), 3000);
    }
  };

  // ── Fetch diagnosis ──────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const ep   = isOutpatient
          ? `/api/op-diagnosis/${encodeURIComponent(patientNo)}`
          : `/api/ip-diagnosis/${encodeURIComponent(patientNo)}`;
        const res  = await fetch(ep);
        const data = await res.json();
        if (res.ok && data.diagnosis) {
          setDiagnosis({
            primary:   data.diagnosis.Diagnosis           || "",
            secondary: data.diagnosis.Secondary_Diagnosis || "",
            notes:     data.diagnosis.Clinical_Notes      || "",
          });
        }
      } catch {}
      finally { setDiagLoading(false); }
    };
    load();
  }, [patientNo]);

  // ── Save diagnosis ───────────────────────────────────────────
  const handleSaveDiagnosis = async () => {
    setSaving(true); setSaveMsg(null);
    try {
      const ep   = isOutpatient ? '/api/op-diagnosis' : '/api/ip-diagnosis';
      const body = isOutpatient
        ? { opNo: patientNo, primary: diagnosis.primary, secondary: diagnosis.secondary, notes: diagnosis.notes }
        : { ipNo: patientNo, primary: diagnosis.primary, secondary: diagnosis.secondary, notes: diagnosis.notes };
      const res = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setSaveMsg(res.ok ? 'success' : 'error');
    } catch { setSaveMsg('error'); }
    finally { setSaving(false); setTimeout(() => setSaveMsg(null), 3000); }
  };

  // ── Drug search ──────────────────────────────────────────────
  const updateDropdownPos = () => {
    if (searchInputRef.current) {
      const rect = searchInputRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  };

  const handleSearch = (q) => {
    setSearchQ(q);
    setNewMed(null);
    clearTimeout(debounceRef.current);
    if (!q.trim() || q.trim().length < 2) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res  = await fetch(`http://localhost:8080/api/drug-inventory/search?q=${encodeURIComponent(q.trim())}`);
        const data = await res.json();
        if (res.ok) setSearchResults(data.drugs || []);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 350);
  };

  const handleSelectDrug = (drug) => {
    setNewMed(drug);
    setSearchQ(`${drug.Brand_Name} — ${drug.Generic_Name} (${drug.Strength})`);
    setSearchResults([]);
    setNewErrors({});
  };

  // ── Save new medication row ──────────────────────────────────
  const handleAutoSave = async () => {
    const errors = {};
    if (!newMed)                   errors.drug      = "Select a drug.";
    if (!newForm.route.trim())     errors.route     = "Required.";
    if (!newForm.frequency.trim()) errors.frequency = "Required.";
    if (!newForm.days.trim())      errors.days      = "Required.";
    if (Object.keys(errors).length) { setNewErrors(errors); return; }
    setAddSaving(true);
    try {
      const ep   = isOutpatient
        ? 'http://localhost:8080/api/op-prescriptions'
        : 'http://localhost:8080/api/ip-prescriptions';
      const body = isOutpatient
        ? { opNo: patientNo, brand: newMed.Brand_Name, generic: newMed.Generic_Name, strength: newMed.Strength, route: newForm.route, frequency: newForm.frequency, days: newForm.days }
        : { ipNo: patientNo, brand: newMed.Brand_Name, generic: newMed.Generic_Name, strength: newMed.Strength, route: newForm.route, frequency: newForm.frequency, days: newForm.days };
      await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setShowAddRow(false);
      setSearchQ(""); setSearchResults([]); setNewMed(null);
      setNewForm({ route: "", frequency: "", days: "" });
      setNewErrors({});
      fetchMeds();
    } catch {}
    finally { setAddSaving(false); }
  };

  const handleCancelAdd = () => {
    setShowAddRow(false);
    setSearchQ(""); setSearchResults([]); setNewMed(null);
    setNewForm({ route: "", frequency: "", days: "" });
    setNewErrors({});
  };

  // ── Edit ─────────────────────────────────────────────────────
  const handleEdit = (m) => {
    setEditingId(m.ID);
    setEditValues({ route: m.Route || "", frequency: m.Frequency || "", days: m.Days || "" });
    setOpenMenu(null);
  };

  const handleSaveEdit = async (id) => {
    try {
      const ep = isOutpatient
        ? 'http://localhost:8080/api/op-prescriptions/update'
        : 'http://localhost:8080/api/ip-prescriptions/update';
      await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, route: editValues.route, frequency: editValues.frequency, days: editValues.days }),
      });
      setMedications(m => m.map(x => x.ID === id
        ? { ...x, Route: editValues.route, Frequency: editValues.frequency, Days: editValues.days }
        : x));
    } catch {}
    setEditingId(null); setEditValues({});
  };

  const handleHold = (id) => {
    setMedications(m => m.map(x => x.ID === id ? { ...x, held: !x.held } : x));
    setOpenMenu(null);
  };

  const handleDelete = async (id) => {
    try {
      const ep = isOutpatient
        ? 'http://localhost:8080/api/op-prescriptions/delete'
        : 'http://localhost:8080/api/ip-prescriptions/delete';
      await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      setMedications(m => m.filter(x => x.ID !== id));
    } catch {}
    setOpenMenu(null);
  };

  const handleMenuOpen = (e, id) => {
    e.stopPropagation();
    if (openMenu === id) { setOpenMenu(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, left: rect.right - 150 });
    setOpenMenu(id);
  };

  useEffect(() => {
    const close = () => setOpenMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  // ── Static data ──────────────────────────────────────────────
  const interactions = {
    "drug-drug": {
      badges: [{ label: "Critical (1)", cls: "diag-badge-red" }, { label: "Major (1)", cls: "diag-badge-orange" }, { label: "Moderate (0)", cls: "diag-badge-gray" }],
      title: "Warfarin + Bactrim", desc: "Significantly increased bleeding risk — Bactrim inhibits Warfarin metabolism via CYP2C9.",
      rec: "Consider alternative antibiotic: Azithromycin 500 mg × 1, then 250 mg daily × 4 days.", note: "⚠ Amoxicillin contraindicated — patient has Penicillin allergy.",
    },
    "drug-disease": {
      badges: [{ label: "Major (2)", cls: "diag-badge-orange" }, { label: "Moderate (1)", cls: "diag-badge-gray" }],
      title: "Metformin + CKD (eGFR 45)", desc: "Metformin is contraindicated when eGFR < 30 mL/min. Current eGFR 45 requires dose reduction.",
      rec: "Reduce Metformin to 500 mg BID. Recheck eGFR in 4 weeks. Hold if eGFR drops below 30.", note: null,
    },
    "drug-food": {
      badges: [{ label: "Major (1)", cls: "diag-badge-orange" }, { label: "Moderate (2)", cls: "diag-badge-gray" }],
      title: "Warfarin + Vitamin K Foods", desc: "Large or inconsistent intake of Vitamin K-rich foods can destabilise INR levels.",
      rec: "Maintain consistent Vitamin K intake — do not eliminate, but avoid sudden large changes.", note: null,
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

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="diag-wrap">

      {/* ── Diagnosis ── */}
      <div className="diag-card">
        <div className="diag-card-header">
          <span className="diag-card-title">🩻 Diagnosis</span>
        </div>
        <div className="diag-card-body">
          <div className="diag-row-2">
            <div className="diag-field">
              <label className="diag-lbl">Primary Diagnosis</label>
              <input className="diag-inp" placeholder={diagLoading ? "Loading..." : "e.g. Type 2 Diabetes Mellitus"}
                value={diagnosis.primary} disabled={diagLoading}
                onChange={e => setDiagnosis(d => ({ ...d, primary: e.target.value }))} />
            </div>
            <div className="diag-field">
              <label className="diag-lbl">Secondary Diagnosis</label>
              <input className="diag-inp" placeholder={diagLoading ? "Loading..." : "e.g. Hypertension, CKD Stage 3"}
                value={diagnosis.secondary} disabled={diagLoading}
                onChange={e => setDiagnosis(d => ({ ...d, secondary: e.target.value }))} />
            </div>
          </div>
          <div className="diag-field">
            <label className="diag-lbl">Clinical Notes</label>
            <textarea className="diag-ta" rows={3}
              placeholder={diagLoading ? "Loading..." : "Additional clinical observations..."}
              value={diagnosis.notes} disabled={diagLoading}
              onChange={e => setDiagnosis(d => ({ ...d, notes: e.target.value }))} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: "0.75rem" }}>
            {saveMsg === "success" && <span style={{ fontSize: "0.8rem", color: "#16a34a", fontWeight: 600 }}>✅ Saved</span>}
            {saveMsg === "error"   && <span style={{ fontSize: "0.8rem", color: "#e05252", fontWeight: 600 }}>❌ Failed</span>}
            <button className="diag-save-diagnosis-btn" onClick={handleSaveDiagnosis} disabled={saving || diagLoading}>
              {saving ? "Saving..." : "💾 Save Diagnosis"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Medication + Prescriber Notes ── */}
      <div className="diag-grid-2">

        {/* Medication card */}
        <div className="diag-card" style={{ overflow: "visible" }}>
          <div className="diag-card-header">
            <span className="diag-card-title">💊 Medication List</span>
            <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "#888" }}>
              {medications.length} medication{medications.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div style={{ overflowX: "auto", overflowY: "visible", position: "relative" }}>
            <table className="diag-table">
              <thead>
                <tr>
                  <th>S.No</th><th>Brand Name</th><th>Generic Name</th><th>Strength</th>
                  <th>Route *</th><th>Frequency *</th><th>Days *</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {medLoading ? (
                  <tr><td colSpan={8} style={{ textAlign: "center", color: "#aaa", padding: "2rem", fontSize: "0.85rem" }}>Loading...</td></tr>
                ) : (
                  <>
                    {medications.map((m, i) => {
                      const isEditing = editingId === m.ID;
                      return (
                        <tr key={m.ID} style={{ opacity: m.held ? 0.5 : 1, background: isEditing ? "#f0f5ff" : "" }}>
                          <td className="diag-sno">{i + 1}</td>
                          <td className="diag-med-name">
                            {m.Brand_Name}
                            {m.held && <span style={{ fontSize: "0.65rem", color: "#f59e0b", marginLeft: 4, fontWeight: 700 }}>HOLD</span>}
                          </td>
                          <td className="diag-generic">{m.Generic_Name}</td>
                          <td className="diag-mono">{m.Strength}</td>
                          <td>
                            {isEditing
                              ? <input className="diag-inline-inp" style={{ borderColor: "#1a73e8", background: "#fff", borderWidth: 1, borderStyle: "solid" }}
                                  value={editValues.route} autoFocus
                                  onChange={e => setEditValues(v => ({ ...v, route: e.target.value }))} placeholder="Route" />
                              : <span>{m.Route || "—"}</span>}
                          </td>
                          <td>
                            {isEditing
                              ? <input className="diag-inline-inp" style={{ borderColor: "#1a73e8", background: "#fff", borderWidth: 1, borderStyle: "solid" }}
                                  value={editValues.frequency}
                                  onChange={e => setEditValues(v => ({ ...v, frequency: e.target.value }))} placeholder="Freq" />
                              : <span>{m.Frequency || "—"}</span>}
                          </td>
                          <td>
                            {isEditing
                              ? <input className="diag-inline-inp" style={{ borderColor: "#1a73e8", background: "#fff", borderWidth: 1, borderStyle: "solid" }}
                                  value={editValues.days}
                                  onChange={e => setEditValues(v => ({ ...v, days: e.target.value }))} placeholder="Days" />
                              : <span>{m.Days || "—"}</span>}
                          </td>
                          <td style={{ position: "relative" }}>
                            <button className="diag-menu-btn" onClick={e => handleMenuOpen(e, m.ID)}>⋮</button>
                            {openMenu === m.ID && (
                              <div className="diag-dropdown" style={{ top: menuPos.top, left: menuPos.left }}>
                                {isEditing
                                  ? <div className="diag-drop-item" style={{ color: "#1a73e8", fontWeight: 700 }}
                                      onClick={() => handleSaveEdit(m.ID)}>💾 Save</div>
                                  : <div className="diag-drop-item" onClick={() => handleEdit(m)}>✏️ Edit</div>}
                                <div className="diag-drop-item" onClick={() => handleHold(m.ID)}>
                                  {m.held ? "▶️ Resume" : "⏸ Hold"}
                                </div>
                                <div className="diag-drop-item diag-drop-warn" onClick={() => handleDelete(m.ID)}>🗑 Delete</div>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Inline Add Row */}
                    {showAddRow && (
                      <tr className="diag-add-inline-row">
                        <td className="diag-sno" style={{ color: "#1a73e8" }}>+</td>
                        <td colSpan={3} style={{ position: "relative", overflow: "visible" }}>
                          <input
                            ref={searchInputRef}
                            className="diag-inline-search-inp"
                            placeholder="🔍 Search brand or generic name..."
                            value={searchQ}
                            onChange={e => { handleSearch(e.target.value); updateDropdownPos(); }}
                            onFocus={updateDropdownPos}
                          />
                          {newErrors.drug && <div className="diag-inline-error">{newErrors.drug}</div>}
                          {(searching || searchResults.length > 0) && (
                            <div className="diag-search-dropdown"
                              style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width || 320 }}>
                              {searching && <div className="diag-search-loading">Searching...</div>}
                              {!searching && searchResults.length === 0 && <div className="diag-search-loading">No results found.</div>}
                              {searchResults.map((d, i) => (
                                <div key={i} className="diag-search-option" onClick={() => handleSelectDrug(d)}>
                                  <div className="diag-search-brand">{d.Brand_Name}</div>
                                  <div className="diag-search-meta">{d.Generic_Name} · {d.Strength} · Stock: {d.Stocks}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td>
                          <input className={`diag-inline-inp${newErrors.route ? " diag-inline-inp-error" : ""}`}
                            style={{ background: "#fff", borderWidth: 1, borderStyle: "solid", borderColor: newErrors.route ? "#e05252" : "#e0e3ef" }}
                            placeholder="Route *" value={newForm.route}
                            onChange={e => { setNewForm(f => ({ ...f, route: e.target.value })); setNewErrors(er => ({ ...er, route: "" })); }} />
                          {newErrors.route && <div className="diag-inline-error">{newErrors.route}</div>}
                        </td>
                        <td>
                          <input className={`diag-inline-inp${newErrors.frequency ? " diag-inline-inp-error" : ""}`}
                            style={{ background: "#fff", borderWidth: 1, borderStyle: "solid", borderColor: newErrors.frequency ? "#e05252" : "#e0e3ef" }}
                            placeholder="Freq *" value={newForm.frequency}
                            onChange={e => { setNewForm(f => ({ ...f, frequency: e.target.value })); setNewErrors(er => ({ ...er, frequency: "" })); }} />
                          {newErrors.frequency && <div className="diag-inline-error">{newErrors.frequency}</div>}
                        </td>
                        <td>
                          <input className={`diag-inline-inp${newErrors.days ? " diag-inline-inp-error" : ""}`}
                            style={{ background: "#fff", borderWidth: 1, borderStyle: "solid", borderColor: newErrors.days ? "#e05252" : "#e0e3ef" }}
                            placeholder="Days *" value={newForm.days}
                            onChange={e => { setNewForm(f => ({ ...f, days: e.target.value })); setNewErrors(er => ({ ...er, days: "" })); }} />
                          {newErrors.days && <div className="diag-inline-error">{newErrors.days}</div>}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button className="diag-save-inline-btn" onClick={handleAutoSave} disabled={addSaving}>
                              {addSaving ? "..." : "💾"}
                            </button>
                            <button className="diag-cancel-inline-btn" onClick={handleCancelAdd}>✕</button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {medications.length === 0 && !showAddRow && (
                      <tr>
                        <td colSpan={8} style={{ textAlign: "center", color: "#aaa", padding: "2rem", fontSize: "0.85rem" }}>
                          No medications added yet. Click "+ Add Medication" to begin.
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
          {!showAddRow && (
            <div className="diag-add-row">
              <div className="diag-add-btn" onClick={() => setShowAddRow(true)}>+ Add Medication</div>
            </div>
          )}
        </div>

        {/* ── Prescriber Notes ── */}
        <div className="diag-card">
          <div className="diag-card-header">
            <span className="diag-card-title">📝 Prescriber Notes</span>
            <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "#888" }}>
              {prescriberNotes.length} note{prescriberNotes.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="diag-card-body" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>

            {/* Input area on top */}
            <div className="diag-field">
              <label className="diag-lbl">Add Clinical Note</label>
              <textarea className="diag-ta" rows={3}
                placeholder="Type your clinical note here..."
                value={noteText}
                onChange={e => setNoteText(e.target.value)} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {noteMsg === "success" && <span style={{ fontSize: "0.8rem", color: "#16a34a", fontWeight: 600 }}>✅ Note saved</span>}
              {noteMsg === "error"   && <span style={{ fontSize: "0.8rem", color: "#e05252", fontWeight: 600 }}>❌ Failed to save</span>}
              <button className="diag-save-btn" onClick={handleSaveNote} disabled={noteSaving || !noteText.trim()}
                style={{ marginTop: 0, marginLeft: "auto" }}>
                {noteSaving ? "Saving..." : "💾 Save Note"}
              </button>
            </div>

            {/* Divider */}
            {prescriberNotes.length > 0 && <div className="diag-divider" />}

            {/* Saved notes list */}
            {prescriberNotes.length === 0 ? (
              <p style={{ fontSize: "0.82rem", color: "#aaa", textAlign: "center", margin: "0.5rem 0" }}>
                No notes yet. Add your first clinical note above.
              </p>
            ) : (
              prescriberNotes.map((n, i) => (
                <div key={n.ID || i} className="diag-note-item">
                  {editingNoteId === n.ID ? (
                    <>
                      <textarea className="diag-ta" rows={2}
                        value={editNoteText}
                        onChange={e => setEditNoteText(e.target.value)}
                        style={{ marginBottom: 6 }} />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="diag-save-inline-btn"
                          onClick={() => handleSaveNoteEdit(n.ID)}>💾 Save</button>
                        <button className="diag-cancel-inline-btn"
                          onClick={() => { setEditingNoteId(null); setEditNoteText(""); }}>Cancel</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="diag-note-text">{n.Notes}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                        <span className="diag-note-meta">{formatDate(n.Added_On)}</span>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="diag-action-btn"
                            onClick={() => handleEditNote(n)}
                            style={{ fontSize: "0.7rem", padding: "2px 8px" }}>✏️ Edit</button>
                          <button className="diag-action-btn"
                            onClick={() => handleDeleteNote(n.ID)}
                            style={{ fontSize: "0.7rem", padding: "2px 8px", color: "#e05252", borderColor: "#fca5a5" }}>🗑 Delete</button>
                        </div>
                      </div>
                    </>
                  )}
                  {i < prescriberNotes.length - 1 && <div className="diag-divider" style={{ marginBottom: 0 }} />}
                </div>
              ))
            )}
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
                <button key={t} className={`diag-int-tab${intTab === t ? " active" : ""}`} onClick={() => setIntTab(t)}>
                  {t === "drug-drug" ? "Drug–Drug" : t === "drug-disease" ? "Drug–Disease" : "Drug–Food"}
                </button>
              ))}
            </div>
          </div>
          <div className="diag-card-body">
            <div className="diag-badge-row">
              {int.badges.map(b => <span key={b.label} className={`diag-badge ${b.cls}`}>{b.label}</span>)}
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
          {[{ key: "drug", label: "Drug Counselling" }, { key: "condition", label: "Condition Counselling" }].map(t => (
            <button key={t.key} className={`diag-ctab${counselTab === t.key ? " active" : ""}`} onClick={() => setCounselTab(t.key)}>
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
                {c.approved ? <span className="diag-badge-approved">✓ APPROVED</span> : <span className="diag-badge-pending">PENDING</span>}
                {!c.approved && <button className="diag-action-btn diag-action-approve">✓ Approve</button>}
                <button className="diag-action-btn">Remove</button>
                <button className="diag-action-btn">Preview</button>
              </div>
            </div>
          ))}
          <button className="diag-add-counsel">+ Add new counselling point</button>
        </div>
      </div>

    </div>
  );
};

export default DiagnosisTab;