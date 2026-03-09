/*
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

      {/* ── Header ── *}
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

        {/* ── Loading ── *}
        {agentLoading && (
          <p className="dose-loading">
            ⏳ Fetching FDA dosing data...
          </p>
        )}

        {/* ── Empty state ── *}
        {!agentLoading && dosingRecs.length === 0 && (
          <p className="dose-empty">
            Add medications and click{" "}
            <strong>Done — Run Analysis</strong>.
          </p>
        )}

        {/* ── Results ── *}
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
                {/* ── Header row ── *}
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
                  ─────────────────────────────────────────────── *}
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

                {/* ── Dose change ── *}
                <div className="dose-text">
                  <strong>Current:</strong>{" "}
                  {r.current_dose || "not specified"}
                  &nbsp;&nbsp;
                  <strong>→ Recommended:</strong>{" "}
                  {r.recommended_dose}
                </div>

                {/* ── Reason ── *}
                {r.adjustment_reason && (
                  <div
                    className="dose-text"
                    style={{ marginTop: 4 }}
                  >
                    {r.adjustment_reason}
                  </div>
                )}

                {/* ── Monitor ── *}
                {r.monitoring_required && (
                  <div className="dose-text dose-monitor-text">
                    📊 Monitor: {r.monitoring_required}
                  </div>
                )}

                {/* ── Hold threshold ── *}
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
                ─────────────────────────────────────────────── *}
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

export default DosingRecommendation;*/




import { useState, useCallback } from "react";
import "../components/styles/dosingRecommendation.css";

// ── Smart FDA Label Link ──────────────────────────────────────────
// Copied from drugInteractionWarning.jsx — queries OpenFDA API to
// get the exact DailyMed set_id for the drug, then opens the precise
// FDA label page. Falls back to DailyMed search if API call fails.
const FdaLabelLink = ({ drug, children, className }) => {
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const url     = `https://api.fda.gov/drug/label.json?search=openfda.generic_name:"${encodeURIComponent(drug.trim())}"&limit=5`;
      const res     = await fetch(url);
      const data    = await res.json();
      const results = data?.results || [];

      // ── Pick best match — avoid combination products ──────────
      const drugLower = drug.trim().toLowerCase();

      // Pass 1: exact match on generic_name
      let best = results.find(r =>
        (r?.openfda?.generic_name || []).some(
          n => n.toLowerCase() === drugLower
        )
      );
      // Pass 2: contains drug name but NOT a combination (" and ")
      if (!best) {
        best = results.find(r =>
          (r?.openfda?.generic_name || []).some(
            n => n.toLowerCase().includes(drugLower) &&
                 !n.toLowerCase().includes(" and ")
          )
        );
      }
      // Pass 3: first result as fallback
      if (!best) best = results[0];

      const setId = best?.openfda?.spl_set_id?.[0];
      if (setId) {
        window.open(
          `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setId}`,
          "_blank"
        );
      } else {
        window.open(
          `https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=${encodeURIComponent(drug.trim())}`,
          "_blank"
        );
      }
    } catch {
      window.open(
        `https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=${encodeURIComponent(drug.trim())}`,
        "_blank"
      );
    } finally {
      setLoading(false);
    }
  }, [drug]);

  return (
    <button
      onClick={handleClick}
      className={className || "dose-partial-label"}
      style={{
        background:     "none",
        border:         "1px solid #e0e3ef",
        cursor:         loading ? "wait" : "pointer",
        opacity:        loading ? 0.7 : 1,
        textDecoration: "none",
        padding:        "2px 8px",
        borderRadius:   20,
        fontSize:       "0.75rem",
        fontWeight:     600,
        color:          "#555",
      }}
      title="Click to view FDA label on DailyMed"
      disabled={loading}
    >
      {loading ? "⏳ Loading..." : children}
    </button>
  );
};

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
          <span className="dose-pill-count" style={{ background: t.color }}>
            {t.items.length}
          </span>
        )}
      </button>
    ))}
  </div>
);

// ── Helper: detect if a dose adjustment is actually needed ────────
const _needsAdjustment = (r) => {
  if (r.adjustment_required) return true;
  if (!r.recommended_dose)   return false;
  const rec = r.recommended_dose.trim().toLowerCase();
  if (rec === "no change required") return false;
  if (!r.current_dose) return true;
  return rec !== r.current_dose.trim().toLowerCase();
};

// ── Helper: sanitize hold_threshold ──────────────────────────────
const _validHold = (val) =>
  val && val !== "null" && val !== "NULL" && val.trim() !== "";

