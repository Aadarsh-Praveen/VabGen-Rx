import { useEffect, useState, useRef } from "react";
import "./diagnosisTab.css";
import { runAgentAnalysis, buildPatientProfile, buildPatientLabs } from "../services/agentApi";
import { apiFetch } from "../services/api";

const DiagnosisTab = ({ p }) => {
  const isOutpatient = !!p.OP_No;
  const patientNo    = p.OP_No || p.IP_No;

  // ── State ────────────────────────────────────────────────────
  const [diagnosis, setDiagnosis]         = useState({ primary: "", secondary: "", notes: "" });
  const [diagLoading, setDiagLoading]     = useState(true);
  const [saving, setSaving]               = useState(false);
  const [saveMsg, setSaveMsg]             = useState(null);
  const [intTab, setIntTab]               = useState("drug-drug");
  const [ddSevTab, setDdSevTab]           = useState("severe");
  const [ddisTab, setDdisTab]             = useState("contraindicated");
  const [doseTab, setDoseTab]             = useState("high");
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
  const [dropdownPos, setDropdownPos]     = useState({ top: 0, left: 0, width: 0 });
  const [prescriberNotes, setPrescriberNotes] = useState([]);
  const [noteText, setNoteText]               = useState("");
  const [noteSaving, setNoteSaving]           = useState(false);
  const [noteMsg, setNoteMsg]                 = useState(null);
  const [editingNoteId, setEditingNoteId]     = useState(null);
  const [editNoteText, setEditNoteText]       = useState("");
  const [agentResult, setAgentResult]         = useState(null);
  const [agentLoading, setAgentLoading]       = useState(false);
  const [agentError, setAgentError]           = useState(null);
  const [outOfStock, setOutOfStock]           = useState([]);

  const searchInputRef      = useRef(null);
  const debounceRef         = useRef(null);
  const analysisDebounceRef = useRef(null);

  // ── Derived ──────────────────────────────────────────────────
  const drugDrug            = agentResult?.drug_drug              || [];
  const drugDisease         = agentResult?.drug_disease           || [];
  const drugFood            = agentResult?.drug_food              || [];
  const dosingRecs          = agentResult?.dosing_recommendations || [];
  const drugCounseling      = agentResult?.drug_counseling        || [];
  const conditionCounseling = agentResult?.condition_counseling   || [];

  // ── Fetch medications ────────────────────────────────────────
  const fetchMeds = async () => {
    setMedLoading(true);
    try {
      const ep  = isOutpatient
        ? `/api/op-prescriptions/${encodeURIComponent(patientNo)}`
        : `/api/ip-prescriptions/${encodeURIComponent(patientNo)}`;
      const res  = await apiFetch(ep);
      const data = await res.json();
      if (res.ok) setMedications(data.prescriptions || []);
    } catch { setMedications([]); }
    finally { setMedLoading(false); }
  };

  // ── Fetch prescriber notes ───────────────────────────────────
  const fetchNotes = async () => {
    try {
      const ep  = isOutpatient
        ? `/api/op-prescription-notes/${encodeURIComponent(patientNo)}`
        : `/api/ip-prescription-notes/${encodeURIComponent(patientNo)}`;
      const res  = await apiFetch(ep);
      const data = await res.json();
      if (res.ok) setPrescriberNotes(data.notes || []);
    } catch { setPrescriberNotes([]); }
  };

  useEffect(() => { fetchMeds(); fetchNotes(); }, [patientNo]);
  useEffect(() => () => clearTimeout(analysisDebounceRef.current), []);
  useEffect(() => {
    const close = () => setOpenMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  // ── Load saved diagnosis ─────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const ep  = isOutpatient
          ? `/api/op-diagnosis/${encodeURIComponent(patientNo)}`
          : `/api/ip-diagnosis/${encodeURIComponent(patientNo)}`;
        const res  = await apiFetch(ep);
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

  // ── Check stock for newly added med ─────────────────────────
  const checkStockForMed = async (med) => {
    if (!med || !med.Generic_Name || !med.Strength) return;
    try {
      const res  = await apiFetch(`/api/drug-inventory/search?q=${encodeURIComponent(med.Generic_Name.trim())}`);
      const data = await res.json();
      if (!res.ok) return;
      const drugs        = data.drugs || [];
      const sameStrength = drugs.filter(d =>
        d.Generic_Name?.toLowerCase().trim() === med.Generic_Name.toLowerCase().trim() &&
        d.Strength?.trim() === med.Strength?.trim()
      );
      const outEntry = sameStrength.find(d =>
        d.Brand_Name === med.Brand_Name &&
        (d.Stocks === 0 || d.Stocks === "0" || !d.Stocks)
      );
      if (!outEntry) return;
      const alternatives = sameStrength.filter(d =>
        d.Brand_Name !== med.Brand_Name && parseInt(d.Stocks) > 0
      );
      // Re-fetch prescriptions to get the real DB row ID for this med
      const epPres = isOutpatient
        ? `/api/op-prescriptions/${encodeURIComponent(patientNo)}`
        : `/api/ip-prescriptions/${encodeURIComponent(patientNo)}`;
      const presRes  = await apiFetch(epPres);
      const presData = await presRes.json();
      const presRow  = (presData.prescriptions || []).find(pr =>
        pr.Brand_Name?.toLowerCase() === med.Brand_Name?.toLowerCase() &&
        pr.Generic_Name?.toLowerCase() === med.Generic_Name?.toLowerCase()
      );
      if (!presRow) return; // prescription not saved yet — shouldn't happen
      setOutOfStock(prev => {
        if (prev.find(o => o.med.Brand_Name === med.Brand_Name)) return prev;
        // Store presRow so handleSwitch has the real prescription ID
        return [...prev, { med: { ...med, ID: presRow.ID }, alternatives }];
      });
    } catch {}
  };

  // ── Switch medication ────────────────────────────────────────
  const handleSwitch = async (outMed, altDrug) => {
    try {
      // 1. Delete the out-of-stock prescription using its real DB row ID
      const delEp = isOutpatient ? "/api/op-prescriptions/delete" : "/api/ip-prescriptions/delete";
      await apiFetch(delEp, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: outMed.ID }),
      });
      // 2. Insert the alternative with same route/freq/days
      const addEp   = isOutpatient ? "/api/op-prescriptions" : "/api/ip-prescriptions";
      const addBody = isOutpatient
        ? { opNo: patientNo, brand: altDrug.Brand_Name, generic: altDrug.Generic_Name, strength: altDrug.Strength, route: outMed.Route || "", frequency: outMed.Frequency || "", days: outMed.Days || "" }
        : { ipNo: patientNo, brand: altDrug.Brand_Name, generic: altDrug.Generic_Name, strength: altDrug.Strength, route: outMed.Route || "", frequency: outMed.Frequency || "", days: outMed.Days || "" };
      await apiFetch(addEp, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addBody),
      });
      // 3. Remove this entry from the out-of-stock panel
      setOutOfStock(prev => prev.filter(o => o.med.Brand_Name !== outMed.Brand_Name));
      // 4. Refresh medication list — old drug gone, new drug appears
      await fetchMeds();
    } catch (err) {
      console.error("Switch failed:", err);
    }
  };

  // ── Save diagnosis ───────────────────────────────────────────
  const handleSaveDiagnosis = async () => {
    setSaving(true); setSaveMsg(null);
    try {
      const ep   = isOutpatient ? "/api/op-diagnosis" : "/api/ip-diagnosis";
      const body = isOutpatient
        ? { opNo: patientNo, primary: diagnosis.primary, secondary: diagnosis.secondary, notes: diagnosis.notes }
        : { ipNo: patientNo, primary: diagnosis.primary, secondary: diagnosis.secondary, notes: diagnosis.notes };
      const res = await apiFetch(ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setSaveMsg(res.ok ? "success" : "error");
    } catch { setSaveMsg("error"); }
    finally { setSaving(false); setTimeout(() => setSaveMsg(null), 3000); }
  };

  // ── Agent analysis ───────────────────────────────────────────
  const triggerAnalysis = async (currentMeds, currentDiagnosis) => {
    const meds = currentMeds || medications;
    const diag = currentDiagnosis || diagnosis;
    if (meds.length === 0) return;
    setAgentLoading(true); setAgentError(null);
    try {
      const labEp  = isOutpatient
        ? `/api/op-lab/${encodeURIComponent(patientNo)}`
        : `/api/lab/${encodeURIComponent(patientNo)}`;
      const labRes  = await apiFetch(labEp);
      const labData = labRes.ok ? (await labRes.json()).lab : null;
      const conditions = [diag.primary, diag.secondary]
        .filter(Boolean)
        .flatMap(d => d.split(",").map(s => s.trim()).filter(Boolean));
      const doseMap = {};
      meds.forEach(m => {
        if (m.Generic_Name)
          doseMap[m.Generic_Name] = [m.Strength, m.Frequency].filter(Boolean).join(" ");
      });
      const result = await runAgentAnalysis({
        medications:       meds.map(m => m.Generic_Name).filter(Boolean),
        diseases:          conditions,
        age:               p.Age,
        sex:               p.Sex === "M" ? "male" : "female",
        doseMap,
        patientProfile:    buildPatientProfile(p),
        patientLabs:       buildPatientLabs(labData, p),
        preferredLanguage: p.Preferred_Language || null,
      });
      setAgentResult(result.analysis);
    } catch (err) { setAgentError(err.message); }
    finally { setAgentLoading(false); }
  };

  // ── Note handlers ────────────────────────────────────────────
  const handleSaveNote = async () => {
    if (!noteText.trim()) return;
    setNoteSaving(true); setNoteMsg(null);
    try {
      const ep   = isOutpatient ? "/api/op-prescription-notes" : "/api/ip-prescription-notes";
      const body = isOutpatient ? { opNo: patientNo, notes: noteText.trim() } : { ipNo: patientNo, notes: noteText.trim() };
      const res  = await apiFetch(ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { setNoteText(""); setNoteMsg("success"); fetchNotes(); }
      else setNoteMsg("error");
    } catch { setNoteMsg("error"); }
    finally { setNoteSaving(false); setTimeout(() => setNoteMsg(null), 3000); }
  };

  const handleSaveNoteEdit = async (id) => {
    if (!editNoteText.trim()) return;
    try {
      const ep = isOutpatient ? "/api/op-prescription-notes/update" : "/api/ip-prescription-notes/update";
      await apiFetch(ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, notes: editNoteText.trim() }) });
      setPrescriberNotes(ns => ns.map(n => n.ID === id ? { ...n, Notes: editNoteText.trim() } : n));
    } catch {}
    setEditingNoteId(null); setEditNoteText("");
  };

  const handleDeleteNote = async (id) => {
    try {
      const ep = isOutpatient ? "/api/op-prescription-notes/delete" : "/api/ip-prescription-notes/delete";
      await apiFetch(ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      setPrescriberNotes(ns => ns.filter(n => n.ID !== id));
    } catch {}
  };

  // ── Med handlers ─────────────────────────────────────────────
  const updateDropdownPos = () => {
    if (searchInputRef.current) {
      const r = searchInputRef.current.getBoundingClientRect();
      setDropdownPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  };

  const handleSearch = (q) => {
    setSearchQ(q); setNewMed(null); clearTimeout(debounceRef.current);
    if (!q.trim() || q.trim().length < 2) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res  = await apiFetch(`/api/drug-inventory/search?q=${encodeURIComponent(q.trim())}`);
        const data = await res.json();
        if (res.ok) setSearchResults(data.drugs || []);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 350);
  };

  const handleSelectDrug = (drug) => {
    setNewMed(drug);
    setSearchQ(`${drug.Brand_Name} — ${drug.Generic_Name} (${drug.Strength})`);
    setSearchResults([]); setNewErrors({});
  };

  const handleAutoSave = async () => {
    const errors = {};
    if (!newMed)                   errors.drug      = "Select a drug.";
    if (!newForm.route.trim())     errors.route     = "Required.";
    if (!newForm.frequency.trim()) errors.frequency = "Required.";
    if (!newForm.days.trim())      errors.days      = "Required.";
    if (Object.keys(errors).length) { setNewErrors(errors); return; }
    setAddSaving(true);
    try {
      const ep   = isOutpatient ? "/api/op-prescriptions" : "/api/ip-prescriptions";
      const body = isOutpatient
        ? { opNo: patientNo, brand: newMed.Brand_Name, generic: newMed.Generic_Name, strength: newMed.Strength, route: newForm.route, frequency: newForm.frequency, days: newForm.days }
        : { ipNo: patientNo, brand: newMed.Brand_Name, generic: newMed.Generic_Name, strength: newMed.Strength, route: newForm.route, frequency: newForm.frequency, days: newForm.days };
      await apiFetch(ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const savedMed = { ...newMed, Route: newForm.route, Frequency: newForm.frequency, Days: newForm.days };
      setShowAddRow(false);
      setSearchQ(""); setSearchResults([]); setNewMed(null);
      setNewForm({ route: "", frequency: "", days: "" }); setNewErrors({});
      await fetchMeds();
      await checkStockForMed(savedMed);
    } catch {}
    finally { setAddSaving(false); }
  };

  const handleCancelAdd = () => {
    setShowAddRow(false);
    setSearchQ(""); setSearchResults([]); setNewMed(null);
    setNewForm({ route: "", frequency: "", days: "" }); setNewErrors({});
  };

  const handleEdit = (m) => {
    setEditingId(m.ID);
    setEditValues({ route: m.Route || "", frequency: m.Frequency || "", days: m.Days || "" });
    setOpenMenu(null);
  };

  const handleSaveEdit = async (id) => {
    try {
      const ep = isOutpatient ? "/api/op-prescriptions/update" : "/api/ip-prescriptions/update";
      await apiFetch(ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, route: editValues.route, frequency: editValues.frequency, days: editValues.days }) });
      setMedications(m => m.map(x => x.ID === id ? { ...x, Route: editValues.route, Frequency: editValues.frequency, Days: editValues.days } : x));
    } catch {}
    setEditingId(null); setEditValues({});
  };

  const handleHold = (id) => { setMedications(m => m.map(x => x.ID === id ? { ...x, held: !x.held } : x)); setOpenMenu(null); };

  const handleDelete = async (id) => {
    try {
      const ep = isOutpatient ? "/api/op-prescriptions/delete" : "/api/ip-prescriptions/delete";
      await apiFetch(ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
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

  // ── Helpers ──────────────────────────────────────────────────
  const formatDate = (s) => s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  const severityColor = (s) => s === "severe" ? "diag-badge-red" : s === "moderate" ? "diag-badge-orange" : "diag-badge-gray";

  const TabLabel = ({ label, count }) => (
    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
      {label}
      {count > 0 && (
        <span style={{ background: "#e05252", color: "#fff", borderRadius: "999px", fontSize: "0.6rem", fontWeight: 800, padding: "1px 6px", lineHeight: 1.4 }}>
          {count}
        </span>
      )}
    </span>
  );

  const SevPills = ({ tabs, active, onSelect }) => (
    <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onSelect(t.key)} style={{
          padding: "4px 14px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700,
          cursor: "pointer", border: `1.5px solid ${active === t.key ? t.border : "#e0e3ef"}`,
          background: active === t.key ? t.bg : "#fff",
          color: active === t.key ? t.color : "#888",
          display: "flex", alignItems: "center", gap: 5,
        }}>
          {t.label}
          {t.items.length > 0 && (
            <span style={{ background: t.color, color: "#fff", borderRadius: "50%", width: 16, height: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.6rem", fontWeight: 800 }}>
              {t.items.length}
            </span>
          )}
        </button>
      ))}
    </div>
  );

  // ── Agent banner ─────────────────────────────────────────────
  const AgentBanner = () => {
    if (agentLoading) return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px", fontSize: "0.82rem", color: "#1a73e8", marginBottom: 12 }}>
        <div className="pd-spinner" style={{ width: 16, height: 16, borderWidth: 2, flexShrink: 0 }} />
        🤖 Running VabGenRx Safety analysis...
      </div>
    );
    if (agentError) return (
      <div style={{ background: "#fff5f5", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", fontSize: "0.82rem", color: "#e05252", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>⚠️ Analysis error: {agentError}</span>
        <button onClick={() => triggerAnalysis(medications, diagnosis)} style={{ padding: "3px 12px", borderRadius: 6, border: "1px solid #e05252", background: "transparent", color: "#e05252", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600 }}>Retry</button>
      </div>
    );
    if (agentResult) return (
      <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "8px 14px", fontSize: "0.78rem", color: "#16a34a", marginBottom: 12 }}>
        ✅ VabGenRx Safety analysis completed
      </div>
    );
    return null;
  };

  // ── Drug-drug sub-tabs ───────────────────────────────────────
  const ddMap = {
    severe:   drugDrug.filter(i => i.severity === "severe"),
    moderate: drugDrug.filter(i => i.severity === "moderate"),
    minor:    drugDrug.filter(i => i.severity !== "severe" && i.severity !== "moderate"),
  };
  const ddTabs = [
    { key: "severe",   label: "Severe",   color: "#e05252", bg: "#fff0f0", border: "#fca5a5", items: ddMap.severe },
    { key: "moderate", label: "Moderate", color: "#f59e0b", bg: "#fff7ed", border: "#fcd34d", items: ddMap.moderate },
    { key: "minor",    label: "Minor",    color: "#888",    bg: "#f0f0f8", border: "#e0e3ef", items: ddMap.minor },
  ];

  // ── Drug-disease sub-tabs ────────────────────────────────────
  const disMap = {
    contraindicated: drugDisease.filter(i => i.contraindicated),
    moderate:        drugDisease.filter(i => !i.contraindicated && i.severity === "moderate"),
    minor:           drugDisease.filter(i => !i.contraindicated && i.severity !== "moderate"),
  };
  const disTabs = [
    { key: "contraindicated", label: "Contraindicated", color: "#e05252", bg: "#fff0f0", border: "#fca5a5", items: disMap.contraindicated },
    { key: "moderate",        label: "Moderate",        color: "#f59e0b", bg: "#fff7ed", border: "#fcd34d", items: disMap.moderate },
    { key: "minor",           label: "Minor",           color: "#888",    bg: "#f0f0f8", border: "#e0e3ef", items: disMap.minor },
  ];

  // ── Dosing sub-tabs ──────────────────────────────────────────
  const adjusted  = dosingRecs.filter(r => r.adjustment_required);
  const highItems = adjusted.filter(r => r.urgency === "high");
  const medItems  = adjusted.filter(r => r.urgency !== "high");
  const doseTabs  = [
    { key: "high",   label: "High",   color: "#e05252", bg: "#fff0f0", border: "#fca5a5", items: highItems },
    { key: "medium", label: "Medium", color: "#f59e0b", bg: "#fff7ed", border: "#fcd34d", items: medItems },
  ];
  const activeDoseItems = doseTab === "high" ? highItems : medItems;

  // ════════════════════════════════════════════════════════════
  return (
    <div className="diag-wrap">

      {/* ── Diagnosis ── */}
      <div className="diag-card">
        <div className="diag-card-header"><span className="diag-card-title">🩻 Diagnosis</span></div>
        <div className="diag-card-body">
          <div className="diag-row-2">
            <div className="diag-field">
              <label className="diag-lbl">Primary Diagnosis</label>
              <input className="diag-inp" placeholder={diagLoading ? "Loading..." : "e.g. Type 2 Diabetes Mellitus"} value={diagnosis.primary} disabled={diagLoading} onChange={e => setDiagnosis(d => ({ ...d, primary: e.target.value }))} />
            </div>
            <div className="diag-field">
              <label className="diag-lbl">Secondary Diagnosis</label>
              <input className="diag-inp" placeholder={diagLoading ? "Loading..." : "e.g. Hypertension, CKD Stage 3"} value={diagnosis.secondary} disabled={diagLoading} onChange={e => setDiagnosis(d => ({ ...d, secondary: e.target.value }))} />
            </div>
          </div>
          <div className="diag-field">
            <label className="diag-lbl">Clinical Notes</label>
            <textarea className="diag-ta" rows={3} placeholder={diagLoading ? "Loading..." : "Additional clinical observations..."} value={diagnosis.notes} disabled={diagLoading} onChange={e => setDiagnosis(d => ({ ...d, notes: e.target.value }))} />
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
            <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "#888" }}>{medications.length} medication{medications.length !== 1 ? "s" : ""}</span>
          </div>
          <div style={{ overflowX: "auto", overflowY: "visible", position: "relative" }}>
            <table className="diag-table">
              <thead>
                <tr><th>S.No</th><th>Brand Name</th><th>Generic Name</th><th>Strength</th><th>Route *</th><th>Frequency *</th><th>Days *</th><th>Action</th></tr>
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
                          <td className="diag-med-name">{m.Brand_Name}{m.held && <span style={{ fontSize: "0.65rem", color: "#f59e0b", marginLeft: 4, fontWeight: 700 }}>HOLD</span>}</td>
                          <td className="diag-generic">{m.Generic_Name}</td>
                          <td className="diag-mono">{m.Strength}</td>
                          <td>{isEditing ? <input className="diag-inline-inp" style={{ borderColor: "#1a73e8", background: "#fff", borderWidth: 1, borderStyle: "solid" }} value={editValues.route} autoFocus placeholder="Route" onChange={e => setEditValues(v => ({ ...v, route: e.target.value }))} /> : <span>{m.Route || "—"}</span>}</td>
                          <td>{isEditing ? <input className="diag-inline-inp" style={{ borderColor: "#1a73e8", background: "#fff", borderWidth: 1, borderStyle: "solid" }} value={editValues.frequency} placeholder="Freq" onChange={e => setEditValues(v => ({ ...v, frequency: e.target.value }))} /> : <span>{m.Frequency || "—"}</span>}</td>
                          <td>{isEditing ? <input className="diag-inline-inp" style={{ borderColor: "#1a73e8", background: "#fff", borderWidth: 1, borderStyle: "solid" }} value={editValues.days} placeholder="Days" onChange={e => setEditValues(v => ({ ...v, days: e.target.value }))} /> : <span>{m.Days || "—"}</span>}</td>
                          <td style={{ position: "relative" }}>
                            <button className="diag-menu-btn" onClick={e => handleMenuOpen(e, m.ID)}>⋮</button>
                            {openMenu === m.ID && (
                              <div className="diag-dropdown" style={{ top: menuPos.top, left: menuPos.left }}>
                                {isEditing
                                  ? <div className="diag-drop-item" style={{ color: "#1a73e8", fontWeight: 700 }} onClick={() => handleSaveEdit(m.ID)}>💾 Save</div>
                                  : <div className="diag-drop-item" onClick={() => handleEdit(m)}>✏️ Edit</div>}
                                <div className="diag-drop-item" onClick={() => handleHold(m.ID)}>{m.held ? "▶️ Resume" : "⏸ Hold"}</div>
                                <div className="diag-drop-item diag-drop-warn" onClick={() => handleDelete(m.ID)}>🗑 Delete</div>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {showAddRow && (
                      <tr className="diag-add-inline-row">
                        <td className="diag-sno" style={{ color: "#1a73e8" }}>+</td>
                        <td colSpan={3} style={{ position: "relative", overflow: "visible" }}>
                          <input ref={searchInputRef} className="diag-inline-search-inp" placeholder="🔍 Search brand or generic name..." value={searchQ}
                            onChange={e => { handleSearch(e.target.value); updateDropdownPos(); }} onFocus={updateDropdownPos} />
                          {newErrors.drug && <div className="diag-inline-error">{newErrors.drug}</div>}
                          {(searching || searchResults.length > 0) && (
                            <div className="diag-search-dropdown" style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width || 320 }}>
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
                          <input className={`diag-inline-inp${newErrors.route ? " diag-inline-inp-error" : ""}`} style={{ background: "#fff", borderWidth: 1, borderStyle: "solid", borderColor: newErrors.route ? "#e05252" : "#e0e3ef" }} placeholder="Route *" value={newForm.route} onChange={e => { setNewForm(f => ({ ...f, route: e.target.value })); setNewErrors(er => ({ ...er, route: "" })); }} />
                          {newErrors.route && <div className="diag-inline-error">{newErrors.route}</div>}
                        </td>
                        <td>
                          <input className={`diag-inline-inp${newErrors.frequency ? " diag-inline-inp-error" : ""}`} style={{ background: "#fff", borderWidth: 1, borderStyle: "solid", borderColor: newErrors.frequency ? "#e05252" : "#e0e3ef" }} placeholder="Freq *" value={newForm.frequency} onChange={e => { setNewForm(f => ({ ...f, frequency: e.target.value })); setNewErrors(er => ({ ...er, frequency: "" })); }} />
                          {newErrors.frequency && <div className="diag-inline-error">{newErrors.frequency}</div>}
                        </td>
                        <td>
                          <input className={`diag-inline-inp${newErrors.days ? " diag-inline-inp-error" : ""}`} style={{ background: "#fff", borderWidth: 1, borderStyle: "solid", borderColor: newErrors.days ? "#e05252" : "#e0e3ef" }} placeholder="Days *" value={newForm.days} onChange={e => { setNewForm(f => ({ ...f, days: e.target.value })); setNewErrors(er => ({ ...er, days: "" })); }} />
                          {newErrors.days && <div className="diag-inline-error">{newErrors.days}</div>}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button className="diag-save-inline-btn" onClick={handleAutoSave} disabled={addSaving}>{addSaving ? "..." : "💾"}</button>
                            <button className="diag-cancel-inline-btn" onClick={handleCancelAdd}>✕</button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {medications.length === 0 && !showAddRow && (
                      <tr><td colSpan={8} style={{ textAlign: "center", color: "#aaa", padding: "2rem", fontSize: "0.85rem" }}>No medications added yet. Click "+ Add Medication" to begin.</td></tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #f0f0f8" }}>
            {!showAddRow
              ? <div className="diag-add-btn" onClick={() => setShowAddRow(true)}>+ Add Medication</div>
              : <div />}
            {medications.length > 0 && !showAddRow && (
              <button onClick={() => triggerAnalysis(medications, diagnosis)} disabled={agentLoading} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 18px", background: agentLoading ? "#94a3b8" : "linear-gradient(135deg, #1a73e8, #1558b0)", color: "#fff", border: "none", borderRadius: 8, fontSize: "0.82rem", fontWeight: 700, cursor: agentLoading ? "not-allowed" : "pointer", margin: "6px 8px 6px 0", boxShadow: agentLoading ? "none" : "0 2px 8px rgba(26,115,232,0.3)" }}>
                {agentLoading ? (
                  <><div style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "pd-spin 0.7s linear infinite", flexShrink: 0 }} />Analysing...</>
                ) : agentResult ? <>🔄 Re-analyse</> : <>✅ Done — Run Analysis</>}
              </button>
            )}
          </div>
        </div>

        {/* Prescriber Notes */}
        <div className="diag-card">
          <div className="diag-card-header">
            <span className="diag-card-title">📝 Prescriber Notes</span>
            <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "#888" }}>{prescriberNotes.length} note{prescriberNotes.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="diag-card-body" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div className="diag-field">
              <label className="diag-lbl">Add Clinical Note</label>
              <textarea className="diag-ta" rows={3} placeholder="Type your clinical note here..." value={noteText} onChange={e => setNoteText(e.target.value)} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {noteMsg === "success" && <span style={{ fontSize: "0.8rem", color: "#16a34a", fontWeight: 600 }}>✅ Note saved</span>}
              {noteMsg === "error"   && <span style={{ fontSize: "0.8rem", color: "#e05252", fontWeight: 600 }}>❌ Failed to save</span>}
              <button className="diag-save-btn" onClick={handleSaveNote} disabled={noteSaving || !noteText.trim()} style={{ marginTop: 0, marginLeft: "auto" }}>
                {noteSaving ? "Saving..." : "💾 Save Note"}
              </button>
            </div>
            {prescriberNotes.length > 0 && <div className="diag-divider" />}
            {prescriberNotes.length === 0 ? (
              <p style={{ fontSize: "0.82rem", color: "#aaa", textAlign: "center", margin: "0.5rem 0" }}>No notes yet. Add your first clinical note above.</p>
            ) : (
              prescriberNotes.map((n, i) => (
                <div key={n.ID || i} className="diag-note-item">
                  {editingNoteId === n.ID ? (
                    <>
                      <textarea className="diag-ta" rows={2} value={editNoteText} onChange={e => setEditNoteText(e.target.value)} style={{ marginBottom: 6 }} />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="diag-save-inline-btn" onClick={() => handleSaveNoteEdit(n.ID)}>💾 Save</button>
                        <button className="diag-cancel-inline-btn" onClick={() => { setEditingNoteId(null); setEditNoteText(""); }}>Cancel</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="diag-note-text">{n.Notes}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                        <span className="diag-note-meta">{formatDate(n.Added_On)}</span>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="diag-action-btn" onClick={() => { setEditingNoteId(n.ID); setEditNoteText(n.Notes); }} style={{ fontSize: "0.7rem", padding: "2px 8px" }}>✏️ Edit</button>
                          <button className="diag-action-btn" onClick={() => handleDeleteNote(n.ID)} style={{ fontSize: "0.7rem", padding: "2px 8px", color: "#e05252", borderColor: "#fca5a5" }}>🗑 Delete</button>
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

      {/* ── Agent Banner ── */}
      <AgentBanner />

      {/* ── Drug Interactions + Dosing ── */}
      <div className="diag-grid-2">

        {/* Drug Interaction Warning */}
        <div className="diag-card" style={{ position: "relative" }}>
          {agentResult && (drugDrug.length > 0 || drugDisease.length > 0 || drugFood.length > 0) && (
            <div style={{ position: "absolute", top: -10, right: -10, background: "#e05252", color: "#fff", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem", boxShadow: "0 2px 8px rgba(224,82,82,0.4)", zIndex: 10, border: "2px solid #fff" }}>⚠️</div>
          )}
          <div className="diag-int-header">
            <div className="diag-card-title" style={{ color: "#e05252" }}>Drug Interaction Warning</div>
            <div className="diag-int-tabs">
              {[
                { key: "drug-drug",    label: "Drug–Drug",    count: drugDrug.length    },
                { key: "drug-disease", label: "Drug–Disease", count: drugDisease.length },
                { key: "drug-food",    label: "Drug–Food",    count: drugFood.length    },
              ].map(t => (
                <button key={t.key} className={`diag-int-tab${intTab === t.key ? " active" : ""}`} onClick={() => setIntTab(t.key)}>
                  <TabLabel label={t.label} count={t.count} />
                </button>
              ))}
            </div>
          </div>

          <div className="diag-card-body">
            {agentLoading && (
              <div style={{ textAlign: "center", padding: "1.5rem", color: "#888" }}>
                <div className="pd-spinner" style={{ margin: "0 auto 0.75rem" }} />
                <p style={{ fontSize: "0.82rem" }}>Analysing interactions...</p>
              </div>
            )}
            {!agentLoading && !agentResult && !agentError && (
              <p style={{ color: "#aaa", fontSize: "0.85rem", textAlign: "center", padding: "1.5rem 0" }}>Add medications and click <strong>Done — Run Analysis</strong> to see results.</p>
            )}
            {!agentLoading && agentResult && (
              <>
                {/* Drug-Drug */}
                {intTab === "drug-drug" && (
                  <>
                    <SevPills tabs={ddTabs} active={ddSevTab} onSelect={setDdSevTab} />
                    {ddMap[ddSevTab].length === 0 ? (
                      <p style={{ color: "#16a34a", fontSize: "0.85rem" }}>✅ No {ddSevTab} drug-drug interactions.</p>
                    ) : ddMap[ddSevTab].map((item, i) => (
                      <div key={i} style={{ marginBottom: i < ddMap[ddSevTab].length - 1 ? "1.25rem" : 0, paddingBottom: i < ddMap[ddSevTab].length - 1 ? "1.25rem" : 0, borderBottom: i < ddMap[ddSevTab].length - 1 ? "1px solid #f0f0f8" : "none" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span className="diag-int-title" style={{ margin: 0 }}>{item.drug1} + {item.drug2}</span>
                            <span className="diag-badge diag-badge-gray" style={{ fontSize: "0.68rem" }}>{Math.round((item.confidence || 0) * 100)}% confidence</span>
                          </div>
                          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                            {item.pubmed_papers > 0 && <span style={{ fontSize: "0.68rem", color: "#888", background: "#f0f0f8", border: "1px solid #e0e3ef", borderRadius: 6, padding: "2px 7px" }}>📚 {item.pubmed_papers} PubMed</span>}
                            {item.fda_reports > 0   && <span style={{ fontSize: "0.68rem", color: "#888", background: "#f0f0f8", border: "1px solid #e0e3ef", borderRadius: 6, padding: "2px 7px" }}>🏛️ {item.fda_reports} FDA</span>}
                          </div>
                        </div>
                        <div className="diag-int-desc">{item.mechanism}</div>
                        {item.clinical_effects && <div className="diag-int-desc" style={{ color: "#e05252" }}>{item.clinical_effects}</div>}
                        <div className="diag-rec-box">
                          <div className="diag-rec-label">Recommendation</div>
                          <div className="diag-rec-text">{item.recommendation}</div>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* Drug-Disease */}
                {intTab === "drug-disease" && (
                  <>
                    <SevPills tabs={disTabs} active={ddisTab} onSelect={setDdisTab} />
                    {disMap[ddisTab].length === 0 ? (
                      <p style={{ color: "#16a34a", fontSize: "0.85rem" }}>✅ No {ddisTab} drug-disease interactions.</p>
                    ) : disMap[ddisTab].map((item, i) => (
                      <div key={i} style={{ marginBottom: i < disMap[ddisTab].length - 1 ? "1.25rem" : 0, paddingBottom: i < disMap[ddisTab].length - 1 ? "1.25rem" : 0, borderBottom: i < disMap[ddisTab].length - 1 ? "1px solid #f0f0f8" : "none" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span className="diag-int-title" style={{ margin: 0 }}>{item.drug} + {item.disease}</span>
                            <span className="diag-badge diag-badge-gray" style={{ fontSize: "0.68rem" }}>{Math.round((item.confidence || 0) * 100)}% confidence</span>
                          </div>
                          {item.pubmed_papers > 0 && (
                            <span style={{ fontSize: "0.68rem", color: "#888", background: "#f0f0f8", border: "1px solid #e0e3ef", borderRadius: 6, padding: "2px 7px", flexShrink: 0 }}>📚 {item.pubmed_papers} PubMed</span>
                          )}
                        </div>
                        <div className="diag-int-desc">{item.clinical_evidence}</div>
                        <div className="diag-rec-box">
                          <div className="diag-rec-label">Recommendation</div>
                          <div className="diag-rec-text">{item.recommendation}</div>
                          {item.alternative_drugs?.length > 0 && <div className="diag-rec-note">Alternatives: {item.alternative_drugs.join(", ")}</div>}
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* Drug-Food */}
                {intTab === "drug-food" && (
                  drugFood.length === 0 ? (
                    <p style={{ color: "#16a34a", fontSize: "0.85rem" }}>✅ No significant drug-food interactions found.</p>
                  ) : drugFood.map((item, i) => (
                    <div key={i} style={{ marginBottom: i < drugFood.length - 1 ? "1.25rem" : 0 }}>
                      <div className="diag-int-title">{item.drug}</div>
                      {item.foods_to_avoid?.length    > 0 && <div style={{ marginBottom: 6 }}><span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#e05252" }}>AVOID: </span><span style={{ fontSize: "0.82rem" }}>{item.foods_to_avoid.join(", ")}</span></div>}
                      {item.foods_to_separate?.length > 0 && <div style={{ marginBottom: 6 }}><span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#f59e0b" }}>SEPARATE TIMING: </span><span style={{ fontSize: "0.82rem" }}>{item.foods_to_separate.join(", ")}</span></div>}
                      {item.foods_to_monitor?.length  > 0 && <div style={{ marginBottom: 6 }}><span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#888" }}>MONITOR: </span><span style={{ fontSize: "0.82rem" }}>{item.foods_to_monitor.join(", ")}</span></div>}
                      {item.mechanism && <div className="diag-int-desc">{item.mechanism}</div>}
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </div>

        {/* Dosing */}
        <div className="diag-card">
          <div className="diag-card-header">
            <span className="diag-card-title">
              📋 Dosing Recommendation
              {adjusted.length > 0 && (
                <span style={{ marginLeft: 8, background: "#1a73e8", color: "#fff", borderRadius: "999px", fontSize: "0.65rem", fontWeight: 700, padding: "1px 7px", lineHeight: 1.4, verticalAlign: "middle" }}>
                  {adjusted.length}
                </span>
              )}
            </span>
          </div>
          <div className="diag-card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {agentLoading && <p style={{ color: "#888", fontSize: "0.82rem", textAlign: "center", padding: "1rem 0" }}>⏳ Fetching FDA dosing data...</p>}
            {!agentLoading && dosingRecs.length === 0 && <p style={{ color: "#aaa", fontSize: "0.82rem", textAlign: "center", padding: "1rem 0" }}>Add medications and click <strong>Done — Run Analysis</strong>.</p>}
            {!agentLoading && dosingRecs.length > 0 && (
              <>
                <SevPills tabs={doseTabs} active={doseTab} onSelect={setDoseTab} />
                {activeDoseItems.length === 0 ? (
                  <p style={{ color: "#16a34a", fontSize: "0.85rem" }}>✅ No {doseTab === "high" ? "high urgency" : "medium urgency"} dose adjustments.</p>
                ) : activeDoseItems.map((r, i) => (
                  <div key={i} className={`diag-dose-item ${doseTab === "high" ? "diag-dose-critical" : "diag-dose-warning"}`}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <div className="diag-dose-tag">⚠ {(r.adjustment_type || "DOSE").toUpperCase()} ADJUSTMENT — {r.drug}</div>
                      {doseTab === "medium" && (
                        <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "#f59e0b", background: "#fff7ed", border: "1px solid #fcd34d", borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap" }}>
                          Partial FDA Label · 80–90%
                        </span>
                      )}
                    </div>
                    <div className="diag-dose-text"><strong>Current:</strong> {r.current_dose || "not specified"}&nbsp;&nbsp;<strong>→ Recommended:</strong> {r.recommended_dose}</div>
                    {r.adjustment_reason   && <div className="diag-dose-text" style={{ marginTop: 4 }}>{r.adjustment_reason}</div>}
                    {r.monitoring_required && <div className="diag-dose-text" style={{ color: "#888", fontSize: "0.75rem", marginTop: 4 }}>📊 Monitor: {r.monitoring_required}</div>}
                    {r.hold_threshold      && <div className="diag-dose-text" style={{ color: "#e05252", fontSize: "0.75rem", marginTop: 4 }}>🛑 Hold if: {r.hold_threshold}</div>}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Out-of-Stock Finder ── */}
      {outOfStock.length > 0 && (
        <div className="diag-card">
          <div className="diag-card-header" style={{ justifyContent: "space-between" }}>
            <span className="diag-card-title">📦 Out-of-Stock Medication Finder</span>
            <button onClick={() => setOutOfStock([])} style={{ background: "transparent", border: "none", color: "#aaa", fontSize: "1rem", cursor: "pointer", lineHeight: 1 }}>✕</button>
          </div>
          <div className="diag-card-body">
            {outOfStock.map((entry, ei) => (
              <div key={ei} style={{ marginBottom: ei < outOfStock.length - 1 ? "1.5rem" : 0 }}>
                {/* Out-of-stock drug row */}
                <div style={{ background: "#fff5f5", borderRadius: 8, padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: 12, marginBottom: "1rem", border: "1px solid #fca5a5" }}>
                  <span style={{ color: "#e05252", fontWeight: 700, fontSize: "0.9rem" }}>{entry.med.Brand_Name} {entry.med.Strength}</span>
                  {entry.med.Route && <span style={{ color: "#888", fontSize: "0.8rem" }}>| {entry.med.Route} {entry.med.Frequency}</span>}
                  <span style={{ marginLeft: "auto", background: "#fff0f0", color: "#e05252", border: "1px solid #fca5a5", borderRadius: 20, padding: "3px 12px", fontSize: "0.72rem", fontWeight: 700 }}>
                    🚫 Out of Stock (Hospital Pharmacy)
                  </span>
                </div>

                {/* Alternatives header */}
                <div style={{ marginBottom: 8 }}>
                  <span style={{ color: "#888", fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Available Alternatives</span>
                  <span style={{ color: "#aaa", fontSize: "0.72rem", marginLeft: 8 }}>(Same compound, same dose)</span>
                </div>

                {entry.alternatives.length === 0 ? (
                  <p style={{ color: "#aaa", fontSize: "0.82rem" }}>No alternatives found in inventory for this strength.</p>
                ) : (
                  <div style={{ border: "1px solid #eeebff", borderRadius: 10, overflow: "hidden" }}>
                    {/* Table header */}
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", padding: "0.5rem 1rem", background: "#f8f7ff", borderBottom: "1px solid #eeebff" }}>
                      {["Brand / Generic", "Strength", "Form", "Price (30-day)", "In Stock", "Action"].map(h => (
                        <span key={h} style={{ fontSize: "0.65rem", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em" }}>{h}</span>
                      ))}
                    </div>
                    {/* Table rows */}
                    {entry.alternatives.map((alt, ai) => {
                      const inStock  = parseInt(alt.Stocks) > 0;
                      const isLowest = entry.alternatives.filter(a => parseInt(a.Stocks) > 0).every(a => parseFloat(a.Cost_Per_30_USD) >= parseFloat(alt.Cost_Per_30_USD));
                      return (
                        <div key={ai} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", padding: "0.75rem 1rem", borderBottom: ai < entry.alternatives.length - 1 ? "1px solid #f0f0f8" : "none", alignItems: "center", opacity: inStock ? 1 : 0.5 }}>
                          {/* Brand */}
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                              <span style={{ width: 9, height: 9, borderRadius: "50%", flexShrink: 0, background: inStock ? "#16a34a" : "#e05252", display: "inline-block" }} />
                              <span style={{ color: "#1a1a2e", fontWeight: 600, fontSize: "0.83rem" }}>{alt.Brand_Name}</span>
                              {isLowest && inStock && (
                                <span style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #86efac", borderRadius: 20, padding: "1px 8px", fontSize: "0.62rem", fontWeight: 700 }}>+ Lowest Cost</span>
                              )}
                            </div>
                            <div style={{ color: "#aaa", fontSize: "0.7rem", marginTop: 2, paddingLeft: 16 }}>
                              Price: <span style={{ color: inStock ? "#16a34a" : "#aaa", fontWeight: 600 }}>${alt.Cost_Per_30_USD}</span> (30-day)
                            </div>
                          </div>
                          <span style={{ color: "#555", fontSize: "0.8rem" }}>{alt.Strength}</span>
                          <span style={{ color: "#555", fontSize: "0.8rem" }}>{alt.Route || "Pill"}</span>
                          <span style={{ fontWeight: 700, fontSize: "0.83rem", color: inStock ? "#16a34a" : "#aaa" }}>${alt.Cost_Per_30_USD}</span>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: "0.8rem", color: inStock ? "#16a34a" : "#e05252" }}>{inStock ? `${alt.Stocks} units` : "0 units"}</div>
                            <div style={{ fontSize: "0.68rem", color: inStock ? "#888" : "#e05252" }}>{inStock ? "in stock" : "(Unavailable)"}</div>
                          </div>
                          <button disabled={!inStock} onClick={() => handleSwitch(entry.med, alt)} style={{ padding: "6px 14px", borderRadius: 8, fontSize: "0.78rem", fontWeight: 700, border: "none", cursor: inStock ? "pointer" : "not-allowed", background: inStock ? "linear-gradient(135deg, #1a73e8, #1558b0)" : "#f0f0f8", color: inStock ? "#fff" : "#bbb", boxShadow: inStock ? "0 2px 8px rgba(26,115,232,0.25)" : "none" }}>
                            🔄 Switch
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div style={{ color: "#bbb", fontSize: "0.68rem", marginTop: 8, fontStyle: "italic" }}>
                  Prices &amp; availability shown are real-time from hospital pharmacy database.
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Patient Counselling ── */}
      <div className="diag-card">
        <div className="diag-counsel-header">
          <div className="diag-card-title">
            🩺 Patient Counselling
            {(drugCounseling.length + conditionCounseling.length) > 0 && (
              <span className="diag-points-badge">
                {drugCounseling.reduce((acc, d) => acc + (d.counseling_points?.length || 0), 0) + conditionCounseling.length} points
              </span>
            )}
          </div>
          <button className="diag-preview-btn">⟳ Preview for Patient</button>
        </div>
        <div className="diag-counsel-tabs">
          {[{ key: "drug", label: "Drug Counselling" }, { key: "condition", label: "Condition Counselling" }].map(t => (
            <button key={t.key} className={`diag-ctab${counselTab === t.key ? " active" : ""}`} onClick={() => setCounselTab(t.key)}>{t.label}</button>
          ))}
        </div>
        <div className="diag-card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {agentLoading && <p style={{ color: "#888", fontSize: "0.82rem", textAlign: "center", padding: "1rem 0" }}>⏳ Generating patient counseling...</p>}

          {counselTab === "drug" && !agentLoading && (
            drugCounseling.length === 0 ? (
              <p style={{ color: "#aaa", fontSize: "0.82rem", textAlign: "center", padding: "0.75rem 0" }}>Add medications and click <strong>Done — Run Analysis</strong>.</p>
            ) : drugCounseling.map((drug, di) => (
              <div key={di} style={{ marginBottom: di < drugCounseling.length - 1 ? "1rem" : 0 }}>
                <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "#1a73e8", marginBottom: 8 }}>💊 {drug.drug}</div>
                {drug.counseling_points?.map((pt, pi) => (
                  <div key={pi} className="diag-counsel-item" style={{ marginBottom: 6 }}>
                    <div className="diag-counsel-top">
                      <span className="diag-counsel-icon">{pt.category === "bleeding" ? "🩸" : pt.category === "monitoring" ? "🔬" : pt.category === "timing" ? "⏰" : pt.category === "renal" ? "🫘" : pt.category === "cardiac" ? "❤️" : "⚠️"}</span>
                      <span className="diag-counsel-title">{pt.title}</span>
                      <span className={`diag-badge ${pt.severity === "high" ? "diag-badge-red" : pt.severity === "medium" ? "diag-badge-orange" : "diag-badge-gray"}`} style={{ marginLeft: "auto" }}>{pt.severity}</span>
                    </div>
                    <div className="diag-counsel-desc">{pt.detail}</div>
                  </div>
                ))}
                {drug.key_monitoring && <div style={{ fontSize: "0.78rem", color: "#1a73e8", background: "#eff6ff", padding: "6px 10px", borderRadius: 6, marginTop: 6 }}>📊 Key monitoring: {drug.key_monitoring}</div>}
                {drug.patient_summary && <div style={{ fontSize: "0.78rem", color: "#555", background: "#f9fafb", padding: "6px 10px", borderRadius: 6, marginTop: 4, fontStyle: "italic" }}>{drug.patient_summary}</div>}
              </div>
            ))
          )}

          {counselTab === "condition" && !agentLoading && (
            conditionCounseling.length === 0 ? (
              <p style={{ color: "#aaa", fontSize: "0.82rem", textAlign: "center", padding: "0.75rem 0" }}>Save a diagnosis above and click <strong>Done — Run Analysis</strong>.</p>
            ) : conditionCounseling.map((cond, ci) => (
              <div key={ci} style={{ marginBottom: ci < conditionCounseling.length - 1 ? "1.25rem" : 0 }}>
                <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "#1a73e8", marginBottom: 8 }}>🩺 {cond.condition}</div>
                {cond.exercise?.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#888", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>🏃 Exercise</div>
                    {cond.exercise.map((ex, ei) => (
                      <div key={ei} className="diag-counsel-item" style={{ marginBottom: 5 }}>
                        <div className="diag-counsel-top"><span className="diag-counsel-title">{ex.title}</span></div>
                        <div className="diag-counsel-desc">{ex.detail}</div>
                        {ex.frequency && <div style={{ fontSize: "0.72rem", color: "#1a73e8", marginTop: 3 }}>📅 {ex.frequency}</div>}
                      </div>
                    ))}
                  </div>
                )}
                {cond.diet?.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#888", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>🥗 Diet</div>
                    {cond.diet.map((dt, dti) => (
                      <div key={dti} className="diag-counsel-item" style={{ marginBottom: 5 }}>
                        <div className="diag-counsel-top"><span className="diag-counsel-title">{dt.title}</span></div>
                        <div className="diag-counsel-desc">{dt.detail}</div>
                      </div>
                    ))}
                  </div>
                )}
                {cond.lifestyle?.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#888", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>🌿 Lifestyle</div>
                    {cond.lifestyle.map((ls, lsi) => (
                      <div key={lsi} className="diag-counsel-item" style={{ marginBottom: 5 }}>
                        <div className="diag-counsel-top"><span className="diag-counsel-title">{ls.title}</span></div>
                        <div className="diag-counsel-desc">{ls.detail}</div>
                      </div>
                    ))}
                  </div>
                )}
                {cond.safety?.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#e05252", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>⚠️ Safety</div>
                    {cond.safety.map((sf, sfi) => (
                      <div key={sfi} className="diag-counsel-item" style={{ marginBottom: 5 }}>
                        <div className="diag-counsel-top">
                          <span className="diag-counsel-title">{sf.title}</span>
                          <span className={`diag-badge ${sf.urgency === "high" ? "diag-badge-red" : "diag-badge-orange"}`} style={{ marginLeft: "auto" }}>{sf.urgency}</span>
                        </div>
                        <div className="diag-counsel-desc">{sf.detail}</div>
                      </div>
                    ))}
                  </div>
                )}
                {cond.monitoring && <div style={{ fontSize: "0.78rem", color: "#1a73e8", background: "#eff6ff", padding: "6px 10px", borderRadius: 6, marginTop: 4 }}>📊 Monitor: {cond.monitoring}</div>}
                {cond.follow_up  && <div style={{ fontSize: "0.78rem", color: "#555", background: "#f9fafb", padding: "6px 10px", borderRadius: 6, marginTop: 4 }}>📅 Follow-up: {cond.follow_up}</div>}
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
};

export default DiagnosisTab;