import { useState, useEffect, useRef } from "react";
import "./OfflinePage.css";
import vabgenLogo from "../assets/vabgen_logo.png";

const OFFLINE_API = "http://localhost:8000";

const extractDrugNames = (pairs) => {
  const drugs = new Set();
  pairs.forEach(pair => {
    pair.split("+").forEach(d => {
      const clean = d.trim().replace(/\b(ckd|egfr|hyperkalemia|hypotension|alcohol|diabetes|nsaids)\b/gi,"").trim();
      if (clean.length > 2) drugs.add(clean.charAt(0).toUpperCase() + clean.slice(1));
    });
  });
  return [...drugs].sort();
};

// ── Severity helpers ──────────────────────────────────────────────────────────
const sev = {
  bg:     s => ({MAJOR:"#fef2f2",MODERATE:"#fffbeb",MINOR:"#f0fdf4",UNKNOWN:"#f9fafb",CONTRAINDICATED:"#fef2f2"}[s]||"#f9fafb"),
  color:  s => ({MAJOR:"#dc2626",MODERATE:"#d97706",MINOR:"#16a34a",UNKNOWN:"#6b7280",CONTRAINDICATED:"#dc2626"}[s]||"#6b7280"),
  border: s => ({MAJOR:"#fca5a5",MODERATE:"#fcd34d",MINOR:"#86efac",UNKNOWN:"#d1d5db",CONTRAINDICATED:"#fca5a5"}[s]||"#d1d5db"),
  label:  s => ({MAJOR:"⛔ MAJOR",MODERATE:"⚠️ MODERATE",MINOR:"✅ MINOR",UNKNOWN:"❓ UNKNOWN",CONTRAINDICATED:"🚫 CONTRAINDICATED"}[s]||s),
};

const Badge = ({ s }) => (
  <span style={{background:sev.bg(s),color:sev.color(s),border:`1.5px solid ${sev.border(s)}`,
    borderRadius:6,padding:"3px 10px",fontSize:"0.75rem",fontWeight:700,whiteSpace:"nowrap"}}>
    {sev.label(s)}
  </span>
);

const TabBtn = ({ active, onClick, children, count }) => (
  <button onClick={onClick} className={`op-tab-btn ${active ? "op-tab-btn-active" : ""}`}>
    {children}
    {count > 0 && <span className={`op-tab-count ${active ? "op-tab-count-active" : ""}`}>{count}</span>}
  </button>
);

const SubTab = ({ active, onClick, children, count }) => (
  <button onClick={onClick} className={`op-subtab ${active ? "op-subtab-active" : ""}`}>
    {children}
    {count !== undefined && <span className={`op-subtab-count ${active ? "op-subtab-count-active" : ""}`}>{count}</span>}
  </button>
);

