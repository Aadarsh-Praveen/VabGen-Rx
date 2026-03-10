import { useEffect, useState, useRef } from "react";
import { ScanLine, Save, CheckCircle2, AlertCircle, RotateCcw, ClipboardList, FileDown, Zap, X, AlertTriangle } from "lucide-react";
import "../components/styles/diagnosisTab.css";
import { runPhaseAnalysis, buildPatientProfile, buildPatientLabs } from "../services/agentApi";
import { apiFetch } from "../services/api";
import MedicationList         from "./medicationList";
import PrescriberNotes        from "./prescriberNotes";
import DrugInteractionWarning from "./drugInteractionWarning";
import DosingRecommendation   from "./dosingRecommendation";
import OutOfStockFinder       from "./outOfStockFinder";
import PatientCounselling     from "./patientCounselling";

const LOADING_IDLE = { interactions: false, dosing: false, counselling: false, summary: false };
const LOADING_ALL  = { interactions: true,  dosing: true,  counselling: true,  summary: true  };

const FREQ_DOSES_PER_DAY = {
  qd: 1, qod: 0.5, bid: 2, tid: 3, qid: 4,
  q2h: 12, q3h: 8, q4h: 6, "q4h wa": 4, prn: 1,
};

function buildInteractionPayload(patientNo, isOutpatient, agentResult) {
  const dd   = agentResult?.drug_drug    || [];
  const ddis = agentResult?.drug_disease || [];
  const df   = agentResult?.drug_food    || [];
  return {
    ...(isOutpatient ? { op_no: patientNo } : { ip_no: patientNo }),
    dd_severe:            dd.filter(x => x.severity === "severe"),
    dd_moderate:          dd.filter(x => x.severity === "moderate"),
    dd_minor:             dd.filter(x => x.severity !== "severe" && x.severity !== "moderate"),
    ddis_contraindicated: ddis.filter(x => x.contraindicated),
    ddis_moderate:        ddis.filter(x => !x.contraindicated && x.severity === "moderate"),
    ddis_minor:           ddis.filter(x => !x.contraindicated && x.severity !== "moderate"),
    drug_food:            df,
  };
}

