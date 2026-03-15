import { useState, useEffect, useRef, useCallback } from "react";
import { Stethoscope, Pill, Activity, Globe, Eye, FileDown, X, Droplets, Microscope, Clock, Bean, Heart, AlertTriangle, XCircle, RotateCcw, ClipboardList, Dumbbell, Utensils, Leaf, ShieldAlert, FileText } from "lucide-react";
import "./styles/patientCounselling.css";
import { apiFetch } from "../services/api";

const LANGUAGES = [
  "English","Hindi","Tamil","Telugu","Kannada","Malayalam","Marathi","Bengali",
  "Gujarati","Punjabi","Urdu","Mandarin","Spanish","French","Arabic","Portuguese",
  "Russian","Japanese","Korean","German","Italian","Turkish","Vietnamese","Thai",
  "Indonesian","Malay","Swahili","Dutch","Polish","Ukrainian",
];

const PatientCounselling = ({ agentResult, agentLoading, counselTab, setCounselTab, p, onPrescribe, prescribeDisabled }) => {
  const drugCounseling      = agentResult?.drug_counseling      || [];
  const conditionCounseling = agentResult?.condition_counseling || [];
  const isOutpatient = !!p?.OP_No;
  const patientNo    = p?.OP_No || p?.IP_No;

  const [denied,        setDenied]        = useState({});
  const [showPreview,   setShowPreview]   = useState(false);
  const [langSearch,    setLangSearch]    = useState("");
  const [selectedLang,  setSelectedLang]  = useState("English");
  const [showLangDrop,  setShowLangDrop]  = useState(false);
  const [translated,    setTranslated]    = useState(null);
  const [translating,   setTranslating]   = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);

  const langRef    = useRef(null);
  const saveTimRef = useRef(null);

  useEffect(() => { setDenied({}); setTranslated(null); setSelectedLang("English"); }, [agentResult]);

  useEffect(() => {
    const fn = (e) => { if (langRef.current && !langRef.current.contains(e.target)) setShowLangDrop(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const saveCounsellingToDB = useCallback((nextDenied) => {
    clearTimeout(saveTimRef.current);
    saveTimRef.current = setTimeout(async () => {
      try {
        const drug_counselling = drugCounseling.map((drug, di) => ({
          ...drug,
          counseling_points: (drug.counseling_points || []).filter((_, pi) => !nextDenied[`drug-${di}-${pi}`]),
        })).filter(d => d.counseling_points.length > 0);

        const condition_counselling = conditionCounseling.map((cond, ci) => ({
          ...cond,
          exercise:  (cond.exercise  || []).filter((_, i) => !nextDenied[`cond-${ci}-ex-${i}`]),
          diet:      (cond.diet      || []).filter((_, i) => !nextDenied[`cond-${ci}-diet-${i}`]),
          lifestyle: (cond.lifestyle || []).filter((_, i) => !nextDenied[`cond-${ci}-ls-${i}`]),
          safety:    (cond.safety    || []).filter((_, i) => !nextDenied[`cond-${ci}-sf-${i}`]),
        })).filter(c => c.exercise.length || c.diet.length || c.lifestyle.length || c.safety.length);

        const ep = isOutpatient ? "/api/op-patient-counselling" : "/api/ip-patient-counselling";
        await apiFetch(ep, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(isOutpatient ? { op_no: patientNo } : { ip_no: patientNo }),
            drug_counselling,
            condition_counselling,
          }),
        });
      } catch (err) { console.error("Failed to save counselling:", err); }
    }, 400);
  }, [drugCounseling, conditionCounseling, isOutpatient, patientNo]);

  const handleDeny     = (key) => { const n = { ...denied, [key]: true };  setDenied(n); saveCounsellingToDB(n); };
  const handleRetrieve = (key) => { const n = { ...denied }; delete n[key]; setDenied(n); saveCounsellingToDB(n); };

  const totalPoints =
    drugCounseling.reduce((acc, d) => acc + (d.counseling_points?.length || 0), 0) +
    conditionCounseling.reduce((acc, c) => acc + (c.exercise?.length||0) + (c.diet?.length||0) + (c.lifestyle?.length||0) + (c.safety?.length||0), 0);

  const iconForCategory = (cat) => {
    const map = {
      bleeding:   <Droplets size={14} />,
      monitoring: <Microscope size={14} />,
      timing:     <Clock size={14} />,
      renal:      <Bean size={14} />,
      cardiac:    <Heart size={14} />,
    };
    return map[cat] || <AlertTriangle size={14} />;
  };

  const approvedDrugData = drugCounseling.map((drug, di) => ({
    drug:            drug.drug,
    points:          (drug.counseling_points || []).filter((_, pi) => !denied[`drug-${di}-${pi}`]),
    key_monitoring:  drug.key_monitoring  || "",
    patient_summary: drug.patient_summary || "",
  })).filter(d => d.points.length > 0);

  const approvedCondData = conditionCounseling.map((cond, ci) => ({
    condition: cond.condition,
    exercise:  (cond.exercise  || []).filter((_, i) => !denied[`cond-${ci}-ex-${i}`]),
    diet:      (cond.diet      || []).filter((_, i) => !denied[`cond-${ci}-diet-${i}`]),
    lifestyle: (cond.lifestyle || []).filter((_, i) => !denied[`cond-${ci}-ls-${i}`]),
    safety:    (cond.safety    || []).filter((_, i) => !denied[`cond-${ci}-sf-${i}`]),
  })).filter(c => c.exercise.length||c.diet.length||c.lifestyle.length||c.safety.length);

  const translateContent = async (lang) => {
    if (lang === "English") { setTranslated(null); return; }
    setTranslating(true);
    try {
      const res  = await fetch(`${import.meta.env.VITE_AGENT_BASE_URL}/agent/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: lang,
          drug_counseling: approvedDrugData.map(d => ({
            drug: d.drug, counseling_points: d.points,
            key_monitoring: d.key_monitoring, patient_summary: d.patient_summary,
          })),
          condition_counseling: approvedCondData.map(c => ({
            condition: c.condition, exercise: c.exercise||[], diet: c.diet||[],
            lifestyle: c.lifestyle||[], safety: c.safety||[],
            monitoring: c.monitoring||"", follow_up: c.follow_up||"",
          })),
        }),
      });
      const data = await res.json();
      if (!data.drug_counseling && !data.condition_counseling) { setTranslated(null); return; }
      setTranslated({
        drugData: (data.drug_counseling || []).map(d => ({
          drug: d.drug, points: d.counseling_points||[],
          key_monitoring: d.key_monitoring||"", patient_summary: d.patient_summary||"",
        })),
        condData: data.condition_counseling || [],
      });
    } catch (err) { console.error("Translation error:", err); setTranslated(null); }
    finally { setTranslating(false); }
  };

  const handleSelectLang = (lang) => {
    setSelectedLang(lang);
    setShowLangDrop(false);
    setLangSearch("");
    translateContent(lang);
  };

  const handleSavePdf = () => {
    setPdfGenerating(true);
    const drug = (translated?.drugData || approvedDrugData).map(d => ({ ...d, points: (d.points || []).map(pt => ({ ...pt })) }));
    const cond = (translated?.condData || approvedCondData).map(c => ({ ...c }));
    const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const now  = new Date().toLocaleString();
    const esc  = (s) => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    let body = "";
    if (drug.length > 0) {
      body += `<h2 class="sec-title">Drug Counselling</h2>`;
      drug.forEach(d => {
        body += `<p class="drug-name">${esc(d.drug)}</p>`;
        (d.points || []).forEach(pt => {
          body += `<div class="item"><div class="item-top"><strong class="item-title">${esc(pt.title)}</strong></div><p class="item-desc">${esc(pt.detail)}</p></div>`;
        });
      });
    }
    if (cond.length > 0) {
      body += `<h2 class="sec-title">Condition Counselling</h2>`;
      cond.forEach(c => {
        body += `<p class="drug-name">${esc(c.condition)}</p>`;
        [{ label:"Exercise",items:c.exercise },{ label:"Diet",items:c.diet },{ label:"Lifestyle",items:c.lifestyle },{ label:"Safety",items:c.safety }].forEach(sec => {
          if (!sec.items?.length) return;
          body += `<p class="sub-label">${esc(sec.label)}</p>`;
          sec.items.forEach(it => {
            body += `<div class="item"><div class="item-top"><strong class="item-title">${esc(it.title)}</strong></div><p class="item-desc">${it.frequency ? `${esc(it.detail)} — ${esc(it.frequency)}` : esc(it.detail||"")}</p></div>`;
          });
        });
      });
    }
    const langAttrMap = { Mandarin:"zh",Japanese:"ja",Korean:"ko",Arabic:"ar",Hindi:"hi",Bengali:"bn",Tamil:"ta",Telugu:"te",Kannada:"kn",Malayalam:"ml",Marathi:"mr",Gujarati:"gu",Punjabi:"pa",Urdu:"ur",Thai:"th",Vietnamese:"vi",Indonesian:"id",Malay:"ms",Swahili:"sw",Russian:"ru",Ukrainian:"uk",Polish:"pl",Spanish:"es",French:"fr",Portuguese:"pt",German:"de",Italian:"it",Dutch:"nl",Turkish:"tr" };
    const htmlLang = langAttrMap[selectedLang] || "en";
    const isRtl    = ["Arabic","Urdu","Hebrew","Farsi"].includes(selectedLang);
    const html = `<!DOCTYPE html><html lang="${htmlLang}"${isRtl?' dir="rtl"':""}><head><meta charset="UTF-8"/><title>Patient Counselling</title><link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&display=swap" rel="stylesheet"/><style>*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact!important}body{font-family:"Noto Sans",Arial,sans-serif;font-size:13px;color:#000;background:#fff;padding:32px;${isRtl?"direction:rtl;text-align:right;":""}}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:14px;border-bottom:2.5px solid #1a73e8}.logo{font-size:17px;font-weight:800;color:#1a73e8}.meta{text-align:right;font-size:11px;line-height:1.9;color:#333}.sec-title{font-size:14px;font-weight:700;color:#1a73e8;margin:22px 0 10px;padding-bottom:5px;border-bottom:1px solid #e0e3ef}.drug-name{font-size:12px;font-weight:700;color:#111;margin:12px 0 6px;padding-left:8px;border-left:3px solid #1a73e8}.sub-label{font-size:10px;font-weight:700;color:#777;text-transform:uppercase;letter-spacing:.05em;margin:10px 0 4px}.item{background:#f8f7ff;border-left:3px solid #1a73e8;padding:8px 12px;margin-bottom:6px;border-radius:5px;page-break-inside:avoid}.item-top{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:4px}.item-title{font-size:12px;font-weight:700;color:#111}.item-desc{font-size:11px;color:#333;line-height:1.65;margin-top:2px}.footer{margin-top:36px;padding-top:12px;border-top:1px solid #e0e0e0;display:flex;justify-content:space-between;font-size:10px;color:#888}@page{margin:18mm 15mm}@media print{body{padding:0}}</style></head><body><div class="header"><div class="logo">VabGenRx — Patient Counselling</div><div class="meta">${p?.Name?`<div><strong>Patient:</strong> ${esc(p.Name)}</div>`:""}${p?.Age?`<div><strong>Age:</strong> ${esc(String(p.Age))}</div>`:""}${p?.Sex?`<div><strong>Sex:</strong> ${p.Sex==="M"?"Male":"Female"}</div>`:""}<div><strong>Date:</strong> ${date}</div>${selectedLang!=="English"?`<div><strong>Language:</strong> ${esc(selectedLang)}</div>`:""}</div></div>${body}<div class="footer"><span>Generated by VabGenRx — For clinical use only</span><span>${now}</span></div></body></html>`;
    const printWin = window.open("","_blank","width=900,height=700,scrollbars=yes");
    if (!printWin) { setPdfGenerating(false); return; }
    printWin.document.open(); printWin.document.write(html); printWin.document.close();
    const waitAndPrint = () => {
      if (printWin.document.fonts?.ready) {
        printWin.document.fonts.ready.then(() => {
          setTimeout(() => { printWin.focus(); printWin.print(); setPdfGenerating(false); }, 300);
        });
      } else {
        setTimeout(() => { printWin.focus(); printWin.print(); setPdfGenerating(false); }, 1500);
      }
    };
    if (printWin.document.readyState === "complete") waitAndPrint();
    else { printWin.onload = waitAndPrint; setTimeout(waitAndPrint, 3500); }
  };

  const displayDrug   = translated?.drugData || approvedDrugData;
  const displayCond   = translated?.condData || approvedCondData;
  const filteredLangs = LANGUAGES.filter(l => l.toLowerCase().includes(langSearch.toLowerCase()));
  const deniedCount   = Object.keys(denied).length;

  const CounselItem = ({ itemKey, icon, title, detail }) => {
    const isDenied = denied[itemKey];
    return (
      <div className={`pcoun-item${isDenied ? " pcoun-item-denied" : ""}`}>
        <div className="pcoun-item-top">
          {icon && <span className="pcoun-item-icon">{icon}</span>}
          <span className="pcoun-item-title">{title}</span>
          {isDenied && <span className="pcoun-denied-tag"><XCircle size={10} style={{ marginRight: 3 }} />Denied</span>}
          <div className="pcoun-action-group">
            {isDenied
              ? <button className="pcoun-btn-retrieve" onClick={() => handleRetrieve(itemKey)}><RotateCcw size={11} style={{ marginRight: 4 }} />Retrieve</button>
              : <button className="pcoun-btn-deny"     onClick={() => handleDeny(itemKey)}><X size={11} style={{ marginRight: 4 }} />Deny</button>}
          </div>
        </div>
        <div className="pcoun-item-desc">{detail}</div>
      </div>
    );
  };

  const SectionLabel = ({ icon: Icon, label, warn }) => (
    <div className={`pcoun-section-label${warn ? " pcoun-section-label-warn" : ""}`}>
      <Icon size={12} />{label}
    </div>
  );

  const ConditionSections = ({ cond, ci }) => (
    <>
      {cond.exercise?.length > 0 && (
        <div className="pcoun-section">
          <SectionLabel icon={Dumbbell} label="Exercise" />
          {cond.exercise.map((ex, ei) => (
            <CounselItem
              key={`cond-${ci}-ex-${ei}`}
              itemKey={`cond-${ci}-ex-${ei}`}
              title={ex.title}
              detail={ex.frequency ? `${ex.detail} — ${ex.frequency}` : ex.detail}
            />
          ))}
        </div>
      )}
      {cond.diet?.length > 0 && (
        <div className="pcoun-section">
          <SectionLabel icon={Utensils} label="Diet" />
          {cond.diet.map((dt, dti) => (
            <CounselItem key={`cond-${ci}-diet-${dti}`} itemKey={`cond-${ci}-diet-${dti}`} title={dt.title} detail={dt.detail} />
          ))}
        </div>
      )}
      {cond.lifestyle?.length > 0 && (
        <div className="pcoun-section">
          <SectionLabel icon={Leaf} label="Lifestyle" />
          {cond.lifestyle.map((ls, lsi) => (
            <CounselItem key={`cond-${ci}-ls-${lsi}`} itemKey={`cond-${ci}-ls-${lsi}`} title={ls.title} detail={ls.detail} />
          ))}
        </div>
      )}
      {cond.safety?.length > 0 && (
        <div className="pcoun-section">
          <SectionLabel icon={ShieldAlert} label="Safety" warn />
          {cond.safety.map((sf, sfi) => (
            <CounselItem key={`cond-${ci}-sf-${sfi}`} itemKey={`cond-${ci}-sf-${sfi}`} title={sf.title} detail={sf.detail} />
          ))}
        </div>
      )}
    </>
  );

  const COND_SECTIONS = [
    { label: "Exercise",  Icon: Dumbbell   },
    { label: "Diet",      Icon: Utensils   },
    { label: "Lifestyle", Icon: Leaf       },
    { label: "Safety",    Icon: ShieldAlert },
  ];

  return (
    <>
      {/* ── Prescribe button sits ABOVE the card ── */}
      {onPrescribe && (
        <div className="pcoun-prescribe-top">
          <button
            onClick={onPrescribe}
            disabled={prescribeDisabled}
            className="pcoun-prescribe-btn"
            style={{ opacity: prescribeDisabled ? 0.5 : 1, cursor: prescribeDisabled ? "not-allowed" : "pointer" }}
          >
            <ClipboardList size={15} />Prescribe
          </button>
        </div>
      )}

      <div className="pcoun-card">
        <div className="pcoun-header">
          <div className="pcoun-title">
            <Stethoscope size={14} strokeWidth={2.5} />
            Patient Education
            {totalPoints > 0 && <span className="pcoun-points-badge">{totalPoints} points</span>}
            {deniedCount > 0 && <span className="pcoun-denied-badge">{deniedCount} denied</span>}
          </div>
        </div>

        <div className="pcoun-tabs">
          {[
            { key: "drug",      label: "Drug Counselling",      Icon: Pill     },
            { key: "condition", label: "Condition Counselling", Icon: Activity },
          ].map(t => (
            <button key={t.key} className={`pcoun-tab${counselTab === t.key ? " active" : ""}`} onClick={() => setCounselTab(t.key)}>
              <t.Icon size={12} />{t.label}
            </button>
          ))}
        </div>

        <div className="pcoun-body">
          {agentLoading && <p className="pcoun-loading">Generating patient counseling...</p>}

          {counselTab === "drug" && !agentLoading && (
            drugCounseling.length === 0
              ? <p className="pcoun-empty">Add medications and click <strong>Done — Run Analysis</strong>.</p>
              : drugCounseling.map((drug, di) => (
                <div key={di} style={{ marginBottom: di < drugCounseling.length - 1 ? "1rem" : 0 }}>
                  <div className="pcoun-drug-label"><Pill size={13} />{drug.drug}</div>
                  {drug.counseling_points?.map((pt, pi) => (
                    <CounselItem
                      key={`drug-${di}-${pi}`}
                      itemKey={`drug-${di}-${pi}`}
                      icon={iconForCategory(pt.category)}
                      title={pt.title}
                      detail={pt.detail}
                    />
                  ))}
                </div>
              ))
          )}

          {counselTab === "condition" && !agentLoading && (
            conditionCounseling.length === 0
              ? <p className="pcoun-empty">Save a diagnosis above and click <strong>Done — Run Analysis</strong>.</p>
              : conditionCounseling.map((cond, ci) => (
                <div key={ci} style={{ marginBottom: ci < conditionCounseling.length - 1 ? "1.25rem" : 0 }}>
                  <div className="pcoun-cond-label"><Activity size={13} />{cond.condition}</div>
                  <ConditionSections cond={cond} ci={ci} />
                </div>
              ))
          )}
        </div>

        <div className="pcoun-footer">
          <button className="pcoun-preview-btn" onClick={() => setShowPreview(true)}>
            <Eye size={15} />Preview for Patient
          </button>
        </div>
      </div>

      {showPreview && (
        <div className="pcoun-modal-overlay" onClick={() => setShowPreview(false)}>
          <div className="pcoun-modal" onClick={e => e.stopPropagation()}>
            <div className="pcoun-modal-header">
              <div className="pcoun-modal-title"><FileText size={15} />Patient Counselling Preview</div>
              <div className="pcoun-modal-header-right">
                <div className="pcoun-lang-wrap" ref={langRef}>
                  <div className="pcoun-lang-input-wrap" onClick={() => setShowLangDrop(v => !v)}>
                    <Globe size={14} className="pcoun-lang-icon" />
                    <input
                      className="pcoun-lang-input"
                      placeholder="Search language..."
                      value={langSearch}
                      onChange={e => { setLangSearch(e.target.value); setShowLangDrop(true); }}
                      onClick={e => e.stopPropagation()}
                    />
                    {selectedLang !== "English" && <span className="pcoun-lang-selected-tag">{selectedLang}</span>}
                  </div>
                  {showLangDrop && (
                    <div className="pcoun-lang-dropdown">
                      {filteredLangs.length === 0
                        ? <div className="pcoun-lang-no-result">No language found</div>
                        : filteredLangs.map(l => (
                          <div key={l} className={`pcoun-lang-option${selectedLang === l ? " active" : ""}`} onClick={() => handleSelectLang(l)}>
                            {l}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
                <button className="pcoun-modal-close" onClick={() => setShowPreview(false)}><X size={14} /></button>
              </div>
            </div>

            <div className="pcoun-modal-body">
              {translating ? (
                <div className="pcoun-modal-translating">
                  <div className="pcoun-spinner" />
                  <span>Translating to {selectedLang}...</span>
                </div>
              ) : (
                <>
                  {displayDrug.length > 0 && (
                    <div className="pcoun-modal-section">
                      <div className="pcoun-modal-section-title"><Pill size={14} />Drug Counselling</div>
                      {displayDrug.map((drug, di) => (
                        <div key={di} className="pcoun-modal-drug-block">
                          <div className="pcoun-modal-drug-name">{drug.drug}</div>
                          {drug.points.map((pt, pi) => (
                            <div key={pi} className="pcoun-modal-item">
                              <div className="pcoun-modal-item-top">
                                <span className="pcoun-modal-item-title">{pt.title}</span>
                              </div>
                              <div className="pcoun-modal-item-desc">{pt.detail}</div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  {displayCond.length > 0 && (
                    <div className="pcoun-modal-section">
                      <div className="pcoun-modal-section-title"><Activity size={14} />Condition Counselling</div>
                      {displayCond.map((cond, ci) => (
                        <div key={ci} className="pcoun-modal-drug-block">
                          <div className="pcoun-modal-drug-name">{cond.condition}</div>
                          {COND_SECTIONS.map(sec => {
                            const items = cond[sec.label.toLowerCase()];
                            if (!items?.length) return null;
                            return (
                              <div key={sec.label}>
                                <div className="pcoun-modal-sub-label"><sec.Icon size={11} />{sec.label}</div>
                                {items.map((it, ii) => (
                                  <div key={ii} className="pcoun-modal-item">
                                    <div className="pcoun-modal-item-top">
                                      <span className="pcoun-modal-item-title">{it.title}</span>
                                    </div>
                                    <div className="pcoun-modal-item-desc">{it.detail}{it.frequency ? ` — ${it.frequency}` : ""}</div>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                  {displayDrug.length === 0 && displayCond.length === 0 && (
                    <p className="pcoun-modal-empty">No counselling points to preview. Denied points are hidden — retrieve them from the main view.</p>
                  )}
                </>
              )}
            </div>

            <div className="pcoun-modal-footer">
              <span className="pcoun-modal-footer-note">
                {totalPoints - deniedCount} point{totalPoints - deniedCount !== 1 ? "s" : ""} shown
                {deniedCount > 0 ? ` · ${deniedCount} denied` : ""}
                {selectedLang !== "English" ? ` · ${selectedLang}` : ""}
              </span>
              <button
                className="pcoun-pdf-btn"
                onClick={handleSavePdf}
                disabled={pdfGenerating || translating || (displayDrug.length === 0 && displayCond.length === 0)}
              >
                <FileDown size={14} />{pdfGenerating ? "Generating..." : "Save as PDF"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PatientCounselling;