export default function OfflinePage() {
  // ── Patient info ──────────────────────────────────────────────────────────
  const [age,          setAge]          = useState("");
  const [sex,          setSex]          = useState("unknown");
  const [egfr,         setEgfr]         = useState("");
  const [potassium,    setPotassium]    = useState("");
  const [conditions,   setConditions]   = useState("");
  const [existingMeds, setExistingMeds] = useState("");

  // ── Drug check ────────────────────────────────────────────────────────────
  const [newDrug,      setNewDrug]      = useState("");
  const [suggestions,  setSuggestions]  = useState([]);
  const [showSuggest,  setShowSuggest]  = useState(false);
  const [allDrugNames, setAllDrugNames] = useState([]);

  // ── Analysis ──────────────────────────────────────────────────────────────
  const [analyzing,    setAnalyzing]    = useState(false);
  const [result,       setResult]       = useState(null);
  const [analyzeErr,   setAnalyzeErr]   = useState("");

  // ── Translation ───────────────────────────────────────────────────────────
  const [language,     setLanguage]     = useState("");
  const [translating,  setTranslating]  = useState(false);
  const [translatedCounselling, setTranslatedCounselling] = useState(null);

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const [activeTab,    setActiveTab]    = useState("drug-drug");
  const [ddSubTab,     setDdSubTab]     = useState("MAJOR");
  const [ddisSubTab,   setDdisSubTab]   = useState("CONTRAINDICATED");
  const [doseSubTab,   setDoseSubTab]   = useState("HIGH");

  const drugInputRef = useRef(null);
  const suggestRef   = useRef(null);

  // ── Load drug names for autocomplete ─────────────────────────────────────
  useEffect(() => {
    fetch(`${OFFLINE_API}/offline/drug-pairs`)
      .then(r => r.json())
      .then(d => setAllDrugNames(extractDrugNames(d.drug_pairs || [])))
      .catch(() => setAllDrugNames([
        "Warfarin","Amiodarone","Spironolactone","Metformin",
        "Lisinopril","Tramadol","Phenytoin","Fluoxetine",
        "Atorvastatin","Furosemide","Amlodipine","Digoxin"
      ]));
  }, []);

  // ── Close suggestions on outside click ───────────────────────────────────
  useEffect(() => {
    const h = e => {
      if (suggestRef.current && !suggestRef.current.contains(e.target) &&
          drugInputRef.current && !drugInputRef.current.contains(e.target))
        setShowSuggest(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const handleDrugInput = val => {
    setNewDrug(val); setResult(null); setTranslatedCounselling(null);
    if (val.trim().length < 2) { setSuggestions([]); setShowSuggest(false); return; }
    const f = allDrugNames.filter(d => d.toLowerCase().includes(val.toLowerCase().trim()));
    setSuggestions(f.slice(0,6)); setShowSuggest(f.length > 0);
  };

  const selectDrug = drug => {
    setNewDrug(drug); setSuggestions([]); setShowSuggest(false);
    drugInputRef.current?.focus();
  };

  // ── Parse existing meds from text input ──────────────────────────────────
  const parseMeds = () =>
    existingMeds.split(/[,\n]+/).map(m => m.trim()).filter(Boolean);

  // ── Run analysis ──────────────────────────────────────────────────────────
  const runAnalysis = async () => {
    if (!newDrug.trim()) return;
    const meds = parseMeds();
    if (meds.length === 0) {
      setAnalyzeErr("Please enter at least one existing medication.");
      return;
    }
    setAnalyzing(true); setAnalyzeErr(""); setResult(null);
    setTranslatedCounselling(null); setActiveTab("drug-drug");
    try {
      const res  = await fetch(`${OFFLINE_API}/offline/analyze`, {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
          new_drug:      newDrug.trim(),
          existing_meds: meds,
          age:           parseInt(age) || 45,
          sex:           sex,
          egfr:          egfr ? parseFloat(egfr) : null,
          potassium:     potassium ? parseFloat(potassium) : null,
          conditions:    conditions.split(/[,\n]+/).map(c => c.trim()).filter(Boolean),
          language:      "",
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch { setAnalyzeErr("Analysis failed. Is the offline server running?"); }
    finally { setAnalyzing(false); }
  };

  // ── Translate counselling ─────────────────────────────────────────────────
  const runTranslation = async () => {
    if (!language || !result) return;
    setTranslating(true);
    try {
      const res = await fetch(`${OFFLINE_API}/offline/translate-counselling`, {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ counselling: result.counselling, language }),
      });
      const data = await res.json();
      if (data.translated_counselling?.length > 0)
        setTranslatedCounselling(data.translated_counselling);
    } catch (e) { console.error("Translation failed", e); }
    finally { setTranslating(false); }
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const dd          = result?.drug_drug    || [];
  const ddis        = result?.drug_disease || [];
  const df          = result?.drug_food    || [];
  const dosing      = result?.dosing       || [];
  const counselling = result?.counselling  || [];
  const rs          = result?.risk_summary || {};

  const ddMajor    = dd.filter(r => r.severity === "MAJOR");
  const ddModerate = dd.filter(r => r.severity === "MODERATE");
  const ddMinor    = dd.filter(r => !["MAJOR","MODERATE"].includes(r.severity) && r.severity !== "unknown");
  const ddisContra = ddis.filter(r => r.contraindicated);
  const ddisMod    = ddis.filter(r => !r.contraindicated && r.severity === "MODERATE");
  const ddisMinor  = ddis.filter(r => !r.contraindicated && r.severity !== "MODERATE");
  const dosingHigh = dosing.filter(r => r.priority === "HIGH");
  const dosingMed  = dosing.filter(r => r.priority !== "HIGH");

  const riskBg     = l => ({HIGH:"#fef2f2",MODERATE:"#fffbeb",LOW:"#f0fdf4"}[l]||"#f9fafb");
  const riskColor  = l => ({HIGH:"#dc2626",MODERATE:"#d97706",LOW:"#16a34a"}[l]||"#6b7280");
  const riskBorder = l => ({HIGH:"#fca5a5",MODERATE:"#fcd34d",LOW:"#86efac"}[l]||"#d1d5db");
  const riskLabel  = l => ({HIGH:"⛔ HIGH RISK — Do not prescribe without review",MODERATE:"⚠️ MODERATE RISK — Proceed with caution",LOW:"✅ LOW RISK — Safe to prescribe"}[l]||l);

  return (
    <div className="op-root">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="op-header">
        <div className="op-header-left">
          <img src={vabgenLogo} alt="VabGenRx" className="op-logo-img" />
          <span className="op-logo-text">VabGen<span>Rx</span></span>
          <div className="op-header-divider" />
          <div className="op-header-title">Clinical Drug Safety</div>
        </div>
        <div className="op-right-head">
          <a href="/admin" className="op-admin-link">📚 Knowledge Base</a>
          <div className="op-offline-badge"><span className="op-offline-dot" />OFFLINE MODE</div>
        </div>
      </div>

      <div className="op-body">

        {/* ── Patient Info ───────────────────────────────────────────────── */}
        <div className="op-card">
          <div className="op-card-title">Patient Information</div>

          <div className="op-patient-form">
            {/* Row 1 — Age + Sex */}
            <div className="op-form-row">
              <div className="op-form-field">
                <label className="op-form-label">Age</label>
                <input className="op-input-sm" type="number" placeholder="e.g. 65"
                  value={age} onChange={e => setAge(e.target.value)} />
              </div>
              <div className="op-form-field">
                <label className="op-form-label">Sex</label>
                <select className="op-input-sm" value={sex} onChange={e => setSex(e.target.value)}>
                  <option value="unknown">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
              <div className="op-form-field">
                <label className="op-form-label">eGFR <span className="op-form-unit">(mL/min)</span></label>
                <input className="op-input-sm" type="number" placeholder="e.g. 45"
                  value={egfr} onChange={e => setEgfr(e.target.value)} />
              </div>
              <div className="op-form-field">
                <label className="op-form-label">Potassium <span className="op-form-unit">(mEq/L)</span></label>
                <input className="op-input-sm" type="number" step="0.1" placeholder="e.g. 4.5"
                  value={potassium} onChange={e => setPotassium(e.target.value)} />
              </div>
            </div>

            {/* Row 2 — Conditions */}
            <div className="op-form-field op-form-full">
              <label className="op-form-label">Conditions <span className="op-form-unit">(comma separated)</span></label>
              <input className="op-input" placeholder="e.g. CKD Stage 3, Type 2 Diabetes, Hypertension"
                value={conditions} onChange={e => setConditions(e.target.value)} />
            </div>

            {/* Row 3 — Existing Medications */}
            <div className="op-form-field op-form-full">
              <label className="op-form-label">Existing Medications <span className="op-form-unit">(comma separated)</span></label>
              <textarea className="op-textarea" rows={3}
                placeholder="e.g. Warfarin, Metformin, Lisinopril, Furosemide"
                value={existingMeds} onChange={e => setExistingMeds(e.target.value)} />
              {parseMeds().length > 0 && (
                <div className="op-med-chips">
                  {parseMeds().map((m,i) => (
                    <span key={i} className="op-med-chip">💊 {m}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── New Drug Check ─────────────────────────────────────────────── */}
        <div className="op-card">
          <div className="op-card-title">New Drug to Prescribe</div>
          <div className="op-drug-wrap">
            <div className="op-row">
              <div className="op-suggest-wrap">
                <input ref={drugInputRef} className="op-input"
                  placeholder="Type drug name (e.g. Spironolactone, Tramadol, Amiodarone)"
                  value={newDrug} onChange={e => handleDrugInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !showSuggest) runAnalysis();
                    if (e.key === "Escape") setShowSuggest(false);
                  }}
                  onFocus={() => newDrug.length >= 2 && suggestions.length > 0 && setShowSuggest(true)}
                  autoFocus />
                {showSuggest && suggestions.length > 0 && (
                  <div className="op-suggestions" ref={suggestRef}>
                    {suggestions.map((drug,i) => (
                      <div key={i} className="op-suggestion-item" onMouseDown={() => selectDrug(drug)}>
                        <span className="op-suggest-icon">💊</span>
                        <span className="op-suggest-name">{drug}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button className="op-btn-check" onClick={runAnalysis}
                disabled={analyzing || !newDrug.trim() || parseMeds().length === 0}>
                {analyzing ? <><span className="op-spinner" /> Analyzing...</> : "Run Analysis"}
              </button>
            </div>
            {allDrugNames.length > 0 && (
              <div className="op-db-note">💡 {allDrugNames.length} drugs in local knowledge base</div>
            )}
            {parseMeds().length === 0 && newDrug.trim() && (
              <div className="op-warn-note">⚠️ Please enter existing medications above before running analysis</div>
            )}
          </div>
          {analyzeErr && <div className="op-error">{analyzeErr}</div>}
          {analyzing && (
            <div className="op-analyzing">
              <div className="op-analyzing-spinner" />
              <div>
                <div className="op-analyzing-title">Running VabGen Rx Safety Analysis...</div>
                <div className="op-analyzing-sub">Drug-Drug · Drug-Disease · Drug-Food · Dosing · Counselling · No internet</div>
              </div>
            </div>
          )}
        </div>

        {/* ── Results ────────────────────────────────────────────────────── */}
        {result && (
          <div className="op-card op-result-card" style={{borderColor: riskBorder(rs.level)}}>

            {/* Risk header */}
            <div className="op-risk-header" style={{background: riskBg(rs.level), borderColor: riskBorder(rs.level)}}>
              <div className="op-risk-level" style={{color: riskColor(rs.level)}}>{riskLabel(rs.level)}</div>
              <div className="op-risk-badges">
                {rs.severe_ddi_count > 0  && <span className="op-risk-badge op-badge-red">{rs.severe_ddi_count} MAJOR DDI</span>}
                {rs.contraindicated > 0   && <span className="op-risk-badge op-badge-red">{rs.contraindicated} Contraindicated</span>}
                {rs.moderate_ddi_count > 0 && <span className="op-risk-badge op-badge-yellow">{rs.moderate_ddi_count} Moderate</span>}
                {rs.dosing_alerts > 0     && <span className="op-risk-badge op-badge-orange">{rs.dosing_alerts} Dosing Alerts</span>}
              </div>
            </div>

            {/* Tabs */}
            <div className="op-tabs">
              <TabBtn active={activeTab==="drug-drug"}    onClick={()=>setActiveTab("drug-drug")}    count={dd.filter(r=>r.severity!=="unknown").length}>Drug–Drug</TabBtn>
              <TabBtn active={activeTab==="drug-disease"} onClick={()=>setActiveTab("drug-disease")} count={ddis.length}>Drug–Disease</TabBtn>
              <TabBtn active={activeTab==="drug-food"}    onClick={()=>setActiveTab("drug-food")}    count={df.length}>Drug–Food</TabBtn>
              <TabBtn active={activeTab==="dosing"}       onClick={()=>setActiveTab("dosing")}       count={dosing.length}>Dosing</TabBtn>
              <TabBtn active={activeTab==="counselling"}  onClick={()=>setActiveTab("counselling")}  count={counselling.length}>Counselling</TabBtn>
            </div>

            <div className="op-tab-content">

              {/* ── Drug-Drug ── */}
              {activeTab === "drug-drug" && (
                <div>
                  <div className="op-subtabs">
                    <SubTab active={ddSubTab==="MAJOR"}    onClick={()=>setDdSubTab("MAJOR")}    count={ddMajor.length}>Severe</SubTab>
                    <SubTab active={ddSubTab==="MODERATE"} onClick={()=>setDdSubTab("MODERATE")} count={ddModerate.length}>Moderate</SubTab>
                    <SubTab active={ddSubTab==="MINOR"}    onClick={()=>setDdSubTab("MINOR")}    count={ddMinor.length}>Minor</SubTab>
                  </div>
                  {(ddSubTab==="MAJOR"?ddMajor:ddSubTab==="MODERATE"?ddModerate:ddMinor).map((ddi,i) => (
                    <div key={i} className="op-interaction-card">
                      <div className="op-int-header">
                        <span className="op-int-pair">{ddi.drug1} + {ddi.drug2}</span>
                        <Badge s={ddi.severity} />
                      </div>
                      <div className="op-int-row"><span className="op-int-label">Mechanism</span><span>{ddi.mechanism}</span></div>
                      <div className="op-int-row"><span className="op-int-label">Clinical Effects</span><span>{ddi.clinical_effects}</span></div>
                      <div className="op-int-rec">💡 {ddi.recommendation}</div>
                    </div>
                  ))}
                  {(ddSubTab==="MAJOR"?ddMajor:ddSubTab==="MODERATE"?ddModerate:ddMinor).length === 0 &&
                    <div className="op-empty-tab">No {ddSubTab.toLowerCase()} interactions found</div>}
                </div>
              )}

              {/* ── Drug-Disease ── */}
              {activeTab === "drug-disease" && (
                <div>
                  <div className="op-subtabs">
                    <SubTab active={ddisSubTab==="CONTRAINDICATED"} onClick={()=>setDdisSubTab("CONTRAINDICATED")} count={ddisContra.length}>Contraindicated</SubTab>
                    <SubTab active={ddisSubTab==="MODERATE"}        onClick={()=>setDdisSubTab("MODERATE")}        count={ddisMod.length}>Moderate</SubTab>
                    <SubTab active={ddisSubTab==="MINOR"}           onClick={()=>setDdisSubTab("MINOR")}           count={ddisMinor.length}>Minor</SubTab>
                  </div>
                  {(ddisSubTab==="CONTRAINDICATED"?ddisContra:ddisSubTab==="MODERATE"?ddisMod:ddisMinor).map((item,i) => (
                    <div key={i} className="op-interaction-card">
                      <div className="op-int-header">
                        <span className="op-int-pair">{item.drug} + {item.condition}</span>
                        <Badge s={item.contraindicated?"CONTRAINDICATED":item.severity} />
                      </div>
                      <div className="op-int-row"><span className="op-int-label">Reason</span><span>{item.reason}</span></div>
                      <div className="op-int-rec">💡 {item.recommendation}</div>
                      {item.alternatives?.length > 0 && (
                        <div className="op-alternatives">
                          <span className="op-alt-label">Alternatives: </span>
                          {item.alternatives.map((a,j) => <span key={j} className="op-alt-chip">{a}</span>)}
                        </div>
                      )}
                    </div>
                  ))}
                  {ddis.length === 0 && <div className="op-empty-tab">No drug-disease interactions found</div>}
                </div>
              )}

              {/* ── Drug-Food ── */}
              {activeTab === "drug-food" && (
                <div>
                  {df.map((item,i) => (
                    <div key={i} className="op-interaction-card">
                      <div className="op-int-header">
                        <span className="op-int-pair">{item.drug} + {item.food}</span>
                        <Badge s={item.severity} />
                      </div>
                      <div className="op-int-row"><span className="op-int-label">Effect</span><span>{item.effect}</span></div>
                      <div className="op-int-rec">💡 {item.recommendation}</div>
                    </div>
                  ))}
                  {df.length === 0 && <div className="op-empty-tab">No drug-food interactions found</div>}
                </div>
              )}

              {/* ── Dosing ── */}
              {activeTab === "dosing" && (
                <div>
                  <div className="op-subtabs">
                    <SubTab active={doseSubTab==="HIGH"}   onClick={()=>setDoseSubTab("HIGH")}   count={dosingHigh.length}>High Priority</SubTab>
                    <SubTab active={doseSubTab==="MEDIUM"} onClick={()=>setDoseSubTab("MEDIUM")} count={dosingMed.length}>Medium</SubTab>
                  </div>
                  {(doseSubTab==="HIGH"?dosingHigh:dosingMed).map((item,i) => (
                    <div key={i} className="op-dose-card">
                      <div className="op-dose-header">
                        <span className="op-dose-drug">{item.drug}</span>
                        <span className="op-dose-type">{item.adjustment_type?.replace(/_/g," ")}</span>
                      </div>
                      <div className="op-dose-row">
                        <div className="op-dose-col">
                          <div className="op-dose-col-label">Current Typical Dose</div>
                          <div className="op-dose-col-val">{item.current_typical_dose}</div>
                        </div>
                        <div className="op-dose-arrow">→</div>
                        <div className="op-dose-col">
                          <div className="op-dose-col-label">Recommended for This Patient</div>
                          <div className="op-dose-col-val op-dose-rec">{item.recommended_dose}</div>
                        </div>
                      </div>
                      <div className="op-int-row"><span className="op-int-label">Reason</span><span>{item.reason}</span></div>
                      {item.monitoring && <div className="op-int-row"><span className="op-int-label">Monitor</span><span>{item.monitoring}</span></div>}
                      {item.hold_if && <div className="op-hold-if">🛑 Hold if: {item.hold_if}</div>}
                      {item.lab_values && (
                        <div className="op-lab-chips">
                          {item.lab_values.egfr     && <span className="op-lab-chip">eGFR: {item.lab_values.egfr}</span>}
                          {item.lab_values.potassium && <span className="op-lab-chip">K+: {item.lab_values.potassium}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                  {dosing.length === 0 && <div className="op-empty-tab">No dosing adjustments required</div>}
                </div>
              )}

              {/* ── Counselling ── */}
              {activeTab === "counselling" && (
                <div>
                  <div className="op-counsel-toolbar">
                    <div className="op-counsel-toolbar-label">
                      👨‍⚕️ Review counselling points below, then translate for the patient
                    </div>
                    <div className="op-counsel-translate-row">
                      <span className="op-lang-label">🌐 Patient language:</span>
                      <select className="op-lang-select" value={language} onChange={e => { setLanguage(e.target.value); setTranslatedCounselling(null); }}>
                        <option value="">English (Default)</option>
                        <optgroup label="South Asia">
                          <option value="Hindi">Hindi — हिंदी</option>
                          <option value="Bengali">Bengali — বাংলা</option>
                          <option value="Tamil">Tamil — தமிழ்</option>
                          <option value="Telugu">Telugu — తెలుగు</option>
                          <option value="Marathi">Marathi — मराठी</option>
                          <option value="Gujarati">Gujarati — ગુજરાતી</option>
                          <option value="Kannada">Kannada — ಕನ್ನಡ</option>
                          <option value="Malayalam">Malayalam — മലയാളം</option>
                          <option value="Punjabi">Punjabi — ਪੰਜਾਬੀ</option>
                          <option value="Urdu">Urdu — اردو</option>
                          <option value="Nepali">Nepali — नेपाली</option>
                          <option value="Sinhala">Sinhala — සිංහල</option>
                          <option value="Odia">Odia — ଓଡ଼ିଆ</option>
                        </optgroup>
                        <optgroup label="East & Southeast Asia">
                          <option value="Chinese Simplified">Chinese — 中文 (简体)</option>
                          <option value="Chinese Traditional">Chinese — 中文 (繁體)</option>
                          <option value="Japanese">Japanese — 日本語</option>
                          <option value="Korean">Korean — 한국어</option>
                          <option value="Thai">Thai — ภาษาไทย</option>
                          <option value="Vietnamese">Vietnamese — Tiếng Việt</option>
                          <option value="Indonesian">Indonesian — Bahasa Indonesia</option>
                          <option value="Malay">Malay — Bahasa Melayu</option>
                          <option value="Burmese">Burmese — မြန်မာဘာသာ</option>
                          <option value="Khmer">Khmer — ភាសាខ្មែរ</option>
                          <option value="Lao">Lao — ພາສາລາວ</option>
                          <option value="Tagalog">Tagalog — Filipino</option>
                        </optgroup>
                        <optgroup label="Middle East & Central Asia">
                          <option value="Arabic">Arabic — العربية</option>
                          <option value="Persian">Persian — فارسی</option>
                          <option value="Turkish">Turkish — Türkçe</option>
                          <option value="Hebrew">Hebrew — עברית</option>
                          <option value="Pashto">Pashto — پښتو</option>
                          <option value="Kazakh">Kazakh — Қазақша</option>
                          <option value="Uzbek">Uzbek — Oʻzbek</option>
                        </optgroup>
                        <optgroup label="Africa">
                          <option value="Swahili">Swahili — Kiswahili</option>
                          <option value="Amharic">Amharic — አማርኛ</option>
                          <option value="Hausa">Hausa</option>
                          <option value="Yoruba">Yoruba</option>
                          <option value="Igbo">Igbo</option>
                          <option value="Zulu">Zulu — isiZulu</option>
                          <option value="Xhosa">Xhosa — isiXhosa</option>
                          <option value="Afrikaans">Afrikaans</option>
                          <option value="Somali">Somali — Soomaali</option>
                          <option value="Tigrinya">Tigrinya — ትግርኛ</option>
                        </optgroup>
                        <optgroup label="Europe">
                          <option value="Spanish">Spanish — Español</option>
                          <option value="French">French — Français</option>
                          <option value="Portuguese">Portuguese — Português</option>
                          <option value="German">German — Deutsch</option>
                          <option value="Italian">Italian — Italiano</option>
                          <option value="Russian">Russian — Русский</option>
                          <option value="Polish">Polish — Polski</option>
                          <option value="Dutch">Dutch — Nederlands</option>
                          <option value="Romanian">Romanian — Română</option>
                          <option value="Greek">Greek — Ελληνικά</option>
                          <option value="Ukrainian">Ukrainian — Українська</option>
                          <option value="Czech">Czech — Čeština</option>
                          <option value="Hungarian">Hungarian — Magyar</option>
                        </optgroup>
                        <optgroup label="Americas">
                          <option value="Brazilian Portuguese">Brazilian Portuguese — Português (BR)</option>
                          <option value="Haitian Creole">Haitian Creole — Kreyòl</option>
                          <option value="Quechua">Quechua</option>
                          <option value="Guarani">Guarani</option>
                        </optgroup>
                      </select>
                      <button className="op-btn-translate" onClick={runTranslation}
                        disabled={!language || translating}>
                        {translating ? <><span className="op-spinner" /> Translating...</> : "🌐 Translate"}
                      </button>
                    </div>
                  </div>

                  {translatedCounselling && (
                    <div className="op-lang-active">
                      🌐 Patient counselling translated to <strong>{language}</strong> — drug names kept in English
                    </div>
                  )}

                  {(translatedCounselling || counselling).length === 0
                    ? <div className="op-empty-tab">No counselling points generated</div>
                    : [...new Set((translatedCounselling || counselling).map(c => c.drug))].map(drug => (
                      <div key={drug} className="op-counsel-group">
                        <div className="op-counsel-drug-name">💊 {drug}</div>
                        {(translatedCounselling || counselling).filter(c => c.drug === drug).map((item,i) => (
                          <div key={i} className="op-counsel-item">
                            <div className="op-counsel-header">
                              <span className="op-counsel-icon">
                                {item.category==="WARNINGS"?"⚠️":item.category==="SIDE_EFFECTS"?"🔴":item.category==="TIMING"?"🕐":item.category==="LIFESTYLE"?"🌿":"📋"}
                              </span>
                              <span className="op-counsel-title">{item.title}</span>
                            </div>
                            <div className="op-counsel-instruction">{item.instruction}</div>
                          </div>
                        ))}
                      </div>
                    ))
                  }
                </div>
              )}

            </div>
          </div>
        )}

      </div>
    </div>
  );
}