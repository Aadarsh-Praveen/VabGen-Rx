import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Pill, Search, Pencil, Trash2, PauseCircle, PlayCircle, Save, X, ChevronDown, AlertTriangle, RotateCcw, StopCircle, CheckCircle2, Plus } from "lucide-react";
import "../components/styles/medicationList.css";

const FREQ_OPTIONS = ["bid", "tid", "qid", "qd", "qod", "q2h", "q3h", "q4h", "q4h wa", "prn"];

const MedicationList = ({
  medications, medLoading, showAddRow, setShowAddRow,
  searchQ, searchResults, searching, newMed, newForm, setNewForm,
  newErrors, setNewErrors, addSaving, editingId, editValues, setEditValues,
  openMenu, menuPos, dropdownPos, agentLoading, agentResult, wasInterrupted,
  handleSearch, handleSelectDrug, handleAutoSave, handleCancelAdd,
  handleEdit, handleSaveEdit, handleHold, handleDelete,
  handleMenuOpen, updateDropdownPos, triggerAnalysis, onInterrupt,
  searchInputRef,
}) => {
  const [manualMode,     setManualMode]    = useState(false);
  const [manualBrand,    setManualBrand]   = useState("");
  const [manualGeneric,  setManualGeneric] = useState("");
  const [manualStrength, setManualStrength]= useState("");
  const [dupWarning,     setDupWarning]    = useState(false);

  // ── Recalculate dropdown position on scroll ───────────────────
  // When showAddRow is open and the user scrolls, update the
  // dropdown coordinates so it tracks the input field correctly.
  useEffect(() => {
    if (!showAddRow) return;

    const handleScroll = () => updateDropdownPos();

    window.addEventListener("scroll", handleScroll, { passive: true });
    // Also listen on any scrollable parent containers
    document.querySelectorAll("*").forEach(el => {
      if (el.scrollHeight > el.clientHeight) {
        el.addEventListener("scroll", handleScroll, { passive: true });
      }
    });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      document.querySelectorAll("*").forEach(el => {
        el.removeEventListener("scroll", handleScroll);
      });
    };
  }, [showAddRow, updateDropdownPos]);

  const handleCancelAddFull = () => {
    setManualMode(false); setManualBrand(""); setManualGeneric(""); setManualStrength("");
    handleCancelAdd();
  };

  const isDuplicate = (brand, generic, strength) => {
    const norm = s => (s || "").trim().toLowerCase();
    return medications.some(m =>
      norm(m.Brand_Name) === norm(brand) &&
      norm(m.Generic_Name) === norm(generic) &&
      norm(m.Strength) === norm(strength)
    );
  };

  const handleSaveFull = () => {
    if (manualMode) {
      const brand    = manualBrand.trim()    || manualGeneric.trim();
      const generic  = manualGeneric.trim()  || manualBrand.trim();
      const strength = manualStrength.trim();
      if (isDuplicate(brand, generic, strength)) { setDupWarning(true); return; }
      handleSelectDrug({ Brand_Name: brand, Generic_Name: generic, Strength: strength, Stocks: "N/A", manual: true });
      setTimeout(() => handleAutoSave(), 0);
    } else {
      if (newMed && isDuplicate(newMed.Brand_Name, newMed.Generic_Name, newMed.Strength)) { setDupWarning(true); return; }
      handleAutoSave();
    }
  };

  const showManualTrigger = !searching && searchQ.trim().length >= 2 && searchResults.length === 0 && !newMed && !manualMode;
  const editBorder = { borderColor: "#1a73e8", background: "#fff", borderWidth: 1, borderStyle: "solid" };

  return (
    <div className="med-card">
      <div className="med-header">
        <Pill size={14} color="#1a73e8" strokeWidth={2.5} />
        <span className="med-title">Medication List</span>
        <span className="med-count">{medications.length} medication{medications.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="med-table-wrap">
        <table className="med-table">
          <thead>
            <tr>
              <th>S.No</th><th>Brand Name</th><th>Generic Name</th>
              <th>Strength</th><th>Route *</th><th>Frequency *</th>
              <th>Days *</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {medLoading ? (
              <tr><td colSpan={8} className="med-empty">Loading...</td></tr>
            ) : (
              <>
                {medications.map((m, i) => {
                  const isEditing = editingId === m.ID;
                  return (
                    <tr key={m.ID} style={{ opacity: m.held ? 0.5 : 1, background: isEditing ? "#f0f5ff" : "" }}>
                      <td className="med-sno">{i + 1}</td>
                      <td className="med-brand">
                        {isEditing
                          ? <input className="med-inline-inp" style={editBorder} value={editValues.brand_name ?? m.Brand_Name} placeholder="Brand Name" autoFocus onChange={e => setEditValues(v => ({ ...v, brand_name: e.target.value }))} />
                          : <>{m.Brand_Name}{m.held && <span className="med-hold-tag">HOLD</span>}</>}
                      </td>
                      <td className="med-generic">
                        {isEditing
                          ? <input className="med-inline-inp" style={editBorder} value={editValues.generic_name ?? m.Generic_Name} placeholder="Generic Name" onChange={e => setEditValues(v => ({ ...v, generic_name: e.target.value }))} />
                          : m.Generic_Name}
                      </td>
                      <td className="med-strength">
                        {isEditing
                          ? <input className="med-inline-inp" style={editBorder} value={editValues.strength ?? m.Strength} placeholder="Strength" onChange={e => setEditValues(v => ({ ...v, strength: e.target.value }))} />
                          : m.Strength}
                      </td>
                      <td>
                        {isEditing
                          ? <input className="med-inline-inp" style={editBorder} value={editValues.route} placeholder="Route" onChange={e => setEditValues(v => ({ ...v, route: e.target.value }))} />
                          : <span>{m.Route || "—"}</span>}
                      </td>
                      <td>
                        {isEditing
                          ? <select className="med-inline-inp" style={editBorder} value={editValues.frequency} onChange={e => setEditValues(v => ({ ...v, frequency: e.target.value }))}>
                              <option value="">Select</option>
                              {FREQ_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          : <span>{m.Frequency || "—"}</span>}
                      </td>
                      <td>
                        {isEditing
                          ? <input className="med-inline-inp" style={editBorder} value={editValues.days} placeholder="Days" onChange={e => setEditValues(v => ({ ...v, days: e.target.value }))} />
                          : <span>{m.Days || "—"}</span>}
                      </td>
                      <td style={{ position: "relative" }}>
                        <button className="med-menu-btn" onClick={e => handleMenuOpen(e, m.ID)}>
                          <ChevronDown size={13} />
                        </button>
                        {openMenu === m.ID && createPortal(
                          <div className="med-dropdown" style={{ top: menuPos.top, left: menuPos.left }}>
                            {isEditing
                              ? <div className="med-drop-item" style={{ color: "#1a73e8", fontWeight: 700 }} onClick={() => handleSaveEdit(m.ID)}><Save size={13} style={{ marginRight: 6 }} />Save</div>
                              : <div className="med-drop-item" onClick={() => handleEdit(m)}><Pencil size={13} style={{ marginRight: 6 }} />Edit</div>}
                            <div className="med-drop-item" onClick={() => handleHold(m.ID)}>
                              {m.held
                                ? <><PlayCircle size={13} style={{ marginRight: 6 }} />Resume</>
                                : <><PauseCircle size={13} style={{ marginRight: 6 }} />Hold</>}
                            </div>
                            <div className="med-drop-item med-drop-warn" onClick={() => handleDelete(m.ID)}>
                              <Trash2 size={13} style={{ marginRight: 6 }} />Delete
                            </div>
                          </div>,
                          document.body
                        )}
                      </td>
                    </tr>
                  );
                })}

                {showAddRow && (
                  <tr className="med-add-row">
                    <td className="med-sno" style={{ color: "#1a73e8" }}><Plus size={14} /></td>
                    <td colSpan={manualMode ? 1 : 3} style={{ position: "relative", overflow: "visible" }}>
                      {!manualMode ? (
                        <>
                          <div style={{ position: "relative" }}>
                            <Search size={13} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#aaa", pointerEvents: "none" }} />
                            <input
                              ref={searchInputRef}
                              className="med-search-inp"
                              style={{ paddingLeft: 26 }}
                              placeholder="Search brand or generic name..."
                              value={searchQ}
                              onChange={e => { handleSearch(e.target.value); updateDropdownPos(); }}
                              onFocus={updateDropdownPos}
                            />
                          </div>
                          {newErrors.drug && <div className="med-inline-error">{newErrors.drug}</div>}
                          {(searching || searchResults.length > 0 || showManualTrigger) && createPortal(
                            <div
                              className="med-search-dropdown"
                              style={{
                                position: "fixed",
                                top:      dropdownPos.top,
                                left:     dropdownPos.left,
                                width:    dropdownPos.width || 320,
                              }}
                            >
                              {searching && <div className="med-search-loading">Searching...</div>}
                              {!searching && searchResults.map((d, i) => (
                                <div key={i} className="med-search-option" onClick={() => handleSelectDrug(d)}>
                                  <div className="med-search-brand">{d.Brand_Name}</div>
                                  <div className="med-search-meta">{d.Generic_Name} · {d.Strength} · {d.Route} · Stock: {d.Stocks}</div>
                                </div>
                              ))}
                              {showManualTrigger && (
                                <div style={{ borderTop: searchResults.length > 0 ? "1px solid #f0f0f8" : "none" }}>
                                  <div className="med-search-loading" style={{ color: "#aaa" }}>No results for "{searchQ}"</div>
                                  <div
                                    className="med-search-option"
                                    style={{ color: "#1a73e8", fontWeight: 600, fontSize: "0.8rem", display: "flex", alignItems: "center", gap: 6 }}
                                    onClick={() => { setManualMode(true); setManualBrand(searchQ.trim()); }}
                                  >
                                    <Pencil size={12} />Add "{searchQ}" manually
                                  </div>
                                </div>
                              )}
                            </div>,
                            document.body
                          )}
                        </>
                      ) : (
                        <input
                          className="med-inline-inp"
                          style={{ width: "100%", background: "#fff", borderWidth: 1, borderStyle: "solid", borderColor: newErrors.drug ? "#e05252" : "#1a73e8" }}
                          placeholder="Brand Name *"
                          value={manualBrand}
                          autoFocus
                          onChange={e => { setManualBrand(e.target.value); setNewErrors(er => ({ ...er, drug: "" })); }}
                        />
                      )}
                    </td>
                    {manualMode && <td><input className="med-inline-inp" style={{ background: "#fff", borderWidth: 1, borderStyle: "solid", borderColor: "#1a73e8" }} placeholder="Generic Name" value={manualGeneric} onChange={e => setManualGeneric(e.target.value)} /></td>}
                    {manualMode && <td><input className="med-inline-inp" style={{ background: "#fff", borderWidth: 1, borderStyle: "solid", borderColor: "#1a73e8" }} placeholder="Strength" value={manualStrength} onChange={e => setManualStrength(e.target.value)} /></td>}
                    <td>
                      <input className={`med-inline-inp${newErrors.route ? " med-inline-inp-error" : ""}`} style={{ background: "#fff", borderWidth: 1, borderStyle: "solid", borderColor: newErrors.route ? "#e05252" : "#e0e3ef" }} placeholder="Route *" value={newForm.route} onChange={e => { setNewForm(f => ({ ...f, route: e.target.value })); setNewErrors(er => ({ ...er, route: "" })); }} />
                      {newErrors.route && <div className="med-inline-error">{newErrors.route}</div>}
                    </td>
                    <td>
                      <select className={`med-inline-inp${newErrors.frequency ? " med-inline-inp-error" : ""}`} style={{ background: "#fff", borderWidth: 1, borderStyle: "solid", borderColor: newErrors.frequency ? "#e05252" : "#e0e3ef" }} value={newForm.frequency} onChange={e => { setNewForm(f => ({ ...f, frequency: e.target.value })); setNewErrors(er => ({ ...er, frequency: "" })); }}>
                        <option value="">Freq *</option>
                        {FREQ_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                      {newErrors.frequency && <div className="med-inline-error">{newErrors.frequency}</div>}
                    </td>
                    <td>
                      <input className={`med-inline-inp${newErrors.days ? " med-inline-inp-error" : ""}`} style={{ background: "#fff", borderWidth: 1, borderStyle: "solid", borderColor: newErrors.days ? "#e05252" : "#e0e3ef" }} placeholder="Days *" value={newForm.days} onChange={e => { setNewForm(f => ({ ...f, days: e.target.value })); setNewErrors(er => ({ ...er, days: "" })); }} />
                      {newErrors.days && <div className="med-inline-error">{newErrors.days}</div>}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="med-save-btn" onClick={handleSaveFull} disabled={addSaving}>{addSaving ? "..." : <Save size={13} />}</button>
                        <button className="med-cancel-btn" onClick={handleCancelAddFull}><X size={13} /></button>
                      </div>
                      {manualMode && (
                        <div className="med-back-to-search" onClick={() => { setManualMode(false); setManualBrand(""); setManualGeneric(""); setManualStrength(""); }}>
                          <RotateCcw size={10} />Back to search
                        </div>
                      )}
                    </td>
                  </tr>
                )}

                {medications.length === 0 && !showAddRow && (
                  <tr><td colSpan={8} className="med-empty">No medications added yet. Click "Add Medication" to begin.</td></tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      <div className="med-footer">
        {!showAddRow
          ? <div className="med-add-btn" onClick={() => setShowAddRow(true)}><Plus size={14} />Add Medication</div>
          : <div />}
        {medications.length > 0 && !showAddRow && (
          <button
            className={agentLoading ? "med-stop-btn" : "med-analyse-btn"}
            onClick={agentLoading ? onInterrupt : triggerAnalysis}
            style={agentLoading ? {} : { background: "linear-gradient(135deg, #1a73e8, #1558b0)", boxShadow: "0 2px 8px rgba(26,115,232,0.3)" }}
          >
            {agentLoading
              ? <><div className="med-analyse-spinner" style={{ borderTopColor: "#e05252", borderColor: "rgba(224,82,82,0.3)" }} /><StopCircle size={13} />Stop Analysis</>
              : agentResult || wasInterrupted
                ? <><RotateCcw size={13} />Re-analyse</>
                : <><CheckCircle2 size={13} />Done — Run Analysis</>}
          </button>
        )}
      </div>

      {dupWarning && (
        <div className="med-dup-overlay">
          <div className="med-dup-modal">
            <AlertTriangle size={32} color="#f59e0b" style={{ marginBottom: 8 }} />
            <div className="med-dup-title">Medication Already Exists</div>
            <div className="med-dup-body">This medication (Brand, Generic &amp; Strength) is already in the list. You cannot add a duplicate.</div>
            <button className="med-dup-btn" onClick={() => setDupWarning(false)}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MedicationList;