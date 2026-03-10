import { useState, useCallback } from "react";
import { ClipboardList, AlertTriangle, BarChart2, OctagonX, Activity, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import "../components/styles/dosingRecommendation.css";

const FdaLabelLink = ({ drug, children, className }) => {
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res     = await fetch(`https://api.fda.gov/drug/label.json?search=openfda.generic_name:"${encodeURIComponent(drug.trim())}"&limit=5`);
      const data    = await res.json();
      const results = data?.results || [];
      const lower   = drug.trim().toLowerCase();
      let best = results.find(r => (r?.openfda?.generic_name || []).some(n => n.toLowerCase() === lower));
      if (!best) best = results.find(r => (r?.openfda?.generic_name || []).some(n => n.toLowerCase().includes(lower) && !n.toLowerCase().includes(" and ")));
      if (!best) best = results[0];
      const setId = best?.openfda?.spl_set_id?.[0];
      if (setId) window.open(`https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setId}`, "_blank");
      else window.open(`https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=${encodeURIComponent(drug.trim())}`, "_blank");
    } catch {
      window.open(`https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=${encodeURIComponent(drug.trim())}`, "_blank");
    } finally { setLoading(false); }
  }, [drug]);

  return (
    <button onClick={handleClick} className={className || "dose-partial-label"} title="Click to view FDA label on DailyMed" disabled={loading}
      style={{ background: "none", border: "1px solid #e0e3ef", cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1, textDecoration: "none", padding: "2px 8px", borderRadius: 20, fontSize: "0.75rem", fontWeight: 600, color: "#555", display: "inline-flex", alignItems: "center", gap: 4 }}>
      {loading ? <><Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />Loading...</> : <>{children}<ExternalLink size={10} /></>}
    </button>
  );
};

const SevPills = ({ tabs, active, onSelect }) => (
  <div className="dose-pills">
    {tabs.map(t => (
      <button key={t.key} className="dose-pill" onClick={() => onSelect(t.key)}
        style={{ border: `1.5px solid ${active === t.key ? t.border : "#e0e3ef"}`, background: active === t.key ? t.bg : "#fff", color: active === t.key ? t.color : "#888" }}>
        {t.label}
        {t.items.length > 0 && <span className="dose-pill-count" style={{ background: t.color }}>{t.items.length}</span>}
      </button>
    ))}
  </div>
);

const needsAdjustment = (r) => {
  if (r.adjustment_required) return true;
  if (!r.recommended_dose)   return false;
  const rec = r.recommended_dose.trim().toLowerCase();
  if (rec === "no change required") return false;
  if (!r.current_dose) return true;
  return rec !== r.current_dose.trim().toLowerCase();
};

const validHold = (val) => val && val !== "null" && val !== "NULL" && val.trim() !== "";

const normalizeFlags = (flags) => {
  if (!flags) return [];
  if (Array.isArray(flags) && flags.length > 0)
    return [...new Set(flags.map(f => f.trim()).filter(Boolean))];
  const raw = Array.isArray(flags) ? flags.join(" ") : String(flags);
  if (/[,;|]/.test(raw))
    return [...new Set(raw.split(/[,;|]/).map(s => s.trim()).filter(Boolean))];
  const pills = [];
  if (/adult/i.test(raw))              pills.push("adult");
  if (/elderly/i.test(raw))            pills.push("elderly");
  if (/pediatric/i.test(raw))          pills.push("pediatric");
  const wMatch = raw.match(/weight[:\s]*([\d.]+\s*kg)/i);
  if (wMatch) pills.push(`weight: ${wMatch[1]}`);
  const eMatch = raw.match(/eGFR[:\s]*([\d.]+)/i);
  if (eMatch) pills.push(`eGFR: ${eMatch[1]}`);
  const bMatch = raw.match(/bilirubin[:\s]*([\d.]+\s*mg\/dL)/i);
  if (bMatch) pills.push(`bilirubin: ${bMatch[1]}`);
  if (/normal renal/i.test(raw))       pills.push("normal renal function");
  if (/normal hepatic/i.test(raw))     pills.push("normal hepatic function");
  if (/renal impairment/i.test(raw))   pills.push("renal impairment");
  if (/hepatic impairment/i.test(raw)) pills.push("hepatic impairment");
  return pills;
};

