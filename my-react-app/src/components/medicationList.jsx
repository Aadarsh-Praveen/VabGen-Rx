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
  searchInputRef,
}) => {
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
                        {openMenu === m.ID && (
                          <div className="med-dropdown" style={{ top: menuPos.top, left: menuPos.left }}>
                            {isEditing
                              ? <div className="med-drop-item" style={{ color: "#1a73e8", fontWeight: 700 }} onClick={() => handleSaveEdit(m.ID)}>💾 Save</div>
                              : <div className="med-drop-item" onClick={() => handleEdit(m)}>✏️ Edit</div>}
                            <div className="med-drop-item" onClick={() => handleHold(m.ID)}>{m.held ? "▶️ Resume" : "⏸ Hold"}</div>
                            <div className="med-drop-item med-drop-warn" onClick={() => handleDelete(m.ID)}>🗑 Delete</div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* ── Add Row ── */}
                {showAddRow && (
                  <tr className="med-add-row">
                    <td className="med-sno" style={{ color: "#1a73e8" }}>+</td>
                    <td colSpan={3} style={{ position: "relative", overflow: "visible" }}>
                      <input
                        ref={searchInputRef}
                        className="med-search-inp"
                        placeholder="🔍 Search brand or generic name..."
                        value={searchQ}
                        onChange={e => { handleSearch(e.target.value); updateDropdownPos(); }}
                        onFocus={updateDropdownPos}
                      />
                      {newErrors.drug && <div className="med-inline-error">{newErrors.drug}</div>}
                      {(searching || searchResults.length > 0) && (
                        <div className="med-search-dropdown" style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width || 320 }}>
                          {searching && <div className="med-search-loading">Searching...</div>}
                          {!searching && searchResults.length === 0 && <div className="med-search-loading">No results found.</div>}
                          {searchResults.map((d, i) => (
                            <div key={i} className="med-search-option" onClick={() => handleSelectDrug(d)}>
                              <div className="med-search-brand">{d.Brand_Name}</div>
                              <div className="med-search-meta">{d.Generic_Name} · {d.Strength} · Stock: {d.Stocks}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <input className={`med-inline-inp${newErrors.route ? " med-inline-inp-error" : ""}`} style={{ background: "#fff", borderWidth: 1, borderStyle: "solid", borderColor: newErrors.route ? "#e05252" : "#e0e3ef" }} placeholder="Route *" value={newForm.route} onChange={e => { setNewForm(f => ({ ...f, route: e.target.value })); setNewErrors(er => ({ ...er, route: "" })); }} />
                      {newErrors.route && <div className="med-inline-error">{newErrors.route}</div>}
                    </td>
                    <td>
                      <input className={`med-inline-inp${newErrors.frequency ? " med-inline-inp-error" : ""}`} style={{ background: "#fff", borderWidth: 1, borderStyle: "solid", borderColor: newErrors.frequency ? "#e05252" : "#e0e3ef" }} placeholder="Freq *" value={newForm.frequency} onChange={e => { setNewForm(f => ({ ...f, frequency: e.target.value })); setNewErrors(er => ({ ...er, frequency: "" })); }} />
                      {newErrors.frequency && <div className="med-inline-error">{newErrors.frequency}</div>}
                    </td>
                    <td>
                      <input className={`med-inline-inp${newErrors.days ? " med-inline-inp-error" : ""}`} style={{ background: "#fff", borderWidth: 1, borderStyle: "solid", borderColor: newErrors.days ? "#e05252" : "#e0e3ef" }} placeholder="Days *" value={newForm.days} onChange={e => { setNewForm(f => ({ ...f, days: e.target.value })); setNewErrors(er => ({ ...er, days: "" })); }} />
                      {newErrors.days && <div className="med-inline-error">{newErrors.days}</div>}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="med-save-btn" onClick={handleAutoSave} disabled={addSaving}>{addSaving ? "..." : "💾"}</button>
                        <button className="med-cancel-btn" onClick={handleCancelAdd}>✕</button>
                      </div>
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
            className="med-analyse-btn"
            onClick={triggerAnalysis}
            disabled={agentLoading}
            style={{ background: agentLoading ? "#94a3b8" : "linear-gradient(135deg, #1a73e8, #1558b0)", boxShadow: agentLoading ? "none" : "0 2px 8px rgba(26,115,232,0.3)" }}
          >
            {agentLoading
              ? <><div className="med-analyse-spinner" />Analysing...</>
              : agentResult ? <>🔄 Re-analyse</> : <>✅ Done — Run Analysis</>}
          </button>
        )}
      </div>
    </div>
  );
};

export default MedicationList;