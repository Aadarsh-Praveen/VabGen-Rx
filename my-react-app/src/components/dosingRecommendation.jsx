import "../components/styles/dosingRecommendation.css";

const SevPills = ({ tabs, active, onSelect }) => (
  <div className="dose-pills">
    {tabs.map(t => (
      <button
        key={t.key}
        className="dose-pill"
        onClick={() => onSelect(t.key)}
        style={{
          border:     `1.5px solid ${active === t.key ? t.border : "#e0e3ef"}`,
          background: active === t.key ? t.bg : "#fff",
          color:      active === t.key ? t.color : "#888",
        }}
      >
        {t.label}
        {t.items.length > 0 && (
          <span
            className="dose-pill-count"
            style={{ background: t.color }}
          >
            {t.items.length}
          </span>
        )}
      </button>
    ))}
  </div>
);

const DosingRecommendation = ({
  agentResult,
  agentLoading,
  doseTab,
  setDoseTab,
}) => {
  const dosingRecs = agentResult?.dosing_recommendations || [];
  const adjusted   = dosingRecs.filter(r => r.adjustment_required);
  const highItems  = adjusted.filter(r => r.urgency === "high");
  const medItems   = adjusted.filter(r => r.urgency !== "high");

  const doseTabs = [
    {
      key: "high",   label: "High",
      color: "#e05252", bg: "#fff0f0", border: "#fca5a5",
      items: highItems,
    },
    {
      key: "medium", label: "Medium",
      color: "#f59e0b", bg: "#fff7ed", border: "#fcd34d",
      items: medItems,
    },
  ];

  const activeItems = doseTab === "high" ? highItems : medItems;

  return (
    <div className="dose-card">

      {/* ── Header ── */}
      <div className="dose-header">
        <span className="dose-title">
          📋 Dosing Recommendation
          {adjusted.length > 0 && (
            <span className="dose-count-badge">
              {adjusted.length}
            </span>
          )}
        </span>
      </div>

      <div className="dose-body">

        {/* ── Loading ── */}
        {agentLoading && (
          <p className="dose-loading">
            ⏳ Fetching FDA dosing data...
          </p>
        )}

        {/* ── Empty state ── */}
        {!agentLoading && dosingRecs.length === 0 && (
          <p className="dose-empty">
            Add medications and click{" "}
            <strong>Done — Run Analysis</strong>.
          </p>
        )}

        {/* ── Results ── */}
        {!agentLoading && dosingRecs.length > 0 && (
          <>
            <SevPills
              tabs={doseTabs}
              active={doseTab}
              onSelect={setDoseTab}
            />

            {activeItems.length === 0 ? (
              <p className="dose-ok">
                ✅ No{" "}
                {doseTab === "high"
                  ? "high urgency"
                  : "medium urgency"
                } dose adjustments.
              </p>
            ) : activeItems.map((r, i) => (
              <div
                key={i}
                className={`dose-item ${
                  doseTab === "high"
                    ? "dose-item-high"
                    : "dose-item-medium"
                }`}
              >
                {/* ── Header row ── */}
                <div className="dose-item-top">
                  <div className="dose-tag">
                    ⚠ {(r.adjustment_type || "DOSE").toUpperCase()}
                    {" "}ADJUSTMENT — {r.drug}
                  </div>

                  {/* ── Evidence tier ─────────────────────────────
                      Shows FDA sections count + confidence range.
                      Reads from:
                        r.evidence.fda_label_sections_count
                          (new architecture)
                        r.evidence_tier_info
                          (flat fallback from original dosing service)
                      Gracefully shows nothing if fields missing.
                  ─────────────────────────────────────────────── */}
                  {(
                    r.evidence?.fda_label_sections_count > 0 ||
                    r.evidence_tier_info?.tier
                  ) && (
                    <span className="dose-partial-label">
                      📋{" "}
                      {r.evidence?.fda_label_sections_count
                        ? `${r.evidence.fda_label_sections_count} FDA sections`
                        : r.evidence_tier_info?.tier_name || "FDA Label"
                      }
                      {(
                        r.evidence?.confidence ||
                        r.evidence_confidence  ||
                        r.evidence_tier_info?.confidence
                      )
                        ? ` · ${
                            r.evidence?.confidence ||
                            r.evidence_confidence  ||
                            r.evidence_tier_info?.confidence
                          }`
                        : ""
                      }
                    </span>
                  )}
                </div>

                {/* ── Dose change ── */}
                <div className="dose-text">
                  <strong>Current:</strong>{" "}
                  {r.current_dose || "not specified"}
                  &nbsp;&nbsp;
                  <strong>→ Recommended:</strong>{" "}
                  {r.recommended_dose}
                </div>

                {/* ── Reason ── */}
                {r.adjustment_reason && (
                  <div
                    className="dose-text"
                    style={{ marginTop: 4 }}
                  >
                    {r.adjustment_reason}
                  </div>
                )}

                {/* ── Monitor ── */}
                {r.monitoring_required && (
                  <div className="dose-text dose-monitor-text">
                    📊 Monitor: {r.monitoring_required}
                  </div>
                )}

                {/* ── Hold threshold ── */}
                {r.hold_threshold && (
                  <div className="dose-text dose-hold-text">
                    🛑 Hold if: {r.hold_threshold}
                  </div>
                )}

                {/* ── Patient flags ──────────────────────────────
                    Small grey pill tags showing which patient
                    values drove this dosing decision.
                    Reads from r.evidence.patient_flags_used
                    (new architecture) or r.patient_flags_used
                    (flat fallback).
                    Shows nothing if field missing — backward
                    compatible with old cached results.
                ─────────────────────────────────────────────── */}
                {(
                  r.evidence?.patient_flags_used?.length > 0 ||
                  r.patient_flags_used?.length > 0
                ) && (
                  <div style={{
                    marginTop: 8,
                    display:   "flex",
                    gap:       4,
                    flexWrap:  "wrap",
                  }}>
                    {(
                      r.evidence?.patient_flags_used ||
                      r.patient_flags_used
                    ).map((flag, fi) => (
                      <span
                        key={fi}
                        style={{
                          background:   "#f0f0f8",
                          color:        "#555",
                          border:       "1px solid #e0e3ef",
                          borderRadius: 20,
                          padding:      "2px 8px",
                          fontSize:     "10px",
                          fontWeight:   600,
                        }}
                      >
                        {flag}
                      </span>
                    ))}
                  </div>
                )}

              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default DosingRecommendation;