import { useEffect, useState, useRef } from "react";
import "../components/styles/diagnosisTab.css";
import { runAgentAnalysis, buildPatientProfile, buildPatientLabs } from "../services/agentApi";
import { apiFetch } from "../services/api";
import MedicationList         from "./medicationList";
import PrescriberNotes        from "./prescriberNotes";
import DrugInteractionWarning from "./drugInteractionWarning";
import DosingRecommendation   from "./dosingRecommendation";
import OutOfStockFinder       from "./outOfStockFinder";
import PatientCounselling     from "./patientCounselling";

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
      const epPres = isOutpatient
        ? `/api/op-prescriptions/${encodeURIComponent(patientNo)}`
        : `/api/ip-prescriptions/${encodeURIComponent(patientNo)}`;
      const presRes  = await apiFetch(epPres);
      const presData = await presRes.json();
      const presRow  = (presData.prescriptions || []).find(pr =>
        pr.Brand_Name?.toLowerCase() === med.Brand_Name?.toLowerCase() &&
        pr.Generic_Name?.toLowerCase() === med.Generic_Name?.toLowerCase()
      );
      if (!presRow) return;
      setOutOfStock(prev => {
        if (prev.find(o => o.med.Brand_Name === med.Brand_Name)) return prev;
        return [...prev, { med: { ...med, ID: presRow.ID }, alternatives }];
      });
    } catch {}
  };

  // ── Switch medication ────────────────────────────────────────
  const handleSwitch = async (outMed, altDrug) => {
    try {
      const delEp = isOutpatient ? "/api/op-prescriptions/delete" : "/api/ip-prescriptions/delete";
      await apiFetch(delEp, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: outMed.ID }),
      });
      const addEp   = isOutpatient ? "/api/op-prescriptions" : "/api/ip-prescriptions";
      const addBody = isOutpatient
        ? { opNo: patientNo, brand: altDrug.Brand_Name, generic: altDrug.Generic_Name, strength: altDrug.Strength, route: outMed.Route || "", frequency: outMed.Frequency || "", days: outMed.Days || "" }
        : { ipNo: patientNo, brand: altDrug.Brand_Name, generic: altDrug.Generic_Name, strength: altDrug.Strength, route: outMed.Route || "", frequency: outMed.Frequency || "", days: outMed.Days || "" };
      await apiFetch(addEp, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addBody),
      });
      setOutOfStock(prev => prev.filter(o => o.med.Brand_Name !== outMed.Brand_Name));
      await fetchMeds();
    } catch (err) { console.error("Switch failed:", err); }
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
  const triggerAnalysis = async () => {
    if (medications.length === 0) return;
    setAgentLoading(true); setAgentError(null);
    try {
      const labEp  = isOutpatient
        ? `/api/op-lab/${encodeURIComponent(patientNo)}`
        : `/api/lab/${encodeURIComponent(patientNo)}`;
      const labRes  = await apiFetch(labEp);
      const labData = labRes.ok ? (await labRes.json()).lab : null;
      const conditions = [diagnosis.primary, diagnosis.secondary]
        .filter(Boolean)
        .flatMap(d => d.split(",").map(s => s.trim()).filter(Boolean));
      const doseMap = {};
      medications.forEach(m => {
        if (m.Generic_Name)
          doseMap[m.Generic_Name] = [m.Strength, m.Frequency].filter(Boolean).join(" ");
      });
      const result = await runAgentAnalysis({
        medications:       medications.map(m => m.Generic_Name).filter(Boolean),
        diseases:          conditions,
        age:               p.Age,
        sex:               p.Sex === "M" ? "male" : "female",
        doseMap,
        patientProfile:    buildPatientProfile(p),
        patientLabs:       buildPatientLabs(labData, p),
        preferredLanguage: null,
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
  const formatDate = (s) => s
    ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

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
        <button onClick={triggerAnalysis} style={{ padding: "3px 12px", borderRadius: 6, border: "1px solid #e05252", background: "transparent", color: "#e05252", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600 }}>Retry</button>
      </div>
    );
    if (agentResult) return (
      <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "8px 14px", fontSize: "0.78rem", color: "#16a34a", marginBottom: 12 }}>
        ✅ VabGenRx Safety analysis completed
      </div>
    );
    return null;
  };

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
        <MedicationList
          medications={medications}
          medLoading={medLoading}
          showAddRow={showAddRow}
          setShowAddRow={setShowAddRow}
          searchQ={searchQ}
          searchResults={searchResults}
          searching={searching}
          newMed={newMed}
          newForm={newForm}
          setNewForm={setNewForm}
          newErrors={newErrors}
          setNewErrors={setNewErrors}
          addSaving={addSaving}
          editingId={editingId}
          editValues={editValues}
          setEditValues={setEditValues}
          openMenu={openMenu}
          menuPos={menuPos}
          dropdownPos={dropdownPos}
          agentLoading={agentLoading}
          agentResult={agentResult}
          handleSearch={handleSearch}
          handleSelectDrug={handleSelectDrug}
          handleAutoSave={handleAutoSave}
          handleCancelAdd={handleCancelAdd}
          handleEdit={handleEdit}
          handleSaveEdit={handleSaveEdit}
          handleHold={handleHold}
          handleDelete={handleDelete}
          handleMenuOpen={handleMenuOpen}
          updateDropdownPos={updateDropdownPos}
          triggerAnalysis={triggerAnalysis}
          searchInputRef={searchInputRef}
        />
        <PrescriberNotes
          prescriberNotes={prescriberNotes}
          noteText={noteText}
          setNoteText={setNoteText}
          noteSaving={noteSaving}
          noteMsg={noteMsg}
          editingNoteId={editingNoteId}
          editNoteText={editNoteText}
          setEditNoteText={setEditNoteText}
          handleSaveNote={handleSaveNote}
          handleSaveNoteEdit={handleSaveNoteEdit}
          handleDeleteNote={handleDeleteNote}
          setEditingNoteId={setEditingNoteId}
          formatDate={formatDate}
        />
      </div>

      {/* ── Agent Banner ── */}
      <AgentBanner />

      {/* ── Drug Interactions + Dosing ── */}
      <div className="diag-grid-2">
        <DrugInteractionWarning
          agentResult={agentResult}
          agentLoading={agentLoading}
          agentError={agentError}
          intTab={intTab}
          setIntTab={setIntTab}
          ddSevTab={ddSevTab}
          setDdSevTab={setDdSevTab}
          ddisTab={ddisTab}
          setDdisTab={setDdisTab}
        />
        <DosingRecommendation
          agentResult={agentResult}
          agentLoading={agentLoading}
          doseTab={doseTab}
          setDoseTab={setDoseTab}
        />
      </div>

      {/* ── Out-of-Stock Finder ── */}
      <OutOfStockFinder
        outOfStock={outOfStock}
        setOutOfStock={setOutOfStock}
        handleSwitch={handleSwitch}
      />

      {/* ── Patient Counselling ── */}
      <PatientCounselling
        agentResult={agentResult}
        agentLoading={agentLoading}
        counselTab={counselTab}
        setCounselTab={setCounselTab}
        p={p}
      />

    </div>
  );
};

export default DiagnosisTab;