import { useState } from "react";
import { createPortal } from "react-dom";
import "../components/styles/medicationList.css";

const MedicationList = ({
  medications,
  medLoading,
  showAddRow,
  setShowAddRow,
  searchQ,
  searchResults,
  searching,
  newMed,
  newForm,
  setNewForm,
  newErrors,
  setNewErrors,
  addSaving,
  editingId,
  editValues,
  setEditValues,
  openMenu,
  menuPos,
  dropdownPos,
  agentLoading,
  agentResult,
  wasInterrupted,
  handleSearch,
  handleSelectDrug,
  handleAutoSave,
  handleCancelAdd,
  handleEdit,
  handleSaveEdit,
  handleHold,
  handleDelete,
  handleMenuOpen,
  updateDropdownPos,
  triggerAnalysis,
  onInterrupt,
  searchInputRef,
}) => {
  // ── Manual entry state ─────────────────────────────────────────
  // Activated when doctor clicks "Add manually" after no inventory match
  const [manualMode,    setManualMode]    = useState(false);
  const [manualBrand,   setManualBrand]   = useState("");
  const [manualGeneric, setManualGeneric] = useState("");
  const [manualStrength,setManualStrength]= useState("");

  // Reset manual fields when add-row is cancelled
  const handleCancelAddFull = () => {
    setManualMode(false);
    setManualBrand("");
    setManualGeneric("");
    setManualStrength("");
    handleCancelAdd();
  };

  // Save handler — builds a synthetic drug object for manual entries
  // so handleAutoSave can use the same path without touching inventory
  const handleSaveFull = () => {
    if (manualMode) {
      // Inject manual drug into newMed before saving
      // handleSelectDrug sets the drug object that handleAutoSave reads
      handleSelectDrug({
        Brand_Name:   manualBrand.trim()    || manualGeneric.trim(),
        Generic_Name: manualGeneric.trim()  || manualBrand.trim(),
        Strength:     manualStrength.trim() || "",
        Stocks:       "N/A",
        manual:       true, // flag so parent knows it's not from inventory
      });
      // Small delay so state updates before handleAutoSave reads newMed
      setTimeout(() => handleAutoSave(), 0);
    } else {
      handleAutoSave();
    }
  };

  // Show "Add manually" button when search has text but no results
  const showManualTrigger =
    !searching &&
    searchQ.trim().length >= 2 &&
    searchResults.length === 0 &&
    !newMed &&
    !manualMode;

  return (
    <div className="med-card">
      {/* ── Header ── */}
      <div className="med-header">
        <span className="med-title">💊 Medication List</span>
        <span className="med-count">{medications.length} medication{medications.length !== 1 ? "s" : ""}</span>
      </div>

      {/* ── Table ── */}
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
                        {m.Brand_Name}
                        {m.held && <span className="med-hold-tag">HOLD</span>}
                      </td>
                      <td className="med-generic">{m.Generic_Name}</td>
                      <td className="med-strength">{m.Strength}</td>
                      <td>
                        {isEditing
                          ? <input className="med-inline-inp" style={{ borderColor: "#1a73e8", background: "#fff", borderWidth: 1, borderStyle: "solid" }} value={editValues.route} autoFocus placeholder="Route" onChange={e => setEditValues(v => ({ ...v, route: e.target.value }))} />
                          : <span>{m.Route || "—"}</span>}
                      </td>
                      <td>
                        {isEditing
                          ? <input className="med-inline-inp" style={{ borderColor: "#1a73e8", background: "#fff", borderWidth: 1, borderStyle: "solid" }} value={editValues.frequency} placeholder="Freq" onChange={e => setEditValues(v => ({ ...v, frequency: e.target.value }))} />
                          : <span>{m.Frequency || "—"}</span>}
                      </td>
                      <td>
                        {isEditing
                          ? <input className="med-inline-inp" style={{ borderColor: "#1a73e8", background: "#fff", borderWidth: 1, borderStyle: "solid" }} value={editValues.days} placeholder="Days" onChange={e => setEditValues(v => ({ ...v, days: e.target.value }))} />
                          : <span>{m.Days || "—"}</span>}
                      </td>
                      <td style={{ position: "relative" }}>
                        <button className="med-menu-btn" onClick={e => handleMenuOpen(e, m.ID)}>⋮</button>
                        {openMenu === m.ID && createPortal(
                          <div className="med-dropdown" style={{ top: menuPos.top, left: menuPos.left }}>
                            {isEditing
                              ? <div className="med-drop-item" style={{ color: "#1a73e8", fontWeight: 700 }} onClick={() => handleSaveEdit(m.ID)}>💾 Save</div>
                              : <div className="med-drop-item" onClick={() => handleEdit(m)}>✏️ Edit</div>}
                            <div className="med-drop-item" onClick={() => handleHold(m.ID)}>{m.held ? "▶️ Resume" : "⏸ Hold"}</div>
                            <div className="med-drop-item med-drop-warn" onClick={() => handleDelete(m.ID)}>🗑 Delete</div>
                          </div>,
                          document.body
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* ── Add Row ── */}
                {showAddRow && (
                  <tr className="med-add-row">
                    <td className="med-sno" style={{ color: "#1a73e8" }}>+</td>

                    {/* ── Drug search / manual fields ── */}
                    <td colSpan={manualMode ? 1 : 3} style={{ position: "relative", overflow: "visible" }}>
                      {!manualMode ? (
                        <>
                          <input
                            ref={searchInputRef}
                            className="med-search-inp"
                            placeholder="🔍 Search brand or generic name..."
                            value={searchQ}
                            onChange={e => { handleSearch(e.target.value); updateDropdownPos(); }}
                            onFocus={updateDropdownPos}
                          />
                          {newErrors.drug && <div className="med-inline-error">{newErrors.drug}</div>}

                          {/* Inventory search dropdown */}
                          {(searching || searchResults.length > 0 || showManualTrigger) && (
                            <div className="med-search-dropdown" style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width || 320 }}>
                              {searching && <div className="med-search-loading">Searching...</div>}

                              {/* Results */}
                              {!searching && searchResults.map((d, i) => (
                                <div key={i} className="med-search-option" onClick={() => handleSelectDrug(d)}>
                                  <div className="med-search-brand">{d.Brand_Name}</div>
                                  <div className="med-search-meta">{d.Generic_Name} · {d.Strength} · Stock: {d.Stocks}</div>
                                </div>
                              ))}

                              {/* No results + manual trigger */}
                              {showManualTrigger && (
                                <div style={{ borderTop: searchResults.length > 0 ? "1px solid #f0f0f8" : "none" }}>
                                  <div className="med-search-loading" style={{ color: "#aaa" }}>
                                    No results for "{searchQ}"
                                  </div>
                                  <div
                                    className="med-search-option"
                                    style={{ color: "#1a73e8", fontWeight: 600, fontSize: "0.8rem" }}
                                    onClick={() => {
                                      setManualMode(true);
                                      setManualBrand(searchQ.trim());
                                    }}
                                  >
                                    ✏️ Add "{searchQ}" manually
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        /* ── Brand Name manual input ── */
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

                    {/* ── Generic Name (manual only) ── */}
                    {manualMode && (
                      <td>
                        <input
                          className="med-inline-inp"
                          style={{ background: "#fff", borderWidth: 1, borderStyle: "solid", borderColor: "#1a73e8" }}
                          placeholder="Generic Name"
                          value={manualGeneric}
                          onChange={e => setManualGeneric(e.target.value)}
                        />
                      </td>
                    )}

                    {/* ── Strength (manual only) ── */}
                    {manualMode && (
                      <td>
                        <input
                          className="med-inline-inp"
                          style={{ background: "#fff", borderWidth: 1, borderStyle: "solid", borderColor: "#1a73e8" }}
                          placeholder="Strength"
                          value={manualStrength}
                          onChange={e => setManualStrength(e.target.value)}
                        />
                      </td>
                    )}

                    {/* ── Route ── */}
                    <td>
                      <input
                        className={`med-inline-inp${newErrors.route ? " med-inline-inp-error" : ""}`}
                        style={{ background: "#fff", borderWidth: 1, borderStyle: "solid", borderColor: newErrors.route ? "#e05252" : "#e0e3ef" }}
                        placeholder="Route *"
                        value={newForm.route}
                        onChange={e => { setNewForm(f => ({ ...f, route: e.target.value })); setNewErrors(er => ({ ...er, route: "" })); }}
                      />
                      {newErrors.route && <div className="med-inline-error">{newErrors.route}</div>}
                    </td>

                    {/* ── Frequency ── */}
                    <td>
                      <input
                        className={`med-inline-inp${newErrors.frequency ? " med-inline-inp-error" : ""}`}
                        style={{ background: "#fff", borderWidth: 1, borderStyle: "solid", borderColor: newErrors.frequency ? "#e05252" : "#e0e3ef" }}
                        placeholder="Freq *"
                        value={newForm.frequency}
                        onChange={e => { setNewForm(f => ({ ...f, frequency: e.target.value })); setNewErrors(er => ({ ...er, frequency: "" })); }}
                      />
                      {newErrors.frequency && <div className="med-inline-error">{newErrors.frequency}</div>}
                    </td>

                    {/* ── Days ── */}
                    <td>
                      <input
                        className={`med-inline-inp${newErrors.days ? " med-inline-inp-error" : ""}`}
                        style={{ background: "#fff", borderWidth: 1, borderStyle: "solid", borderColor: newErrors.days ? "#e05252" : "#e0e3ef" }}
                        placeholder="Days *"
                        value={newForm.days}
                        onChange={e => { setNewForm(f => ({ ...f, days: e.target.value })); setNewErrors(er => ({ ...er, days: "" })); }}
                      />
                      {newErrors.days && <div className="med-inline-error">{newErrors.days}</div>}
                    </td>

                    {/* ── Save / Cancel ── */}
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="med-save-btn" onClick={handleSaveFull} disabled={addSaving}>
                          {addSaving ? "..." : "💾"}
                        </button>
                        <button className="med-cancel-btn" onClick={handleCancelAddFull}>✕</button>
                      </div>
                      {manualMode && (
                        <div
                          style={{ fontSize: "0.62rem", color: "#f59e0b", marginTop: 3, whiteSpace: "nowrap", cursor: "pointer" }}
                          onClick={() => { setManualMode(false); setManualBrand(""); setManualGeneric(""); setManualStrength(""); }}
                        >
                          ← Back to search
                        </div>
                      )}
                    </td>
                  </tr>
                )}

                {medications.length === 0 && !showAddRow && (
                  <tr><td colSpan={8} className="med-empty">No medications added yet. Click "+ Add Medication" to begin.</td></tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer ── */}
      <div className="med-footer">
        {!showAddRow
          ? <div className="med-add-btn" onClick={() => setShowAddRow(true)}>+ Add Medication</div>
          : <div />}

        {medications.length > 0 && !showAddRow && (
          <button
            className={agentLoading ? "med-stop-btn" : "med-analyse-btn"}
            onClick={agentLoading ? onInterrupt : triggerAnalysis}
            style={agentLoading ? {} : {
              background: "linear-gradient(135deg, #1a73e8, #1558b0)",
              boxShadow: "0 2px 8px rgba(26,115,232,0.3)",
            }}
          >
            {agentLoading ? (
              <>
                <div className="med-analyse-spinner" style={{ borderTopColor: "#e05252", borderColor: "rgba(224,82,82,0.3)" }} />
                Stop Analysis
              </>
            ) : agentResult || wasInterrupted ? (
              <>🔄 Re-analyse</>
            ) : (
              <>✅ Done — Run Analysis</>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default MedicationList;