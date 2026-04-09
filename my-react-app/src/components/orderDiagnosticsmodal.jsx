import { useState, useRef, useEffect, useCallback } from "react";
import "./styles/orderDiagnosticsmodal.css";

/* ══════════════════════════════════════
   TEST CATALOGUE
   ══════════════════════════════════════ */
const CATALOGUE = {
  Haematology: [
    "CBC", "WBC Differential", "Haemoglobin", "Platelet Count",
    "Reticulocyte Count", "Peripheral Smear", "ESR", "D-dimer", "PT/INR", "aPTT",
  ],
  "Metabolic Panel": [
    "Fasting Glucose", "HbA1c", "RBS", "Fasting Insulin", "C-peptide",
    "Urea", "Creatinine", "eGFR", "Uric Acid", "Electrolytes",
    "LFT", "Bilirubin", "SGOT", "SGPT", "ALP", "GGT", "Albumin", "Total Protein",
  ],
  Cardiovascular: [
    "Troponin I", "Troponin T", "BNP", "NT-proBNP", "CK-MB", "LDH",
    "Lipid Profile", "Total Cholesterol", "HDL", "LDL", "Triglycerides",
    "Homocysteine", "CRP", "hs-CRP",
  ],
  Endocrinology: [
    "TSH", "Free T3", "Free T4", "Cortisol", "FSH", "LH", "Oestradiol",
    "Progesterone", "Testosterone", "DHEA-S", "Prolactin", "IGF-1",
    "Parathyroid Hormone", "Vitamin D", "Vitamin B12", "Ferritin", "Serum Iron",
  ],
  Immunology: [
    "ANA", "Anti-dsDNA", "RF", "Anti-CCP", "Complement C3", "Complement C4",
    "IgA", "IgG", "IgM", "HIV Ag/Ab", "HBsAg", "Anti-HCV",
    "Procalcitonin", "Interleukin-6",
  ],
  "CT Scan": [
    "CT Chest", "CT Abdomen", "CT Pelvis", "CT Brain",
    "CT Spine", "CT Angiography", "CT Pulmonary Angiography", "CT KUB",
  ],
  MRI: [
    "MRI Brain", "MRI Spine", "MRI Knee", "MRI Shoulder",
    "MRI Abdomen", "MRI Cardiac", "MRI Pelvis", "MRI Angiography",
  ],
  Ultrasound: [
    "USG Abdomen", "USG Pelvis", "USG Thyroid", "USG Breast",
    "USG KUB", "Carotid Doppler", "Venous Doppler", "Echocardiography",
  ],
  Microbiology: [
    "Blood Culture", "Urine Culture", "Sputum Culture", "Wound Swab",
    "Throat Swab", "Stool Culture", "CSF Culture", "Sensitivity Panel",
  ],
};

const ALL_TESTS = Object.values(CATALOGUE).flat();

const SYMPTOM_SUGGESTIONS = [
  { trigger: "Chest pain",        tests: ["Troponin I", "CK-MB", "BNP", "CT Pulmonary Angiography"] },
  { trigger: "Fever / infection", tests: ["CBC", "CRP", "Blood Culture", "Procalcitonin"] },
  { trigger: "Fatigue / anaemia", tests: ["CBC", "Ferritin", "Vitamin B12", "TSH"] },
  { trigger: "Joint pain",        tests: ["ESR", "RF", "Anti-CCP", "ANA"] },
  { trigger: "Jaundice",          tests: ["LFT", "Bilirubin", "ALP", "Anti-HCV"] },
  { trigger: "Hypertension",      tests: ["Urea", "Creatinine", "Lipid Profile", "Cortisol"] },
];

const RECENT_TESTS = [
  { name: "CBC",          fav: false },
  { name: "Lipid Profile", fav: true  },
  { name: "HbA1c",        fav: true  },
  { name: "Troponin I",   fav: false },
  { name: "TSH",          fav: false },
  { name: "LFT",          fav: false },
];

/* names flagged as recently ordered — triggers duplicate warn */
const RECENTLY_ORDERED_NAMES = ["CBC", "TSH", "LFT"];

/* ══════════════════════════════════════
   ICONS (self-contained, no external deps)
   ══════════════════════════════════════ */
const Ic = {
  X:       () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Search:  () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Chevron: () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  Warn:    () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Check:   () => <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  Clip:    () => <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>,
  Star:    ({ filled }) => <svg width="10" height="10" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
};