const DiagnosisTab = ({ p, user }) => {
  const isOutpatient = !!p.OP_No;
  const patientNo    = p.OP_No || p.IP_No;

  const [diagnosis, setDiagnosis]             = useState({ primary: "", secondary: "", notes: "" });
  const [diagLoading, setDiagLoading]         = useState(true);
  const [saving, setSaving]                   = useState(false);
  const [saveMsg, setSaveMsg]                 = useState(null);
  const [intTab, setIntTab]                   = useState("drug-drug");
  const [ddSevTab, setDdSevTab]               = useState("severe");
  const [ddisTab, setDdisTab]                 = useState("contraindicated");
  const [doseTab, setDoseTab]                 = useState("high");
  const [counselTab, setCounselTab]           = useState("drug");
  const [openMenu, setOpenMenu]               = useState(null);
  const [medications, setMedications]         = useState([]);
  const [medLoading, setMedLoading]           = useState(true);
  const [showAddRow, setShowAddRow]           = useState(false);
  const [searchQ, setSearchQ]                 = useState("");
  const [searchResults, setSearchResults]     = useState([]);
  const [searching, setSearching]             = useState(false);
  const [newMed, setNewMed]                   = useState(null);
  const [newForm, setNewForm]                 = useState({ route: "", frequency: "", days: "" });
  const [newErrors, setNewErrors]             = useState({});
  const [addSaving, setAddSaving]             = useState(false);
  const [editingId, setEditingId]             = useState(null);
  const [editValues, setEditValues]           = useState({});
  const [menuPos, setMenuPos]                 = useState({ top: 0, left: 0 });
  const [dropdownPos, setDropdownPos]         = useState({ top: 0, left: 0, width: 0 });
  const [prescriberNotes, setPrescriberNotes] = useState([]);
  const [noteText, setNoteText]               = useState("");
  const [noteSaving, setNoteSaving]           = useState(false);
  const [noteMsg, setNoteMsg]                 = useState(null);
  const [editingNoteId, setEditingNoteId]     = useState(null);
  const [editNoteText, setEditNoteText]       = useState("");
  const [outOfStock, setOutOfStock]           = useState([]);
  const [stockToast, setStockToast]           = useState(null);
  const [showPrescribe, setShowPrescribe]     = useState(false);
  const [ePrescribeSent, setEPrescribeSent]   = useState(false);
  const [pdfGenerating, setPdfGenerating]     = useState(false);
  const [agentResult, setAgentResult]         = useState(null);
  const [loadingState, setLoadingState]       = useState(LOADING_IDLE);
  const [agentError, setAgentError]           = useState(null);
  const [wasInterrupted, setWasInterrupted]   = useState(false);

  const agentLoading        = Object.values(loadingState).some(Boolean);
  const searchInputRef      = useRef(null);
  const debounceRef         = useRef(null);
  const analysisDebounceRef = useRef(null);
  const abortRef            = useRef(null);
  const stockToastRef       = useRef(null);

  const fetchMeds = async () => {
    setMedLoading(true);
    try {
      const ep   = isOutpatient
        ? `/api/op-prescriptions/${encodeURIComponent(patientNo)}`
        : `/api/ip-prescriptions/${encodeURIComponent(patientNo)}`;
      const res  = await apiFetch(ep);
      const data = await res.json();
      if (res.ok) setMedications((data.prescriptions || []).map(m => ({ ...m, held: m.Is_Held === true || m.Is_Held === 1 })));
    } catch { setMedications([]); }
    finally { setMedLoading(false); }
  };

  const fetchNotes = async () => {
    try {
      const ep   = isOutpatient
        ? `/api/op-prescription-notes/${encodeURIComponent(patientNo)}`
        : `/api/ip-prescription-notes/${encodeURIComponent(patientNo)}`;
      const res  = await apiFetch(ep);
      const data = await res.json();
      if (res.ok) setPrescriberNotes(data.notes || []);
    } catch { setPrescriberNotes([]); }
  };

  useEffect(() => { fetchMeds(); fetchNotes(); }, [patientNo]);
  useEffect(() => () => { clearTimeout(analysisDebounceRef.current); abortRef.current?.abort(); }, []);
  useEffect(() => {
    const close = () => setOpenMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const ep   = isOutpatient
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

  useEffect(() => {
    const load = async () => {
      try {
        const [diRes, drRes, pcRes] = await Promise.all([
          apiFetch(isOutpatient ? `/api/op-drug-interactions/${encodeURIComponent(patientNo)}`      : `/api/ip-drug-interactions/${encodeURIComponent(patientNo)}`),
          apiFetch(isOutpatient ? `/api/op-dosing-recommendations/${encodeURIComponent(patientNo)}` : `/api/ip-dosing-recommendations/${encodeURIComponent(patientNo)}`),
          apiFetch(isOutpatient ? `/api/op-patient-counselling/${encodeURIComponent(patientNo)}`    : `/api/ip-patient-counselling/${encodeURIComponent(patientNo)}`),
        ]);
        const [diData, drData, pcData] = await Promise.all([diRes.json(), drRes.json(), pcRes.json()]);

        const s = (diRes.ok && diData.found && diData.data) ? diData.data : null;
        const drug_drug    = s ? [...(s.drug_drug.severe||[]), ...(s.drug_drug.moderate||[]), ...(s.drug_drug.minor||[])] : [];
        const drug_disease = s ? [...(s.drug_disease.contraindicated||[]), ...(s.drug_disease.moderate||[]), ...(s.drug_disease.minor||[])] : [];
        const drug_food    = s ? (s.drug_food || []) : [];

        const d = (drRes.ok && drData.found && drData.data) ? drData.data : null;
        const dosing_recommendations = d ? [...(d.high||[]), ...(d.medium||[])] : [];

        const c = (pcRes.ok && pcData.found && pcData.data) ? pcData.data : null;
        const drug_counseling      = c ? (c.drug_counselling      || []) : [];
        const condition_counseling = c ? (c.condition_counselling || []) : [];

        if (drug_drug.length||drug_disease.length||drug_food.length||dosing_recommendations.length||drug_counseling.length||condition_counseling.length) {
          setAgentResult({ drug_drug, drug_disease, drug_food, dosing_recommendations, drug_counseling, condition_counseling, compounding_signals: {}, risk_summary: {} });
        }
      } catch {}
    };
    load();
  }, [patientNo]);

  useEffect(() => {
    if (agentLoading || !agentResult) return;
    const save = async () => {
      try {
        await apiFetch(isOutpatient ? "/api/op-drug-interactions" : "/api/ip-drug-interactions", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildInteractionPayload(patientNo, isOutpatient, agentResult)),
        });
      } catch (err) { console.error(err); }
    };
    save();
  }, [agentResult, agentLoading]);

  useEffect(() => {
    if (agentLoading || !agentResult) return;
    const recs = agentResult.dosing_recommendations || [];
    if (!recs.length) return;
    const save = async () => {
      try {
        await apiFetch(isOutpatient ? "/api/op-dosing-recommendations" : "/api/ip-dosing-recommendations", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(isOutpatient ? { op_no: patientNo } : { ip_no: patientNo }),
            high:   recs.filter(r => r.urgency === "high"),
            medium: recs.filter(r => r.urgency === "medium" || r.urgency === "moderate"),
          }),
        });
      } catch (err) { console.error(err); }
    };
    save();
  }, [agentResult, agentLoading]);

  useEffect(() => {
    if (agentLoading || !agentResult) return;
    const drugC = agentResult.drug_counseling      || [];
    const condC = agentResult.condition_counseling || [];
    if (!drugC.length && !condC.length) return;
    const save = async () => {
      try {
        await apiFetch(isOutpatient ? "/api/op-patient-counselling" : "/api/ip-patient-counselling", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(isOutpatient ? { op_no: patientNo } : { ip_no: patientNo }),
            drug_counselling: drugC, condition_counselling: condC,
          }),
        });
      } catch (err) { console.error(err); }
    };
    save();
  }, [agentResult, agentLoading]);

  const showStockToast = (toast) => {
    clearTimeout(stockToastRef.current);
    setStockToast(null);
    requestAnimationFrame(() => {
      setStockToast(toast);
      stockToastRef.current = setTimeout(() => setStockToast(null), 8000);
    });
  };

  const preCheckStock = async (med) => {
    if (!med?.Generic_Name || !med?.Strength) return { ok: true };
    try {
      const res  = await apiFetch(`/api/drug-inventory/search?q=${encodeURIComponent(med.Generic_Name.trim())}`);
      const data = await res.json();
      if (!res.ok) return { ok: true };

      const allMatches = (data.drugs || []).filter(d =>
        d.Generic_Name?.toLowerCase().trim() === med.Generic_Name.toLowerCase().trim() &&
        d.Strength?.trim() === med.Strength?.trim()
      );
      const exactBrand = allMatches.find(d => d.Brand_Name?.toLowerCase() === med.Brand_Name?.toLowerCase());
      if (!exactBrand) return { ok: true };

      const freqKey     = (med.Frequency || "").toLowerCase().trim();
      const dosesPerDay = FREQ_DOSES_PER_DAY[freqKey] ?? 1;
      const days        = parseFloat(med.Days) || 0;
      const required    = Math.ceil(dosesPerDay * days);
      const available   = parseInt(exactBrand.Stocks) || 0;

      if (available >= required) return { ok: true };

      const alternatives = allMatches.filter(d =>
        d.Brand_Name?.toLowerCase() !== med.Brand_Name?.toLowerCase() &&
        (parseInt(d.Stocks) || 0) >= required
      );
      return { ok: false, available, required, alternatives };
    } catch {
      return { ok: true };
    }
  };

  const handleSwitch = async (outMed, altDrug) => {
    try {
      await apiFetch(isOutpatient ? "/api/op-prescriptions/delete" : "/api/ip-prescriptions/delete", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: outMed.ID }),
      });
      await apiFetch(isOutpatient ? "/api/op-prescriptions" : "/api/ip-prescriptions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isOutpatient
          ? { opNo: patientNo, brand: altDrug.Brand_Name, generic: altDrug.Generic_Name, strength: altDrug.Strength, route: outMed.Route||"", frequency: outMed.Frequency||"", days: outMed.Days||"" }
          : { ipNo: patientNo, brand: altDrug.Brand_Name, generic: altDrug.Generic_Name, strength: altDrug.Strength, route: outMed.Route||"", frequency: outMed.Frequency||"", days: outMed.Days||"" }
        ),
      });
      setOutOfStock(prev => prev.filter(o => o.med.Brand_Name !== outMed.Brand_Name));
      await fetchMeds();
    } catch (err) { console.error(err); }
  };

  const handleSaveDiagnosis = async () => {
    setSaving(true); setSaveMsg(null);
    try {
      const res = await apiFetch(isOutpatient ? "/api/op-diagnosis" : "/api/ip-diagnosis", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isOutpatient
          ? { opNo: patientNo, primary: diagnosis.primary, secondary: diagnosis.secondary, notes: diagnosis.notes }
          : { ipNo: patientNo, primary: diagnosis.primary, secondary: diagnosis.secondary, notes: diagnosis.notes }
        ),
      });
      setSaveMsg(res.ok ? "success" : "error");
    } catch { setSaveMsg("error"); }
    finally { setSaving(false); setTimeout(() => setSaveMsg(null), 3000); }
  };

  const onInterrupt = () => {
    abortRef.current?.abort();
    setLoadingState(LOADING_IDLE);
    setWasInterrupted(true);
  };

  const triggerAnalysis = async () => {
    if (!medications.length) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setAgentResult(null); setAgentError(null);
    setWasInterrupted(false); setLoadingState(LOADING_ALL);
    try {
      const labEp   = isOutpatient ? `/api/op-lab/${encodeURIComponent(patientNo)}` : `/api/lab/${encodeURIComponent(patientNo)}`;
      const labRes  = await apiFetch(labEp);
      const labData = labRes.ok ? (await labRes.json()).lab : null;
      const conditions = [diagnosis.primary, diagnosis.secondary].filter(Boolean).flatMap(d => d.split(",").map(s => s.trim()).filter(Boolean));
      const activeMeds = medications.filter(m => !m.held);
      if (!activeMeds.length) return;
      const doseMap = {};
      activeMeds.forEach(m => { if (m.Generic_Name) doseMap[m.Generic_Name] = [m.Strength, m.Frequency].filter(Boolean).join(" "); });

      const onPhaseComplete = (phase, data) => {
        if (controller.signal.aborted) return;
        setLoadingState(prev => ({ ...prev, [phase]: false }));
        if (!data) return;
        setAgentResult(prev => {
          const base = prev || { drug_drug: [], drug_disease: [], drug_food: [], dosing_recommendations: [], drug_counseling: [], condition_counseling: [], compounding_signals: {}, risk_summary: {} };
          if (phase === "interactions") return { ...base, drug_drug: data.drug_drug ?? base.drug_drug, drug_disease: data.drug_disease ?? base.drug_disease, drug_food: data.drug_food ?? base.drug_food, compounding_signals: data.compounding_signals ?? base.compounding_signals };
          if (phase === "dosing")       return { ...base, dosing_recommendations: data.dosing_recommendations ?? base.dosing_recommendations };
          if (phase === "counselling")  return { ...base, drug_counseling: data.drug_counseling ?? base.drug_counseling, condition_counseling: data.condition_counseling ?? base.condition_counseling };
          if (phase === "summary")      return { ...base, risk_summary: data.risk_summary ?? base.risk_summary, compounding_signals: (data.compounding_signals && Object.keys(data.compounding_signals).length > 0) ? data.compounding_signals : base.compounding_signals };
          return base;
        });
      };

      const response = await runPhaseAnalysis({
        medications: activeMeds.map(m => m.Generic_Name).filter(Boolean),
        diseases: conditions, age: p.Age, sex: p.Sex === "M" ? "male" : "female",
        doseMap, patientProfile: buildPatientProfile(p), patientLabs: buildPatientLabs(labData, p),
        preferredLanguage: null, signal: controller.signal, onPhaseComplete,
        userId: user?.id || user?.email || user?.name || "unknown", userEmail: user?.email || "", patientNo,
      });
      if (response.status === "interrupted") setWasInterrupted(true);
    } catch (err) {
      if (err.name !== "AbortError") setAgentError(err.message);
    } finally {
      if (abortRef.current === controller) setLoadingState(LOADING_IDLE);
    }
  };

  const handleSaveNote = async () => {
    if (!noteText.trim()) return;
    setNoteSaving(true); setNoteMsg(null);
    try {
      const res = await apiFetch(isOutpatient ? "/api/op-prescription-notes" : "/api/ip-prescription-notes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isOutpatient
          ? { opNo: patientNo, notes: noteText.trim() }
          : { ipNo: patientNo, notes: noteText.trim() }
        ),
      });
      if (res.ok) { setNoteText(""); setNoteMsg("success"); fetchNotes(); }
      else setNoteMsg("error");
    } catch { setNoteMsg("error"); }
    finally { setNoteSaving(false); setTimeout(() => setNoteMsg(null), 3000); }
  };

  const handleSaveNoteEdit = async (id) => {
    if (!editNoteText.trim()) return;
    try {
      await apiFetch(isOutpatient ? "/api/op-prescription-notes/update" : "/api/ip-prescription-notes/update", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, notes: editNoteText.trim() }),
      });
      setPrescriberNotes(ns => ns.map(n => n.ID === id ? { ...n, Notes: editNoteText.trim() } : n));
    } catch {}
    setEditingNoteId(null); setEditNoteText("");
  };

  const handleDeleteNote = async (id) => {
    try {
      await apiFetch(isOutpatient ? "/api/op-prescription-notes/delete" : "/api/ip-prescription-notes/delete", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setPrescriberNotes(ns => ns.filter(n => n.ID !== id));
    } catch {}
  };

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
      finally { setSearching(false); }
    }, 350);
  };

  const handleSelectDrug = (drug) => {
    setNewMed(drug);
    setSearchQ(`${drug.Brand_Name} — ${drug.Generic_Name} (${drug.Strength})`);
    setSearchResults([]);
    setNewErrors({});
    setNewForm(f => ({ ...f, route: drug.Route || f.route }));
  };

  const handleAutoSave = async () => {
    const errors = {};
    if (!newMed)                   errors.drug      = "Select or enter a drug.";
    if (!newForm.route.trim())     errors.route     = "Required.";
    if (!newForm.frequency.trim()) errors.frequency = "Required.";
    if (!newForm.days.trim())      errors.days      = "Required.";
    if (Object.keys(errors).length) { setNewErrors(errors); return; }

    setAddSaving(true);
    try {
      const medToCheck = {
        Brand_Name:   newMed.Brand_Name,
        Generic_Name: newMed.Generic_Name,
        Strength:     newMed.Strength,
        Frequency:    newForm.frequency,
        Days:         newForm.days,
        Route:        newForm.route,
      };
      const stockResult = await preCheckStock(medToCheck);

      await apiFetch(isOutpatient ? "/api/op-prescriptions" : "/api/ip-prescriptions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isOutpatient
          ? { opNo: patientNo, brand: newMed.Brand_Name, generic: newMed.Generic_Name, strength: newMed.Strength, route: newForm.route, frequency: newForm.frequency, days: newForm.days }
          : { ipNo: patientNo, brand: newMed.Brand_Name, generic: newMed.Generic_Name, strength: newMed.Strength, route: newForm.route, frequency: newForm.frequency, days: newForm.days }
        ),
      });

      setShowAddRow(false); setSearchQ(""); setSearchResults([]);
      setNewMed(null); setNewForm({ route: "", frequency: "", days: "" }); setNewErrors({});
      await fetchMeds();

      if (!stockResult.ok) {
        showStockToast({
          brand:     newMed.Brand_Name,
          generic:   newMed.Generic_Name,
          strength:  newMed.Strength,
          available: stockResult.available,
          required:  stockResult.required,
          frequency: newForm.frequency,
          days:      newForm.days,
        });
        const presRes  = await apiFetch(
          isOutpatient
            ? `/api/op-prescriptions/${encodeURIComponent(patientNo)}`
            : `/api/ip-prescriptions/${encodeURIComponent(patientNo)}`
        );
        const presData = await presRes.json();
        const presRow  = (presData.prescriptions || []).find(pr =>
          pr.Brand_Name?.toLowerCase()   === newMed.Brand_Name?.toLowerCase()  &&
          pr.Generic_Name?.toLowerCase() === newMed.Generic_Name?.toLowerCase()
        );
        setOutOfStock(prev =>
          prev.find(o => o.med.Brand_Name?.toLowerCase() === newMed.Brand_Name?.toLowerCase())
            ? prev
            : [...prev, {
                med:          { ...medToCheck, ID: presRow?.ID ?? null },
                alternatives: stockResult.alternatives || [],
                available:    stockResult.available,
                required:     stockResult.required,
              }]
        );
      }
    } catch {}
    finally { setAddSaving(false); }
  };

  const handleCancelAdd = () => {
    setShowAddRow(false); setSearchQ(""); setSearchResults([]);
    setNewMed(null); setNewForm({ route: "", frequency: "", days: "" }); setNewErrors({});
  };

  const handleEdit = (m) => {
    setEditingId(m.ID);
    setEditValues({ brand_name: m.Brand_Name||"", generic_name: m.Generic_Name||"", strength: m.Strength||"", route: m.Route||"", frequency: m.Frequency||"", days: m.Days||"" });
    setOpenMenu(null);
  };

  const handleSaveEdit = async (id) => {
    try {
      await apiFetch(isOutpatient ? "/api/op-prescriptions/update" : "/api/ip-prescriptions/update", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, brand: editValues.brand_name, generic: editValues.generic_name, strength: editValues.strength, route: editValues.route, frequency: editValues.frequency, days: editValues.days }),
      });
      setMedications(m => m.map(x => x.ID === id ? { ...x, Brand_Name: editValues.brand_name, Generic_Name: editValues.generic_name, Strength: editValues.strength, Route: editValues.route, Frequency: editValues.frequency, Days: editValues.days } : x));
    } catch {}
    setEditingId(null); setEditValues({});
  };

  const handleHold = async (id) => {
    const newHeld = !medications.find(x => x.ID === id)?.held;
    setMedications(m => m.map(x => x.ID === id ? { ...x, held: newHeld } : x));
    setOpenMenu(null);
    try {
      await apiFetch(isOutpatient ? "/api/op-prescriptions/hold" : "/api/ip-prescriptions/hold", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, held: newHeld }),
      });
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id) => {
    try {
      await apiFetch(isOutpatient ? "/api/op-prescriptions/delete" : "/api/ip-prescriptions/delete", {
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

  const formatDate = (s) => s
    ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

  const handlePrescriptionPdf = () => {
    setPdfGenerating(true);
    const esc     = (str) => String(str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const date    = new Date().toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
    const now     = new Date().toLocaleString();
    const drName  = user?.name || "Doctor";
    const medRows = medications.filter(m => !m.held).map((m, i) => `
      <tr>
        <td class="tc">${i+1}</td>
        <td><strong>${esc(m.Brand_Name||"")}</strong><br/><span class="generic">${esc(m.Generic_Name||"")}</span></td>
        <td>${esc(m.Strength||"")}</td>
        <td>${esc(m.Route||"")}</td>
        <td>${esc(m.Frequency||"")}</td>
        <td class="tc">${esc(m.Days||"")}</td>
      </tr>`).join("");
    const diagText = [diagnosis.primary, diagnosis.secondary].filter(Boolean).join(", ");
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Prescription</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  body{font-family:"Segoe UI",Arial,sans-serif;font-size:13px;color:#111;background:#fff;padding:36px 40px}
  .letterhead{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #16a34a;padding-bottom:16px;margin-bottom:20px}
  .lh-left{display:flex;flex-direction:column;gap:3px}
  .lh-name{font-size:22px;font-weight:800;color:#16a34a}
  .lh-desig{font-size:13px;font-weight:600;color:#333}
  .lh-dept{font-size:12px;color:#555}
  .lh-right{text-align:right;font-size:11px;color:#555;line-height:1.9}
  .lh-right strong{color:#111}
  .rx-symbol{font-size:48px;font-weight:900;color:#e5f3eb;line-height:1;align-self:center}
  .patient-strip{display:flex;border:1px solid #d1fae5;border-radius:8px;overflow:hidden;margin-bottom:20px;background:#f0fdf4}
  .ps-field{flex:1;padding:8px 14px;border-right:1px solid #d1fae5}
  .ps-field:last-child{border-right:none}
  .ps-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#16a34a;margin-bottom:2px}
  .ps-val{font-size:12px;font-weight:600;color:#111}
  table{width:100%;border-collapse:collapse;margin-bottom:24px}
  thead tr{background:#16a34a}
  thead th{padding:9px 12px;font-size:11px;font-weight:700;color:#fff;text-align:left;text-transform:uppercase}
  tbody tr{border-bottom:1px solid #f0f0f0}
  tbody tr:nth-child(even){background:#f9fefb}
  tbody td{padding:9px 12px;font-size:12px;vertical-align:top}
  .generic{font-size:11px;color:#666;font-style:italic}
  .tc{text-align:center}
  .notes-section{border:1px dashed #86efac;border-radius:6px;padding:10px 14px;margin-bottom:24px;font-size:11.5px;color:#444;line-height:1.6}
  .notes-label{font-size:10px;font-weight:700;color:#16a34a;text-transform:uppercase;margin-bottom:4px}
  .sig-row{display:flex;justify-content:flex-end;margin-top:8px}
  .sig-box{text-align:center}
  .sig-line{width:180px;border-top:1.5px solid #333;margin-bottom:6px}
  .sig-name{font-size:12px;font-weight:700;color:#111}
  .sig-sub{font-size:10px;color:#555}
  .footer{margin-top:28px;padding-top:10px;border-top:1px solid #e0e0e0;display:flex;justify-content:space-between;font-size:10px;color:#999}
  @page{margin:15mm 12mm}
  @media print{body{padding:0}}
</style></head><body>
  <div class="letterhead">
    <div class="lh-left">
      <div class="lh-name">${esc(drName)}</div>
      ${user?.designation ? `<div class="lh-desig">${esc(user.designation)}</div>` : ""}
      ${user?.department  ? `<div class="lh-dept">Dept. of ${esc(user.department)}</div>` : ""}
    </div>
    <div class="rx-symbol">&#8478;</div>
    <div class="lh-right">
      ${user?.licence_no  ? `<div><strong>Licence No.:</strong> ${esc(user.licence_no)}</div>` : ""}
      ${user?.hospital_id ? `<div><strong>Doctor ID:</strong> ${esc(user.hospital_id)}</div>` : ""}
      ${user?.contact_no  ? `<div><strong>Contact:</strong> ${esc(user.contact_no)}</div>` : ""}
      ${user?.email       ? `<div><strong>Email:</strong> ${esc(user.email)}</div>` : ""}
      <div><strong>Date:</strong> ${date}</div>
    </div>
  </div>
  <div class="patient-strip">
    ${p?.Name   ? `<div class="ps-field"><div class="ps-label">Patient Name</div><div class="ps-val">${esc(p.Name)}</div></div>` : ""}
    ${patientNo ? `<div class="ps-field"><div class="ps-label">${isOutpatient?"OP No.":"IP No."}</div><div class="ps-val">${esc(String(patientNo))}</div></div>` : ""}
    ${p?.Age    ? `<div class="ps-field"><div class="ps-label">Age</div><div class="ps-val">${esc(String(p.Age))} yrs</div></div>` : ""}
    ${p?.Sex    ? `<div class="ps-field"><div class="ps-label">Sex</div><div class="ps-val">${p.Sex==="M"?"Male":"Female"}</div></div>` : ""}
    ${diagText  ? `<div class="ps-field" style="flex:2"><div class="ps-label">Diagnosis</div><div class="ps-val">${esc(diagText)}</div></div>` : ""}
  </div>
  <table>
    <thead><tr>
      <th style="width:36px">S.No</th><th>Brand / Generic Name</th>
      <th>Strength</th><th>Route</th><th>Frequency</th>
      <th style="width:50px" class="tc">Days</th>
    </tr></thead>
    <tbody>${medRows || `<tr><td colspan="6" style="text-align:center;color:#aaa;padding:16px">No medications prescribed</td></tr>`}</tbody>
  </table>
  ${diagnosis.notes ? `<div class="notes-section"><div class="notes-label">Clinical Notes</div>${esc(diagnosis.notes)}</div>` : ""}
  <div class="sig-row">
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-name">Dr. ${esc(drName)}</div>
      ${user?.designation ? `<div class="sig-sub">${esc(user.designation)}</div>` : ""}
      ${user?.department  ? `<div class="sig-sub">Dept. of ${esc(user.department)}</div>` : ""}
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
    const doPrint = () => setTimeout(() => { printWin.focus(); printWin.print(); setPdfGenerating(false); }, 400);
    if (printWin.document.readyState === "complete") doPrint();
    else { printWin.onload = doPrint; setTimeout(doPrint, 2000); }
  };

  const handleEPrescribe = () => {
    setEPrescribeSent(true);
    setTimeout(() => setEPrescribeSent(false), 3000);
  };

  const AgentBanner = () => {
    if (agentLoading) return (
      <div className="agent-banner agent-banner-loading">
        <div className="pd-spinner" style={{ width: 16, height: 16, borderWidth: 2, flexShrink: 0 }} />
        Running VabGenRx Safety analysis...
      </div>
    );
    if (agentError) return (
      <div className="agent-banner agent-banner-error">
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <AlertCircle size={14} />Analysis error: {agentError}
        </span>
        <button className="agent-banner-retry" onClick={triggerAnalysis}>
          <RotateCcw size={11} />Retry
        </button>
      </div>
    );
    if (agentResult) return (
      <div className="agent-banner agent-banner-success">
        <CheckCircle2 size={14} />VabGenRx Safety analysis completed
      </div>
    );
    return null;
  };

  return (
    <>
      {stockToast && (
        <div className="stock-toast-fixed">
          <div className="stock-toast-icon"><AlertTriangle size={20} color="#f59e0b" /></div>
          <div className="stock-toast-body">
            <div className="stock-toast-title">
              ⚠ {stockToast.brand} added — but stock is insufficient
            </div>
            <div className="stock-toast-detail">
              Needs <strong>{stockToast.required} units</strong> ({stockToast.frequency} × {stockToast.days}d) · only <strong>{stockToast.available === 0 ? "0 (out of stock)" : `${stockToast.available} available`}</strong>.
              Check the <em>Out-of-Stock Finder</em> below to select a replacement.
            </div>
          </div>
          <button className="stock-toast-close" onClick={() => { clearTimeout(stockToastRef.current); setStockToast(null); }}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className="diag-wrap">
        <div className="diag-card">
          <div className="diag-card-header">
            <span className="diag-card-title">
              <ScanLine size={14} strokeWidth={2.5} />Diagnosis
            </span>
          </div>
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
            <div className="diag-save-row">
              {saveMsg === "success" && <span className="diag-save-msg diag-save-msg-success"><CheckCircle2 size={13} />Saved</span>}
              {saveMsg === "error"   && <span className="diag-save-msg diag-save-msg-error"><AlertCircle size={13} />Failed</span>}
              <button className="diag-save-diagnosis-btn" onClick={handleSaveDiagnosis} disabled={saving || diagLoading}>
                <Save size={13} />{saving ? "Saving..." : "Save Diagnosis"}
              </button>
            </div>
          </div>
        </div>

        <div className="diag-grid-2">
          <MedicationList
            medications={medications} medLoading={medLoading}
            showAddRow={showAddRow} setShowAddRow={setShowAddRow}
            searchQ={searchQ} searchResults={searchResults} searching={searching}
            newMed={newMed} newForm={newForm} setNewForm={setNewForm}
            newErrors={newErrors} setNewErrors={setNewErrors} addSaving={addSaving}
            editingId={editingId} editValues={editValues} setEditValues={setEditValues}
            openMenu={openMenu} menuPos={menuPos} dropdownPos={dropdownPos}
            agentLoading={agentLoading} agentResult={agentResult} wasInterrupted={wasInterrupted}
            handleSearch={handleSearch} handleSelectDrug={handleSelectDrug}
            handleAutoSave={handleAutoSave} handleCancelAdd={handleCancelAdd}
            handleEdit={handleEdit} handleSaveEdit={handleSaveEdit}
            handleHold={handleHold} handleDelete={handleDelete}
            handleMenuOpen={handleMenuOpen} updateDropdownPos={updateDropdownPos}
            triggerAnalysis={triggerAnalysis} onInterrupt={onInterrupt}
            searchInputRef={searchInputRef}
          />
          <PrescriberNotes
            prescriberNotes={prescriberNotes} noteText={noteText}
            setNoteText={setNoteText} noteSaving={noteSaving} noteMsg={noteMsg}
            editingNoteId={editingNoteId} editNoteText={editNoteText}
            setEditNoteText={setEditNoteText} handleSaveNote={handleSaveNote}
            handleSaveNoteEdit={handleSaveNoteEdit} handleDeleteNote={handleDeleteNote}
            setEditingNoteId={setEditingNoteId} formatDate={formatDate}
          />
        </div>

        <AgentBanner />

        <div className="diag-grid-2">
          <DrugInteractionWarning
            agentResult={agentResult} agentLoading={loadingState.interactions}
            agentError={agentError} intTab={intTab} setIntTab={setIntTab}
            ddSevTab={ddSevTab} setDdSevTab={setDdSevTab}
            ddisTab={ddisTab} setDdisTab={setDdisTab}
          />
          <DosingRecommendation
            agentResult={agentResult} agentLoading={loadingState.dosing}
            doseTab={doseTab} setDoseTab={setDoseTab}
          />
        </div>

        <OutOfStockFinder outOfStock={outOfStock} setOutOfStock={setOutOfStock} handleSwitch={handleSwitch} />

        <PatientCounselling
          agentResult={agentResult} agentLoading={loadingState.counselling}
          counselTab={counselTab} setCounselTab={setCounselTab}
          p={p} onPrescribe={() => setShowPrescribe(true)}
          prescribeDisabled={medications.length === 0}
        />

        {showPrescribe && (
          <div className="presc-overlay" onClick={() => setShowPrescribe(false)}>
            <div className="presc-modal" onClick={e => e.stopPropagation()}>
              <div className="presc-header">
                <div className="presc-title"><ClipboardList size={14} />Prescription</div>
                <button className="presc-close" onClick={() => setShowPrescribe(false)}><X size={14} /></button>
              </div>
              <div className="presc-letterhead">
                <div className="presc-lh-left">
                  <div className="presc-dr-name">{user?.name || "Doctor"}</div>
                  {user?.designation && <div className="presc-dr-desig">{user.designation}</div>}
                  {user?.department  && <div className="presc-dr-dept">Dept. of {user.department}</div>}
                </div>
                <div className="presc-rx">&#8478;</div>
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
                    {medications.filter(m => !m.held).length === 0
                      ? <tr><td colSpan={7} className="presc-empty">No active medications.</td></tr>
                      : medications.filter(m => !m.held).map((m, i) => (
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
                  {medications.filter(m => !m.held).length} medication{medications.filter(m => !m.held).length !== 1 ? "s" : ""}
                  {medications.some(m => m.held) ? ` · ${medications.filter(m => m.held).length} on hold` : ""}
                  {" · "}{new Date().toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
                </span>
                <div className="presc-footer-btns">
                  <button className="presc-btn-pdf" onClick={handlePrescriptionPdf} disabled={pdfGenerating}>
                    <FileDown size={13} />{pdfGenerating ? "Generating..." : "Save as PDF"}
                  </button>
                  <button className="presc-btn-eprescribe" onClick={handleEPrescribe}>
                    <Zap size={13} />E-Prescribe
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {ePrescribeSent && (
          <div className="presc-toast">
            <CheckCircle2 size={14} />E-Prescription sent successfully!
          </div>
        )}

        <div className="diag-disclaimer">
          VabGen Rx is AI-powered to assist your clinical decisions, please verify before proceeding
        </div>
      </div>
    </>
  );
};

export default DiagnosisTab;