const DosingRecommendation = ({ agentResult, agentLoading, doseTab, setDoseTab }) => {
  const dosingRecs = agentResult?.dosing_recommendations || [];
  const adjusted   = dosingRecs.filter(needsAdjustment);
  const highItems  = adjusted.filter(r => r.urgency === "high");
  const medItems   = adjusted.filter(r => r.urgency !== "high");
  const activeItems = doseTab === "high" ? highItems : medItems;

  const doseTabs = [
    { key: "high",   label: "High",   color: "#e05252", bg: "#fff0f0", border: "#fca5a5", items: highItems },
    { key: "medium", label: "Medium", color: "#f59e0b", bg: "#fff7ed", border: "#fcd34d", items: medItems  },
  ];

  return (
    <div className="dose-card">
      <div className="dose-header">
        <span className="dose-title">
          <ClipboardList size={14} strokeWidth={2.5} />
          Dosing Recommendation
          {adjusted.length > 0 && <span className="dose-count-badge">{adjusted.length}</span>}
        </span>
      </div>

      <div className="dose-body">
        {agentLoading && (
          <p className="dose-loading" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Activity size={14} style={{ animation: "pulse 1.5s ease-in-out infinite" }} />
            Fetching FDA dosing data...
          </p>
        )}

        {!agentLoading && dosingRecs.length === 0 && (
          <p className="dose-empty">Add medications and click <strong>Done — Run Analysis</strong>.</p>
        )}

        {!agentLoading && dosingRecs.length > 0 && (
          <>
            <SevPills tabs={doseTabs} active={doseTab} onSelect={setDoseTab} />

            {activeItems.length === 0 ? (
              <p className="dose-ok" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <CheckCircle2 size={14} />No {doseTab === "high" ? "high urgency" : "medium urgency"} dose adjustments.
              </p>
            ) : activeItems.map((r, i) => (
              <div key={i} className={`dose-item ${doseTab === "high" ? "dose-item-high" : "dose-item-medium"}`}>
                <div className="dose-item-top">
                  <div className="dose-tag" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <AlertTriangle size={12} />
                    {(!r.adjustment_type || r.adjustment_type === "none" ? "DOSE" : r.adjustment_type.toUpperCase())} ADJUSTMENT — {r.drug}
                  </div>
                  {(r.evidence?.fda_label_sections_count > 0 || r.evidence_tier_info?.tier) && (
                    <FdaLabelLink drug={r.drug}>
                      {r.evidence?.fda_label_sections_count ? `${r.evidence.fda_label_sections_count} FDA sections` : r.evidence_tier_info?.tier_name || "FDA Label"}
                      {(r.evidence?.confidence || r.evidence_confidence || r.evidence_tier_info?.confidence) ? ` · ${r.evidence?.confidence || r.evidence_confidence || r.evidence_tier_info?.confidence}` : ""}
                    </FdaLabelLink>
                  )}
                </div>

                <div className="dose-text">
                  <strong>Current:</strong> {r.current_dose || "not specified"}&nbsp;&nbsp;
                  <strong>→ Recommended:</strong> {r.recommended_dose}
                </div>

                {r.adjustment_reason && <div className="dose-text" style={{ marginTop: 4 }}>{r.adjustment_reason}</div>}

                {r.monitoring_required && (
                  <div className="dose-text dose-monitor-text" style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
                    <BarChart2 size={12} />Monitor: {r.monitoring_required}
                  </div>
                )}

                {validHold(r.hold_threshold) && (
                  <div className="dose-text dose-hold-text" style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
                    <OctagonX size={12} />Hold if: {r.hold_threshold}
                  </div>
                )}

                {(() => {
                  const flags = normalizeFlags(r.evidence?.patient_flags_used || r.patient_flags_used);
                  if (!flags.length) return null;
                  return (
                    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {flags.map((flag, fi) => (
                        <span key={fi} className="dose-flag-tag">{flag}</span>
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