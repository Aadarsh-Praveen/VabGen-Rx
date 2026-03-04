import { useEffect, useState, useRef } from "react";
import "../components/styles/diagnosisTab.css";
import {
  runPhaseAnalysis,
  buildPatientProfile,
  buildPatientLabs
} from "../services/agentApi";
import { apiFetch } from "../services/api";
import MedicationList         from "./medicationList";
import PrescriberNotes        from "./prescriberNotes";
import DrugInteractionWarning from "./drugInteractionWarning";
import DosingRecommendation   from "./dosingRecommendation";
import OutOfStockFinder       from "./outOfStockFinder";
import PatientCounselling     from "./patientCounselling";

// ── Loading state constants ────────────────────────────────────────
// All phases start loading simultaneously — parallel execution
const LOADING_IDLE = {
  interactions: false,
  dosing:       false,
  counselling:  false,
  summary:      false,
};

const LOADING_ALL = {
  interactions: true,
  dosing:       true,
  counselling:  true,
  summary:      true,
};

const DiagnosisTab = ({ p, user }) => {
  const isOutpatient = !!p.OP_No;
  const patientNo    = p.OP_No || p.IP_No;

  // ── State ──────────────────────────────────────────────────────
  const [diagnosis, setDiagnosis]     = useState({
    primary: "", secondary: "", notes: ""
  });
  const [diagLoading, setDiagLoading] = useState(true);
  const [saving, setSaving]           = useState(false);
  const [saveMsg, setSaveMsg]         = useState(null);
  const [intTab, setIntTab]           = useState("drug-drug");
  const [ddSevTab, setDdSevTab]       = useState("severe");
  const [ddisTab, setDdisTab]         = useState("contraindicated");
  const [doseTab, setDoseTab]         = useState("high");
  const [counselTab, setCounselTab]   = useState("drug");
  const [openMenu, setOpenMenu]       = useState(null);
  const [medications, setMedications] = useState([]);
  const [medLoading, setMedLoading]   = useState(true);
  const [showAddRow, setShowAddRow]   = useState(false);
  const [searchQ, setSearchQ]         = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]     = useState(false);
  const [newMed, setNewMed]           = useState(null);
  const [newForm, setNewForm]         = useState({
    route: "", frequency: "", days: ""
  });
  const [newErrors, setNewErrors]     = useState({});
  const [addSaving, setAddSaving]     = useState(false);
  const [editingId, setEditingId]     = useState(null);
  const [editValues, setEditValues]   = useState({});
  const [menuPos, setMenuPos]         = useState({ top: 0, left: 0 });
  const [dropdownPos, setDropdownPos] = useState({
    top: 0, left: 0, width: 0
  });
  const [prescriberNotes, setPrescriberNotes] = useState([]);
  const [noteText, setNoteText]               = useState("");
  const [noteSaving, setNoteSaving]           = useState(false);
  const [noteMsg, setNoteMsg]                 = useState(null);
  const [editingNoteId, setEditingNoteId]     = useState(null);
  const [editNoteText, setEditNoteText]       = useState("");
  const [outOfStock, setOutOfStock]           = useState([]);

  // ── Prescribe modal ────────────────────────────────────────────
  const [showPrescribe,  setShowPrescribe]  = useState(false);
  const [ePrescribeSent, setEPrescribeSent] = useState(false);
  const [pdfGenerating,  setPdfGenerating]  = useState(false);

  // ── Agent state ────────────────────────────────────────────────
  const [agentResult,  setAgentResult]  = useState(null);
  const [loadingState, setLoadingState] = useState(LOADING_IDLE);
  const [agentError,   setAgentError]   = useState(null);

  // Derived — true if any phase is still loading
  const agentLoading = Object.values(loadingState).some(Boolean);

  const searchInputRef      = useRef(null);
  const debounceRef         = useRef(null);
  const analysisDebounceRef = useRef(null);

  // ── Fetch medications ──────────────────────────────────────────
  const fetchMeds = async () => {
    setMedLoading(true);
    try {
      const ep = isOutpatient
        ? `/api/op-prescriptions/${encodeURIComponent(patientNo)}`
        : `/api/ip-prescriptions/${encodeURIComponent(patientNo)}`;
      const res  = await apiFetch(ep);
      const data = await res.json();
      if (res.ok) setMedications(data.prescriptions || []);
    } catch { setMedications([]); }
    finally  { setMedLoading(false); }
  };

  // ── Fetch prescriber notes ─────────────────────────────────────
  const fetchNotes = async () => {
    try {
      const ep = isOutpatient
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

  // ── Load saved diagnosis ───────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const ep = isOutpatient
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

  // ── Check stock ────────────────────────────────────────────────
  const checkStockForMed = async (med) => {
    if (!med || !med.Generic_Name || !med.Strength) return;
    try {
      const res  = await apiFetch(
        `/api/drug-inventory/search?q=${encodeURIComponent(med.Generic_Name.trim())}`
      );
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
        pr.Brand_Name?.toLowerCase()  === med.Brand_Name?.toLowerCase() &&
        pr.Generic_Name?.toLowerCase() === med.Generic_Name?.toLowerCase()
      );
      if (!presRow) return;
      setOutOfStock(prev => {
        if (prev.find(o => o.med.Brand_Name === med.Brand_Name)) return prev;
        return [...prev, { med: { ...med, ID: presRow.ID }, alternatives }];
      });
    } catch {}
  };

  // ── Switch medication ──────────────────────────────────────────
  const handleSwitch = async (outMed, altDrug) => {
    try {
      const delEp = isOutpatient
        ? "/api/op-prescriptions/delete"
        : "/api/ip-prescriptions/delete";
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

  // ── Save diagnosis ─────────────────────────────────────────────
  const handleSaveDiagnosis = async () => {
    setSaving(true); setSaveMsg(null);
    try {
      const ep   = isOutpatient ? "/api/op-diagnosis" : "/api/ip-diagnosis";
      const body = isOutpatient
        ? { opNo: patientNo, primary: diagnosis.primary, secondary: diagnosis.secondary, notes: diagnosis.notes }
        : { ipNo: patientNo, primary: diagnosis.primary, secondary: diagnosis.secondary, notes: diagnosis.notes };
      const res = await apiFetch(ep, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setSaveMsg(res.ok ? "success" : "error");
    } catch { setSaveMsg("error"); }
    finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  };

  // ── Agent analysis — parallel phases with independent loading ──
  // All four phases fire simultaneously.
  // Each phase independently marks itself done when it completes.
  // UI updates immediately as each phase arrives —
  // dosing/counselling populate in ~10s while interactions
  // is still running (~30s). Total wait = slowest phase only.
  const triggerAnalysis = async () => {
    if (medications.length === 0) return;

    setAgentResult(null);
    setAgentError(null);
    setLoadingState(LOADING_ALL);

    try {
      const labEp = isOutpatient
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
          doseMap[m.Generic_Name] = [m.Strength, m.Frequency]
            .filter(Boolean).join(" ");
      });

      // Each phase independently marks itself done —
      // no assumed order, no state machine.
      // Phases complete in parallel in whatever order they finish.
      const onPhaseComplete = (phase, data) => {
        // Mark this specific phase done immediately
        setLoadingState(prev => ({ ...prev, [phase]: false }));

        if (!data) return; // phase failed — spinner cleared, move on

        // Merge only this phase's own fields — never overwrite
        // data from other phases that may have already arrived
        setAgentResult(prev => {
          const base = prev || {
            drug_drug:              [],
            drug_disease:           [],
            drug_food:              [],
            dosing_recommendations: [],
            drug_counseling:        [],
            condition_counseling:   [],
            compounding_signals:    {},
            risk_summary:           {},
          };

          if (phase === "interactions") return {
            ...base,
            drug_drug:           data.drug_drug           ?? base.drug_drug,
            drug_disease:        data.drug_disease        ?? base.drug_disease,
            drug_food:           data.drug_food           ?? base.drug_food,
            compounding_signals: data.compounding_signals ?? base.compounding_signals,
          };

          if (phase === "dosing") return {
            ...base,
            dosing_recommendations: data.dosing_recommendations ?? base.dosing_recommendations,
          };

          if (phase === "counselling") return {
            ...base,
            drug_counseling:      data.drug_counseling      ?? base.drug_counseling,
            condition_counseling: data.condition_counseling ?? base.condition_counseling,
          };

          if (phase === "summary") return {
            ...base,
            risk_summary: data.risk_summary ?? base.risk_summary,
            compounding_signals: (
              data.compounding_signals &&
              Object.keys(data.compounding_signals).length > 0
            ) ? data.compounding_signals : base.compounding_signals,
          };

          return base;
        });
      };

      await runPhaseAnalysis({
        medications:       medications.map(m => m.Generic_Name).filter(Boolean),
        diseases:          conditions,
        age:               p.Age,
        sex:               p.Sex === "M" ? "male" : "female",
        doseMap,
        patientProfile:    buildPatientProfile(p),
        patientLabs:       buildPatientLabs(labData, p),
        preferredLanguage: null,
        onPhaseComplete,
      });

    } catch (err) {
      setAgentError(err.message);
    } finally {
      setLoadingState(LOADING_IDLE);
    }
  };

  // ── Note handlers ──────────────────────────────────────────────
  const handleSaveNote = async () => {
    if (!noteText.trim()) return;
    setNoteSaving(true); setNoteMsg(null);
    try {
      const ep   = isOutpatient ? "/api/op-prescription-notes" : "/api/ip-prescription-notes";
      const body = isOutpatient
        ? { opNo: patientNo, notes: noteText.trim() }
        : { ipNo: patientNo, notes: noteText.trim() };
      const res  = await apiFetch(ep, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) { setNoteText(""); setNoteMsg("success"); fetchNotes(); }
      else setNoteMsg("error");
    } catch { setNoteMsg("error"); }
    finally {
      setNoteSaving(false);
      setTimeout(() => setNoteMsg(null), 3000);
    }
  };

  const handleSaveNoteEdit = async (id) => {
    if (!editNoteText.trim()) return;
    try {
      const ep = isOutpatient
        ? "/api/op-prescription-notes/update"
        : "/api/ip-prescription-notes/update";
      await apiFetch(ep, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, notes: editNoteText.trim() }),
      });
      setPrescriberNotes(ns =>
        ns.map(n => n.ID === id ? { ...n, Notes: editNoteText.trim() } : n)
      );
    } catch {}
    setEditingNoteId(null); setEditNoteText("");
  };

  const handleDeleteNote = async (id) => {
    try {
      const ep = isOutpatient
        ? "/api/op-prescription-notes/delete"
        : "/api/ip-prescription-notes/delete";
      await apiFetch(ep, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setPrescriberNotes(ns => ns.filter(n => n.ID !== id));
    } catch {}
  };

  // ── Med handlers ───────────────────────────────────────────────
  const updateDropdownPos = () => {
    if (searchInputRef.current) {
      const r = searchInputRef.current.getBoundingClientRect();
      setDropdownPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  };

  const handleSearch = (q) => {
    setSearchQ(q); setNewMed(null);
    clearTimeout(debounceRef.current);
    if (!q.trim() || q.trim().length < 2) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res  = await apiFetch(`/api/drug-inventory/search?q=${encodeURIComponent(q.trim())}`);
        const data = await res.json();
        if (res.ok) setSearchResults(data.drugs || []);
      } catch { setSearchResults([]); }
      finally   { setSearching(false); }
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
      await apiFetch(ep, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const savedMed = { ...newMed, Route: newForm.route, Frequency: newForm.frequency, Days: newForm.days };
      setShowAddRow(false);
      setSearchQ(""); setSearchResults([]);
      setNewMed(null);
      setNewForm({ route: "", frequency: "", days: "" });
      setNewErrors({});
      await fetchMeds();
      await checkStockForMed(savedMed);
    } catch {}
    finally { setAddSaving(false); }
  };

  const handleCancelAdd = () => {
    setShowAddRow(false);
    setSearchQ(""); setSearchResults([]);
    setNewMed(null);
    setNewForm({ route: "", frequency: "", days: "" });
    setNewErrors({});
  };

  const handleEdit = (m) => {
    setEditingId(m.ID);
    setEditValues({ route: m.Route || "", frequency: m.Frequency || "", days: m.Days || "" });
    setOpenMenu(null);
  };

  const handleSaveEdit = async (id) => {
    try {
      const ep = isOutpatient
        ? "/api/op-prescriptions/update"
        : "/api/ip-prescriptions/update";
      await apiFetch(ep, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, route: editValues.route, frequency: editValues.frequency, days: editValues.days }),
      });
      setMedications(m =>
        m.map(x => x.ID === id
          ? { ...x, Route: editValues.route, Frequency: editValues.frequency, Days: editValues.days }
          : x
        )
      );
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
        ? "/api/op-prescriptions/delete"
        : "/api/ip-prescriptions/delete";
      await apiFetch(ep, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
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

  // ── Helpers ────────────────────────────────────────────────────
  const formatDate = (s) => s
    ? new Date(s).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric"
      })
    : "";

  // ── Prescription PDF ───────────────────────────────────────────
  const handlePrescriptionPdf = () => {
    setPdfGenerating(true);
    const esc = (str) =>
      String(str || "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const date = new Date().toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
    const now  = new Date().toLocaleString();
    const drName       = user?.name        || "Doctor";
    const drDesig      = user?.designation || "";
    const drDept       = user?.department  || "";
    const drLicence    = user?.licence_no  || "";
    const drHospitalId = user?.hospital_id || "";
    const drContact    = user?.contact_no  || "";
    const drEmail      = user?.email       || "";
    const ptName = p?.Name || "";
    const ptAge  = p?.Age  ? `${p.Age} yrs` : "";
    const ptSex  = p?.Sex === "M" ? "Male" : p?.Sex === "F" ? "Female" : "";
    const ptNo   = patientNo || "";
    const medRows = medications.map((m, i) => `
      <tr>
        <td class="tc">${i + 1}</td>
        <td><strong>${esc(m.Brand_Name || "")}</strong><br/>
          <span class="generic">${esc(m.Generic_Name || "")}</span></td>
        <td>${esc(m.Strength || "")}</td>
        <td>${esc(m.Route || "")}</td>
        <td>${esc(m.Frequency || "")}</td>
        <td class="tc">${esc(m.Days || "")}</td>
      </tr>`).join("");
    const diagText = [diagnosis.primary, diagnosis.secondary].filter(Boolean).join(", ");
    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Prescription</title>
<style>
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
  body { font-family:"Segoe UI",Arial,sans-serif; font-size:13px; color:#111; background:#fff; padding:36px 40px; }
  .letterhead { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #16a34a; padding-bottom:16px; margin-bottom:20px; }
  .lh-left { display:flex; flex-direction:column; gap:3px; }
  .lh-name { font-size:22px; font-weight:800; color:#16a34a; }
  .lh-desig { font-size:13px; font-weight:600; color:#333; }
  .lh-dept { font-size:12px; color:#555; }
  .lh-right { text-align:right; font-size:11px; color:#555; line-height:1.9; }
  .lh-right strong { color:#111; }
  .rx-symbol { font-size:48px; font-weight:900; color:#e5f3eb; line-height:1; align-self:center; }
  .patient-strip { display:flex; border:1px solid #d1fae5; border-radius:8px; overflow:hidden; margin-bottom:20px; background:#f0fdf4; }
  .ps-field { flex:1; padding:8px 14px; border-right:1px solid #d1fae5; }
  .ps-field:last-child { border-right:none; }
  .ps-label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.07em; color:#16a34a; margin-bottom:2px; }
  .ps-val { font-size:12px; font-weight:600; color:#111; }
  table { width:100%; border-collapse:collapse; margin-bottom:24px; }
  thead tr { background:#16a34a; }
  thead th { padding:9px 12px; font-size:11px; font-weight:700; color:#fff; text-align:left; text-transform:uppercase; }
  tbody tr { border-bottom:1px solid #f0f0f0; }
  tbody tr:nth-child(even) { background:#f9fefb; }
  tbody td { padding:9px 12px; font-size:12px; vertical-align:top; }
  .generic { font-size:11px; color:#666; font-style:italic; }
  .tc { text-align:center; }
  .notes-section { border:1px dashed #86efac; border-radius:6px; padding:10px 14px; margin-bottom:24px; font-size:11.5px; color:#444; line-height:1.6; }
  .notes-label { font-size:10px; font-weight:700; color:#16a34a; text-transform:uppercase; margin-bottom:4px; }
  .sig-row { display:flex; justify-content:flex-end; margin-top:8px; }
  .sig-box { text-align:center; }
  .sig-line { width:180px; border-top:1.5px solid #333; margin-bottom:6px; }
  .sig-name { font-size:12px; font-weight:700; color:#111; }
  .sig-sub { font-size:10px; color:#555; }
  .footer { margin-top:28px; padding-top:10px; border-top:1px solid #e0e0e0; display:flex; justify-content:space-between; font-size:10px; color:#999; }
  @page { margin:15mm 12mm; }
  @media print { body { padding:0; } }
</style></head><body>
  <div class="letterhead">
    <div class="lh-left">
      <div class="lh-name">Dr. ${esc(drName)}</div>
      ${drDesig ? `<div class="lh-desig">${esc(drDesig)}</div>` : ""}
      ${drDept  ? `<div class="lh-dept">Dept. of ${esc(drDept)}</div>` : ""}
    </div>
    <div class="rx-symbol">℞</div>
    <div class="lh-right">
      ${drLicence    ? `<div><strong>Licence No.:</strong> ${esc(drLicence)}</div>` : ""}
      ${drHospitalId ? `<div><strong>Doctor ID:</strong> ${esc(drHospitalId)}</div>` : ""}
      ${drContact    ? `<div><strong>Contact:</strong> ${esc(drContact)}</div>` : ""}
      ${drEmail      ? `<div><strong>Email:</strong> ${esc(drEmail)}</div>` : ""}
      <div><strong>Date:</strong> ${date}</div>
    </div>
  </div>
  <div class="patient-strip">
    ${ptName ? `<div class="ps-field"><div class="ps-label">Patient Name</div><div class="ps-val">${esc(ptName)}</div></div>` : ""}
    ${ptNo   ? `<div class="ps-field"><div class="ps-label">${isOutpatient ? "OP No." : "IP No."}</div><div class="ps-val">${esc(String(ptNo))}</div></div>` : ""}
    ${ptAge  ? `<div class="ps-field"><div class="ps-label">Age</div><div class="ps-val">${esc(ptAge)}</div></div>` : ""}
    ${ptSex  ? `<div class="ps-field"><div class="ps-label">Sex</div><div class="ps-val">${esc(ptSex)}</div></div>` : ""}
    ${diagText ? `<div class="ps-field" style="flex:2;"><div class="ps-label">Diagnosis</div><div class="ps-val">${esc(diagText)}</div></div>` : ""}
  </div>
  <table>
    <thead><tr>
      <th style="width:36px;">S.No</th><th>Brand / Generic Name</th>
      <th>Strength</th><th>Route</th><th>Frequency</th>
      <th style="width:50px;" class="tc">Days</th>
    </tr></thead>
    <tbody>${medRows || `<tr><td colspan="6" style="text-align:center;color:#aaa;padding:16px;">No medications prescribed</td></tr>`}</tbody>
  </table>
  ${diagnosis.notes ? `<div class="notes-section"><div class="notes-label">📋 Clinical Notes</div>${esc(diagnosis.notes)}</div>` : ""}
  <div class="sig-row">
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-name">Dr. ${esc(drName)}</div>
      ${drDesig ? `<div class="sig-sub">${esc(drDesig)}</div>` : ""}
      ${drDept  ? `<div class="sig-sub">Dept. of ${esc(drDept)}</div>` : ""}
    </div>
  </div>
  <div class="footer">
    <span>Generated by VabGenRx — For clinical use only</span>
    <span>${now}</span>
  </div>
</body></html>`;
    const printWin = window.open("", "_blank", "width=900,height=700,scrollbars=yes");
    if (!printWin) { setPdfGenerating(false); return; }
    printWin.document.open(); printWin.document.write(html); printWin.document.close();
    const doPrint = () => {
      setTimeout(() => { printWin.focus(); printWin.print(); setPdfGenerating(false); }, 400);
    };
    if (printWin.document.readyState === "complete") doPrint();
    else { printWin.onload = doPrint; setTimeout(doPrint, 2000); }
  };

  // ── E-Prescribe ────────────────────────────────────────────────
  const handleEPrescribe = () => {
    setEPrescribeSent(true);
    setTimeout(() => setEPrescribeSent(false), 3000);
  };

  // ── Agent Banner ───────────────────────────────────────────────
  // Shows each phase pill independently — they clear in parallel
  // as phases complete, not in sequence.
  const AgentBanner = () => {
  if (agentLoading) return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          10,
      background:   "#eff6ff",
      border:       "1px solid #bfdbfe",
      borderRadius: 8,
      padding:      "10px 14px",
      fontSize:     "0.82rem",
      color:        "#1a73e8",
      marginBottom: 12,
    }}>
      <div
        className="pd-spinner"
        style={{ width: 16, height: 16, borderWidth: 2, flexShrink: 0 }}
      />
      🤖 Running VabGenRx Safety analysis...
    </div>
  );

  if (agentError) return (
    <div style={{
      background:     "#fff5f5",
      border:         "1px solid #fca5a5",
      borderRadius:   8,
      padding:        "10px 14px",
      fontSize:       "0.82rem",
      color:          "#e05252",
      marginBottom:   12,
      display:        "flex",
      alignItems:     "center",
      justifyContent: "space-between",
    }}>
      <span>⚠️ Analysis error: {agentError}</span>
      <button
        onClick={triggerAnalysis}
        style={{
          padding:      "3px 12px",
          borderRadius: 6,
          border:       "1px solid #e05252",
          background:   "transparent",
          color:        "#e05252",
          cursor:       "pointer",
          fontSize:     "0.75rem",
          fontWeight:   600,
        }}
      >
        Retry
      </button>
    </div>
  );

  if (agentResult) return (
    <div style={{
      background:   "#f0fdf4",
      border:       "1px solid #86efac",
      borderRadius: 8,
      padding:      "8px 14px",
      fontSize:     "0.78rem",
      color:        "#16a34a",
      marginBottom: 12,
    }}>
      ✅ VabGenRx Safety analysis completed
    </div>
  );

  return null;
};
  // ════════════════════════════════════════════════════════════════
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
              <input
                className="diag-inp"
                placeholder={diagLoading ? "Loading..." : "e.g. Type 2 Diabetes Mellitus"}
                value={diagnosis.primary}
                disabled={diagLoading}
                onChange={e => setDiagnosis(d => ({ ...d, primary: e.target.value }))}
              />
            </div>
            <div className="diag-field">
              <label className="diag-lbl">Secondary Diagnosis</label>
              <input
                className="diag-inp"
                placeholder={diagLoading ? "Loading..." : "e.g. Hypertension, CKD Stage 3"}
                value={diagnosis.secondary}
                disabled={diagLoading}
                onChange={e => setDiagnosis(d => ({ ...d, secondary: e.target.value }))}
              />
            </div>
          </div>
          <div className="diag-field">
            <label className="diag-lbl">Clinical Notes</label>
            <textarea
              className="diag-ta" rows={3}
              placeholder={diagLoading ? "Loading..." : "Additional clinical observations..."}
              value={diagnosis.notes}
              disabled={diagLoading}
              onChange={e => setDiagnosis(d => ({ ...d, notes: e.target.value }))}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: "0.75rem" }}>
            {saveMsg === "success" && <span style={{ fontSize: "0.8rem", color: "#16a34a", fontWeight: 600 }}>✅ Saved</span>}
            {saveMsg === "error"   && <span style={{ fontSize: "0.8rem", color: "#e05252", fontWeight: 600 }}>❌ Failed</span>}
            <button
              className="diag-save-diagnosis-btn"
              onClick={handleSaveDiagnosis}
              disabled={saving || diagLoading}
            >
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
      {/* Each component gets its own phase loading flag ── */}
      <div className="diag-grid-2">
        <DrugInteractionWarning
          agentResult={agentResult}
          agentLoading={loadingState.interactions}
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
          agentLoading={loadingState.dosing}
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
        agentLoading={loadingState.counselling}
        counselTab={counselTab}
        setCounselTab={setCounselTab}
        p={p}
        onPrescribe={() => setShowPrescribe(true)}
        prescribeDisabled={medications.length === 0}
      />

      {/* ══════════════ PRESCRIBE MODAL ══════════════ */}
      {showPrescribe && (
        <div className="presc-overlay" onClick={() => setShowPrescribe(false)}>
          <div className="presc-modal" onClick={e => e.stopPropagation()}>
            <div className="presc-header">
              <div className="presc-title">📋 Prescription</div>
              <button className="presc-close" onClick={() => setShowPrescribe(false)}>✕</button>
            </div>
            <div className="presc-letterhead">
              <div className="presc-lh-left">
                <div className="presc-dr-name">Dr. {user?.name || "Doctor"}</div>
                {user?.designation && <div className="presc-dr-desig">{user.designation}</div>}
                {user?.department  && <div className="presc-dr-dept">Dept. of {user.department}</div>}
              </div>
              <div className="presc-rx">℞</div>
              <div className="presc-lh-right">
                {user?.licence_no  && <div><span>Licence:</span> {user.licence_no}</div>}
                {user?.hospital_id && <div><span>ID:</span> {user.hospital_id}</div>}
                {user?.contact_no  && <div><span>Contact:</span> {user.contact_no}</div>}
              </div>
            </div>
            <div className="presc-patient-row">
              {p?.Name && <div className="presc-pf"><div className="presc-pf-label">Patient</div><div className="presc-pf-val">{p.Name}</div></div>}
              <div className="presc-pf">
                <div className="presc-pf-label">{isOutpatient ? "OP No." : "IP No."}</div>
                <div className="presc-pf-val">{patientNo}</div>
              </div>
              {p?.Age && <div className="presc-pf"><div className="presc-pf-label">Age</div><div className="presc-pf-val">{p.Age} yrs</div></div>}
              {p?.Sex && <div className="presc-pf"><div className="presc-pf-label">Sex</div><div className="presc-pf-val">{p.Sex === "M" ? "Male" : "Female"}</div></div>}
            </div>
            {(diagnosis.primary || diagnosis.secondary) && (
              <div className="presc-diag">
                <span className="presc-diag-label">Diagnosis:</span>{" "}
                {[diagnosis.primary, diagnosis.secondary].filter(Boolean).join(", ")}
              </div>
            )}
            <div className="presc-table-wrap">
              <table className="presc-table">
                <thead>
                  <tr>
                    <th>S.No</th><th>Brand Name</th><th>Generic Name</th>
                    <th>Strength</th><th>Route</th><th>Frequency</th><th>Days</th>
                  </tr>
                </thead>
                <tbody>
                  {medications.length === 0
                    ? <tr><td colSpan={7} className="presc-empty">No medications added yet.</td></tr>
                    : medications.map((m, i) => (
                      <tr key={m.ID || i}>
                        <td className="presc-tc">{i + 1}</td>
                        <td><strong>{m.Brand_Name || "—"}</strong></td>
                        <td className="presc-generic">{m.Generic_Name || "—"}</td>
                        <td>{m.Strength  || "—"}</td>
                        <td>{m.Route     || "—"}</td>
                        <td>{m.Frequency || "—"}</td>
                        <td className="presc-tc">{m.Days || "—"}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
            <div className="presc-footer">
              <span className="presc-footer-note">
                {medications.length} medication{medications.length !== 1 ? "s" : ""}
                {" · "}
                {new Date().toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
              </span>
              <div className="presc-footer-btns">
                <button className="presc-btn-pdf" onClick={handlePrescriptionPdf} disabled={pdfGenerating}>
                  {pdfGenerating ? "Generating..." : "📄 Save as PDF"}
                </button>
                <button className="presc-btn-eprescribe" onClick={handleEPrescribe}>
                  ⚡ E-Prescribe
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── E-Prescribe toast ── */}
      {ePrescribeSent && (
        <div className="presc-toast">✅ E-Prescription sent successfully!</div>
      )}

    </div>
  );
};

export default DiagnosisTab;