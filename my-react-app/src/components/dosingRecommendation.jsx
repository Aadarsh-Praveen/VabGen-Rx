import "../components/styles/dosingRecommendation.css";

const SevPills = ({ tabs, active, onSelect }) => (
  <div className="dose-pills">
    {tabs.map(t => (
      <button
        key={t.key}
        className="dose-pill"
        onClick={() => onSelect(t.key)}
        style={{
          border: `1.5px solid ${active === t.key ? t.border : "#e0e3ef"}`,
          background: active === t.key ? t.bg : "#fff",
          color: active === t.key ? t.color : "#888",
        }}
      >
        {t.label}
        {t.items.length > 0 && (
          <span className="dose-pill-count" style={{ background: t.color }}>{t.items.length}</span>
        )}
      </button>
    ))}
  </div>
);

const DosingRecommendation = ({ agentResult, agentLoading, doseTab, setDoseTab }) => {
  const dosingRecs = agentResult?.dosing_recommendations || [];
  const adjusted   = dosingRecs.filter(r => r.adjustment_required);
  const highItems  = adjusted.filter(r => r.urgency === "high");
  const medItems   = adjusted.filter(r => r.urgency !== "high");

  const doseTabs = [
    { key: "high",   label: "High",   color: "#e05252", bg: "#fff0f0", border: "#fca5a5", items: highItems },
    { key: "medium", label: "Medium", color: "#f59e0b", bg: "#fff7ed", border: "#fcd34d", items: medItems  },
  ];
  const activeItems = doseTab === "high" ? highItems : medItems;

  return (
    <div className="dose-card">
      {/* ── Header ── */}
      <div className="dose-header">
        <span className="dose-title">
          📋 Dosing Recommendation
          {adjusted.length > 0 && <span className="dose-count-badge">{adjusted.length}</span>}
        </span>
      </div>

      <div className="dose-body">
        {/* Loading */}
        {agentLoading && <p className="dose-loading">⏳ Fetching FDA dosing data...</p>}

        {/* Empty state */}
        {!agentLoading && dosingRecs.length === 0 && (
          <p className="dose-empty">Add medications and click <strong>Done — Run Analysis</strong>.</p>
        )}

        {/* Results */}
        {!agentLoading && dosingRecs.length > 0 && (
          <>
            <SevPills tabs={doseTabs} active={doseTab} onSelect={setDoseTab} />
            {activeItems.length === 0 ? (
              <p className="dose-ok">✅ No {doseTab === "high" ? "high urgency" : "medium urgency"} dose adjustments.</p>
            ) : activeItems.map((r, i) => (
              <div key={i} className={`dose-item ${doseTab === "high" ? "dose-item-high" : "dose-item-medium"}`}>
                <div className="dose-item-top">
                  <div className="dose-tag">⚠ {(r.adjustment_type || "DOSE").toUpperCase()} ADJUSTMENT — {r.drug}</div>
                  {doseTab === "medium" && <span className="dose-partial-label">Partial FDA Label · 80–90%</span>}
                </div>
                <div className="dose-text"><strong>Current:</strong> {r.current_dose || "not specified"}&nbsp;&nbsp;<strong>→ Recommended:</strong> {r.recommended_dose}</div>
                {r.adjustment_reason   && <div className="dose-text" style={{ marginTop: 4 }}>{r.adjustment_reason}</div>}
                {r.monitoring_required && <div className="dose-text dose-monitor-text">📊 Monitor: {r.monitoring_required}</div>}
                {r.hold_threshold      && <div className="dose-text dose-hold-text">🛑 Hold if: {r.hold_threshold}</div>}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default DosingRecommendation;