// ── Helper: normalize patient flags ──────────────────────────────
const _normalizeFlags = (flags) => {
  if (!flags) return [];
  if (Array.isArray(flags) && flags.length > 0) {
    return [...new Set(flags.map(f => f.trim()).filter(Boolean))];
  }
  const raw = Array.isArray(flags) ? flags.join(" ") : String(flags);
  if (/[,;|]/.test(raw)) {
    return [...new Set(raw.split(/[,;|]/).map(s => s.trim()).filter(Boolean))];
  }
  const pills = [];
  if (/adult/i.test(raw))           pills.push("adult");
  if (/elderly/i.test(raw))         pills.push("elderly");
  if (/pediatric/i.test(raw))       pills.push("pediatric");
  const wMatch = raw.match(/weight[:\s]*([\d.]+\s*kg)/i);
  if (wMatch) pills.push(`weight: ${wMatch[1]}`);
  const eMatch = raw.match(/eGFR[:\s]*([\d.]+)/i);
  if (eMatch) pills.push(`eGFR: ${eMatch[1]}`);
  const bMatch = raw.match(/bilirubin[:\s]*([\d.]+\s*mg\/dL)/i);
  if (bMatch) pills.push(`bilirubin: ${bMatch[1]}`);
  if (/normal renal/i.test(raw))        pills.push("normal renal function");
  if (/normal hepatic/i.test(raw))      pills.push("normal hepatic function");
  if (/renal impairment/i.test(raw))    pills.push("renal impairment");
  if (/hepatic impairment/i.test(raw))  pills.push("hepatic impairment");
  return pills;
};

const DosingRecommendation = ({
  agentResult,
  agentLoading,
  doseTab,
  setDoseTab,
}) => {
  const dosingRecs = agentResult?.dosing_recommendations || [];
  const adjusted   = dosingRecs.filter(_needsAdjustment);
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
          {adjusted.length > 0 && (
            <span className="dose-count-badge">{adjusted.length}</span>
          )}
        </span>
      </div>

      <div className="dose-body">

        {agentLoading && (
          <p className="dose-loading">⏳ Fetching FDA dosing data...</p>
        )}

        {!agentLoading && dosingRecs.length === 0 && (
          <p className="dose-empty">
            Add medications and click <strong>Done — Run Analysis</strong>.
          </p>
        )}

        {!agentLoading && dosingRecs.length > 0 && (
          <>
            <SevPills tabs={doseTabs} active={doseTab} onSelect={setDoseTab} />

            {activeItems.length === 0 ? (
              <p className="dose-ok">
                ✅ No {doseTab === "high" ? "high urgency" : "medium urgency"} dose adjustments.
              </p>
            ) : activeItems.map((r, i) => (
              <div
                key={i}
                className={`dose-item ${doseTab === "high" ? "dose-item-high" : "dose-item-medium"}`}
              >
                {/* ── Header row ── */}
                <div className="dose-item-top">
                  <div className="dose-tag">
                    ⚠ {(
                      !r.adjustment_type || r.adjustment_type === "none"
                        ? "DOSE"
                        : r.adjustment_type.toUpperCase()
                    )} ADJUSTMENT — {r.drug}
                  </div>

                  {/* ── Evidence tier badge — now clickable FDA link ──
                      Uses FdaLabelLink to open the exact DailyMed page
                      for this drug. Same behavior as the drug interaction
                      FDA badge — queries OpenFDA for set_id first,
                      falls back to DailyMed search.
                  ─────────────────────────────────────────────────── */}
                  {(
                    r.evidence?.fda_label_sections_count > 0 ||
                    r.evidence_tier_info?.tier
                  ) && (
                    <FdaLabelLink drug={r.drug}>
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
                    </FdaLabelLink>
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
                  <div className="dose-text" style={{ marginTop: 4 }}>
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
                {_validHold(r.hold_threshold) && (
                  <div className="dose-text dose-hold-text">
                    🛑 Hold if: {r.hold_threshold}
                  </div>
                )}

                {/* ── Patient flags ── */}
                {(() => {
                  const rawFlags = r.evidence?.patient_flags_used || r.patient_flags_used;
                  const flags    = _normalizeFlags(rawFlags);
                  if (!flags.length) return null;
                  return (
                    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {flags.map((flag, fi) => (
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
                            whiteSpace:   "nowrap",
                          }}
                        >
                          {flag}
                        </span>
                      ))}
                    </div>
                  );
                })()}

              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default DosingRecommendation;