/* ══════════════════════════════════════
   SUCCESS SCREEN (shown inside modal)
   ══════════════════════════════════════ */
const SuccessScreen = ({ orders, onNewOrder, onDone }) => {
  const items      = Object.entries(orders);
  const statCount  = items.filter(([, o]) => o.priority === "STAT").length;

  return (
    <div className="odm-success">
      <div className="odm-success-icon"><Ic.Check /></div>
      <h2 className="odm-success-title">Order request sent</h2>
      <p className="odm-success-sub">
        {items.length} test{items.length !== 1 ? "s" : ""} queued for the lab.
        {statCount > 0 && <> <strong>{statCount} STAT</strong> order{statCount !== 1 ? "s" : ""} will be prioritised.</>}
      </p>

      <div className="odm-success-list">
        {items.map(([name, o]) => (
          <div key={name} className="odm-success-row">
            <span className="odm-success-name">{name}</span>
            <span className={`odm-pri-badge odm-pri-${o.priority.toLowerCase()}`}>{o.priority}</span>
          </div>
        ))}
      </div>

      

      <div className="odm-success-actions">
        <button className="odm-btn-ghost" onClick={onNewOrder}>Order more tests</button>
        <button className="odm-btn-primary" onClick={onDone}>Done</button>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════
   VIEW ALL TESTS PANEL (inline drawer)
   ══════════════════════════════════════ */
const AllTestsPanel = ({ orders, onAdd, onClose }) => (
  <div className="odm-all-overlay" onClick={onClose}>
    <div className="odm-all-panel" onClick={e => e.stopPropagation()}>
      <div className="odm-all-head">
        <span className="odm-all-title">All available tests</span>
        <button className="odm-icon-btn" onClick={onClose}><Ic.X /></button>
      </div>
      <div className="odm-all-body">
        {Object.entries(CATALOGUE).map(([cat, tests]) => (
          <div key={cat} className="odm-all-cat">
            <p className="odm-all-cat-lbl">{cat}</p>
            <div className="odm-chip-row">
              {tests.map(t => (
                <button
                  key={t}
                  className={`odm-chip${orders[t] ? " odm-chip-added" : ""}`}
                  onClick={() => onAdd(t, cat)}
                >{t}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* ══════════════════════════════════════
   MAIN MODAL
   ══════════════════════════════════════ */
const OrderDiagnosticsModal = ({ patient, isOutpatient, onClose }) => {
  const patientNo = isOutpatient ? patient?.OP_No : patient?.IP_No;

  const [orders,       setOrders]       = useState({});
  const [query,        setQuery]        = useState("");
  const [ddOpen,       setDdOpen]       = useState(false);
  const [activeCat,    setActiveCat]    = useState(null);
  const [customVal,    setCustomVal]    = useState("");
  const [showSuccess,  setShowSuccess]  = useState(false);
  const [submittedOrders, setSubmittedOrders] = useState({});
  const [showAllTests, setShowAllTests] = useState(false);

  const searchRef = useRef(null);
  const ddRef     = useRef(null);

  /* lock body scroll while modal open */
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  /* close dropdown on outside click */
  useEffect(() => {
    const h = (e) => {
      if (!ddRef.current?.contains(e.target) && !searchRef.current?.contains(e.target))
        setDdOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  /* close on Escape */
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const getCat = (name) =>
    Object.entries(CATALOGUE).find(([, v]) => v.includes(name))?.[0] || "Custom";

  const addTest = useCallback((name, cat) => {
    const category = cat || getCat(name);
    setOrders(prev => {
      if (prev[name]) return prev;
      return { ...prev, [name]: { category, priority: "Routine", recentDup: RECENTLY_ORDERED_NAMES.includes(name) } };
    });
    setQuery("");
    setDdOpen(false);
  }, []);

  const removeTest = (name) =>
    setOrders(prev => { const n = { ...prev }; delete n[name]; return n; });

  const setPriority = (name, p) =>
    setOrders(prev => ({ ...prev, [name]: { ...prev[name], priority: p } }));

  const addCustom = () => {
    const v = customVal.trim();
    if (!v) return;
    addTest(v, "Custom");
    setCustomVal("");
  };

  const submitOrders = () => {
    if (!Object.keys(orders).length) return;
    setSubmittedOrders({ ...orders });
    setShowSuccess(true);
  };

  const handleNewOrder = () => { setOrders({}); setShowSuccess(false); };

  const toggleCat = (cat) => setActiveCat(prev => prev === cat ? null : cat);

  /* search */
  const q           = query.toLowerCase();
  const searchHits  = query.length >= 2 ? ALL_TESTS.filter(t => t.toLowerCase().includes(q)).slice(0, 6) : [];
  const symptomHits = query.length >= 2 ? SYMPTOM_SUGGESTIONS.filter(s => s.trigger.toLowerCase().includes(q)) : [];
  const orderCount  = Object.keys(orders).length;

  return (
    <div className="odm-overlay" onClick={onClose}>
      <div className="odm-modal" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="odm-header">
          <div className="odm-header-left">
            <div className="odm-header-title-wrap">
              <h2 className="odm-header-title">Order diagnostics</h2>
              <span className="odm-header-sub">
                {isOutpatient ? "OP" : "IP"} · {patientNo}
                {patient?.Name && <> · {patient.Name}</>}
              </span>
            </div>
            {orderCount > 0 && (
              <span className="odm-header-badge">{orderCount} test{orderCount !== 1 ? "s" : ""} selected</span>
            )}
          </div>
          <button className="odm-close-btn" onClick={onClose} aria-label="Close">
            <Ic.X />
          </button>
        </div>

        {/* ── Body ── */}
        {showSuccess ? (
          <div className="odm-body odm-body-center">
            <SuccessScreen
              orders={submittedOrders}
              onNewOrder={handleNewOrder}
              onDone={onClose}
            />
          </div>
        ) : (
          <div className="odm-body">

            {/* ══ LEFT COLUMN ══ */}
            <div className="odm-left">

              {/* search */}
              <div className="odm-card">
                <p className="odm-card-lbl">Search tests or symptoms</p>
                <div className="odm-search-wrap" ref={ddRef}>
                  <div className="odm-search-inner">
                    <span className="odm-search-ico"><Ic.Search /></span>
                    <input
                      ref={searchRef}
                      type="text"
                      className="odm-search"
                      placeholder="e.g. CBC, chest pain, Troponin, HbA1c…"
                      value={query}
                      onChange={e => { setQuery(e.target.value); setDdOpen(true); }}
                      onFocus={() => query.length >= 2 && setDdOpen(true)}
                      autoComplete="off"
                    />
                    {query && (
                      <button className="odm-search-clr" onClick={() => { setQuery(""); setDdOpen(false); }}>
                        <Ic.X />
                      </button>
                    )}
                  </div>
                  {ddOpen && (searchHits.length > 0 || symptomHits.length > 0) && (
                    <div className="odm-dropdown">
                      {searchHits.length > 0 && (
                        <div className="odm-dd-sec">
                          <p className="odm-dd-lbl">Tests</p>
                          {searchHits.map(t => (
                            <button key={t} className="odm-dd-item" onClick={() => addTest(t)}>
                              <span>{t}</span>
                              <span className={`odm-dd-tag${orders[t] ? " odm-dd-tag-done" : ""}`}>
                                {orders[t] ? "Added" : "+ Add"}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {symptomHits.length > 0 && (
                        <>
                          {searchHits.length > 0 && <div className="odm-dd-div" />}
                          <div className="odm-dd-sec">
                            <p className="odm-dd-lbl">Suggested for symptom</p>
                            {symptomHits.flatMap(s =>
                              s.tests.map(t => (
                                <button key={`${s.trigger}-${t}`} className="odm-dd-item" onClick={() => addTest(t)}>
                                  <span>{t}<span className="odm-dd-sym"> — {s.trigger}</span></span>
                                  <span className="odm-dd-tag odm-dd-tag-sug">Suggested</span>
                                </button>
                              ))
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {ddOpen && query.length >= 2 && searchHits.length === 0 && symptomHits.length === 0 && (
                    <div className="odm-dropdown">
                      <div className="odm-dd-empty">No matches — add as a custom test below.</div>
                    </div>
                  )}
                </div>
              </div>

              {/* categories */}
              <div className="odm-card">
                <p className="odm-card-lbl">Browse by category</p>
                <div className="odm-cat-pills">
                  {Object.keys(CATALOGUE).map(cat => (
                    <button
                      key={cat}
                      className={`odm-cat-pill${activeCat === cat ? " odm-cat-pill-on" : ""}`}
                      onClick={() => toggleCat(cat)}
                    >
                      {cat}
                      <span className={`odm-cat-chev${activeCat === cat ? " odm-cat-chev-open" : ""}`}>
                        <Ic.Chevron />
                      </span>
                    </button>
                  ))}
                </div>
                {activeCat && (
                  <div className="odm-cat-panel">
                    <p className="odm-cat-panel-lbl">{activeCat}</p>
                    <div className="odm-chip-row">
                      {CATALOGUE[activeCat].map(t => (
                        <button
                          key={t}
                          className={`odm-chip${orders[t] ? " odm-chip-added" : ""}`}
                          onClick={() => addTest(t, activeCat)}
                        >{t}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* recents & favorites */}
              <div className="odm-card">
                <p className="odm-card-lbl">Recent &amp; favorites</p>
                <div className="odm-recents">
                  {RECENT_TESTS.map(r => (
                    <button key={r.name} className="odm-recent-pill" onClick={() => addTest(r.name)}>
                      <span className={`odm-recent-dot${r.fav ? " odm-recent-dot-fav" : ""}`}>
                        <Ic.Star filled={r.fav} />
                      </span>
                      {r.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* smart suggestions */}
              <div className="odm-card">
                <p className="odm-card-lbl">Smart suggestions by symptom</p>
                <div className="odm-sug-grid">
                  {SYMPTOM_SUGGESTIONS.map(s => (
                    <div key={s.trigger} className="odm-sug-card">
                      <p className="odm-sug-trigger">{s.trigger}</p>
                      <div className="odm-chip-row">
                        {s.tests.map(t => (
                          <button
                            key={t}
                            className={`odm-sug-chip${orders[t] ? " odm-sug-chip-added" : ""}`}
                            onClick={() => addTest(t)}
                          >{t}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* custom test */}
              <div className="odm-card">
                <p className="odm-card-lbl">Add custom test</p>
                <p className="odm-custom-hint">Can't find a test? Enter the name manually.</p>
                <div className="odm-custom-row">
                  <input
                    type="text"
                    className="odm-custom-input"
                    placeholder="e.g. Anti-CCP, Procalcitonin…"
                    value={customVal}
                    onChange={e => setCustomVal(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addCustom()}
                  />
                  <button className="odm-btn-primary odm-custom-btn" onClick={addCustom}>+ Add</button>
                </div>
                <button className="odm-view-all-btn" onClick={() => setShowAllTests(true)}>
                  View all available tests ↗
                </button>
              </div>

            </div>

            {/* ══ RIGHT COLUMN — ORDER PANEL ══ */}
            <div className="odm-right">
              <div className="odm-panel">
                <div className="odm-panel-head">
                  <span className="odm-panel-title">Order panel</span>
                  <span className="odm-panel-count">{orderCount}</span>
                </div>

                <div className="odm-panel-body">
                  {orderCount === 0 ? (
                    <div className="odm-panel-empty">
                      <Ic.Clip />
                      <p>No tests selected yet.<br />Search or browse to add tests.</p>
                    </div>
                  ) : (
                    <div className="odm-panel-list">
                      {Object.entries(orders).map(([name, o]) => (
                        <div key={name} className="odm-order-item">
                          <div className="odm-oi-top">
                            <span className="odm-oi-name">{name}</span>
                            <button className="odm-oi-rm" onClick={() => removeTest(name)}><Ic.X /></button>
                          </div>
                          <p className="odm-oi-cat">{o.category}</p>
                          <div className="odm-pri-row">
                            {["Routine", "Urgent", "STAT"].map(p => (
                              <button
                                key={p}
                                className={`odm-pri-btn odm-pri-${p.toLowerCase()}${o.priority === p ? " odm-pri-on" : ""}`}
                                onClick={() => setPriority(name, p)}
                              >{p}</button>
                            ))}
                          </div>
                          {o.recentDup && (
                            <div className="odm-dup-warn"><Ic.Warn /> Ordered recently</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="odm-panel-foot">
                  <button className="odm-btn-primary odm-submit-btn" disabled={orderCount === 0} onClick={submitOrders}>
                    Submit orders{orderCount > 0 ? ` (${orderCount})` : ""}
                  </button>
                  {orderCount > 0 && (
                    <button className="odm-clear-btn" onClick={() => setOrders({})}>Clear all</button>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ── View all tests drawer (nested within modal) ── */}
        {showAllTests && (
          <AllTestsPanel
            orders={orders}
            onAdd={(t, cat) => addTest(t, cat)}
            onClose={() => setShowAllTests(false)}
          />
        )}

      </div>
    </div>
  );
};

export default OrderDiagnosticsModal;