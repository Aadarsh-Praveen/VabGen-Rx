import "../components/styles/drugInteractionWarning.css";
import { useState, useCallback } from "react";
import { AlertTriangle, BookOpen, Building2, Pill, ClipboardList, XCircle, Utensils, Clock, Eye, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";

const pubmedUrl = (drug1, drug2 = null) => {
  const query = drug2 ? `${drug1.trim()} ${drug2.trim()} drug interaction` : `${drug1.trim()} drug interaction`;
  return `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(query)}&sort=relevance`;
};

const fdaReportsUrl = () => `https://www.fda.gov/drugs/drug-approvals-and-databases/fda-adverse-event-reporting-system-faers`;

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
    <button onClick={handleClick} className={className || "dint-source-tag"} title="Click to view FDA label" disabled={loading}
      style={{ background: "none", border: "1px solid #e0e3ef", cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1, textDecoration: "none", padding: "2px 8px", borderRadius: 20, fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: 4 }}>
      {loading ? <><Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />Loading...</> : <>{children}<ExternalLink size={10} /></>}
    </button>
  );
};

const EvidenceLink = ({ href, children }) => (
  <a href={href} target="_blank" rel="noreferrer" className="dint-source-tag" title="Click to view evidence"
    style={{ textDecoration: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
    {children}<ExternalLink size={10} />
  </a>
);

const SevPills = ({ tabs, active, onSelect }) => (
  <div className="dint-pills">
    {tabs.map(t => (
      <button key={t.key} className="dint-pill" onClick={() => onSelect(t.key)}
        style={{ border: `1.5px solid ${active === t.key ? t.border : "#e0e3ef"}`, background: active === t.key ? t.bg : "#fff", color: active === t.key ? t.color : "#888" }}>
        {t.label}
        {t.items.length > 0 && <span className="dint-pill-count" style={{ background: t.color }}>{t.items.length}</span>}
      </button>
    ))}
  </div>
);

const DrugInteractionWarning = ({ agentResult, agentLoading, agentError, intTab, setIntTab, ddSevTab, setDdSevTab, ddisTab, setDdisTab }) => {
  const drugDrug    = agentResult?.drug_drug    || [];
  const drugDisease = agentResult?.drug_disease || [];
  const drugFood    = agentResult?.drug_food    || [];

  const ddMap = {
    severe:   drugDrug.filter(i => i.severity === "severe"),
    moderate: drugDrug.filter(i => i.severity === "moderate"),
    minor:    drugDrug.filter(i => i.severity !== "severe" && i.severity !== "moderate"),
  };
  const ddTabs = [
    { key: "severe",   label: "Severe",   color: "#e05252", bg: "#fff0f0", border: "#fca5a5", items: ddMap.severe   },
    { key: "moderate", label: "Moderate", color: "#f59e0b", bg: "#fff7ed", border: "#fcd34d", items: ddMap.moderate },
    { key: "minor",    label: "Minor",    color: "#888",    bg: "#f0f0f8", border: "#e0e3ef", items: ddMap.minor    },
  ];

  const disMap = {
    contraindicated: drugDisease.filter(i => i.contraindicated),
    moderate:        drugDisease.filter(i => !i.contraindicated && i.severity === "moderate"),
    minor:           drugDisease.filter(i => !i.contraindicated && i.severity !== "moderate"),
  };
  const disTabs = [
    { key: "contraindicated", label: "Contraindicated", color: "#e05252", bg: "#fff0f0", border: "#fca5a5", items: disMap.contraindicated },
    { key: "moderate",        label: "Moderate",        color: "#f59e0b", bg: "#fff7ed", border: "#fcd34d", items: disMap.moderate        },
    { key: "minor",           label: "Minor",           color: "#888",    bg: "#f0f0f8", border: "#e0e3ef", items: disMap.minor           },
  ];

  const getPubmedCount = (item) => item?.evidence?.pubmed_papers           ?? item?.pubmed_papers           ?? 0;
  const getFdaReports  = (item) => item?.evidence?.fda_reports              ?? item?.fda_reports              ?? 0;
  const getFdaSections = (item) => item?.evidence?.fda_label_sections_count ?? item?.fda_label_sections_count ?? 0;

  const getConfidenceLabel = (item) => {
    if (item.confidence != null) return `${Math.round(item.confidence * 100)}% confidence`;
    if (item.severity === "unknown") return "Insufficient evidence";
    return "Confidence unavailable";
  };

  const OkMessage = ({ text }) => (
    <p className="dint-ok" style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <CheckCircle2 size={14} />{text}
    </p>
  );

  return (
    <div className="dint-card">
      {agentResult && (drugDrug.length > 0 || drugDisease.length > 0 || drugFood.length > 0) && (
        <div className="dint-alert-badge">⚠️</div>
      )}

      <div className="dint-header">
        <div className="dint-title">Drug Interaction Warning</div>
        <div className="dint-tabs">
          {[
            { key: "drug-drug",    label: "Drug–Drug",    Icon: Pill,     count: drugDrug.length    },
            { key: "drug-disease", label: "Drug–Disease", Icon: XCircle,  count: drugDisease.length },
            { key: "drug-food",    label: "Drug–Food",    Icon: Utensils, count: drugFood.length    },
          ].map(t => (
            <button key={t.key} className={`dint-tab${intTab === t.key ? " active" : ""}`} onClick={() => setIntTab(t.key)}>
              <span className="dint-tab-label">
                <t.Icon size={11} />{t.label}
                {t.count > 0 && <span className="dint-tab-badge">{t.count}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="dint-body">
        {agentLoading && (
          <div className="dint-loading">
            <div className="pd-spinner" style={{ margin: "0 auto 0.75rem" }} />
            <p>Analysing interactions...</p>
          </div>
        )}

        {!agentLoading && !agentResult && !agentError && (
          <p className="dint-empty">Add medications and click <strong>Done — Run Analysis</strong> to see results.</p>
        )}

        {!agentLoading && agentResult && (
          <>
            {intTab === "drug-drug" && (
              <>
                <SevPills tabs={ddTabs} active={ddSevTab} onSelect={setDdSevTab} />
                {ddMap[ddSevTab].length === 0
                  ? <OkMessage text={`No ${ddSevTab} drug-drug interactions.`} />
                  : ddMap[ddSevTab].map((item, i) => (
                    <div key={i} className="dint-item">
                      <div className="dint-item-top">
                        <div className="dint-item-left">
                          <span className="dint-item-name">{item.drug1} + {item.drug2}</span>
                          <span className="dint-badge-gray">{getConfidenceLabel(item)}</span>
                        </div>
                        <div className="dint-item-right">
                          {getPubmedCount(item) > 0 && <EvidenceLink href={pubmedUrl(item.drug1, item.drug2)}><BookOpen size={11} />{getPubmedCount(item)} PubMed</EvidenceLink>}
                          {getFdaReports(item)  > 0 && <EvidenceLink href={fdaReportsUrl()}><Building2 size={11} />{getFdaReports(item)} FDA reports</EvidenceLink>}
                          <FdaLabelLink drug={item.drug1}><Pill size={11} />FDA label</FdaLabelLink>
                        </div>
                      </div>
                      <div className="dint-desc">{item.mechanism}</div>
                      {item.clinical_effects && <div className="dint-desc dint-desc-warn">{item.clinical_effects}</div>}
                      <div className="dint-rec-box">
                        <div className="dint-rec-label">Recommendation</div>
                        <div className="dint-rec-text">{item.recommendation}</div>
                      </div>
                    </div>
                  ))}
              </>
            )}

            {intTab === "drug-disease" && (
              <>
                <SevPills tabs={disTabs} active={ddisTab} onSelect={setDdisTab} />
                {disMap[ddisTab].length === 0
                  ? <OkMessage text={`No ${ddisTab} drug-disease interactions.`} />
                  : disMap[ddisTab].map((item, i) => (
                    <div key={i} className="dint-item">
                      <div className="dint-item-top">
                        <div className="dint-item-left">
                          <span className="dint-item-name">{item.drug} + {item.disease}</span>
                          <span className="dint-badge-gray">{getConfidenceLabel(item)}</span>
                        </div>
                        <div className="dint-item-right">
                          {getPubmedCount(item) > 0 && <EvidenceLink href={pubmedUrl(item.drug, item.disease)}><BookOpen size={11} />{getPubmedCount(item)} PubMed</EvidenceLink>}
                          {getFdaSections(item) > 0 && <FdaLabelLink drug={item.drug}><ClipboardList size={11} />{getFdaSections(item)} FDA sections</FdaLabelLink>}
                        </div>
                      </div>
                      <div className="dint-desc">{item.clinical_evidence}</div>
                      <div className="dint-rec-box">
                        <div className="dint-rec-label">Recommendation</div>
                        <div className="dint-rec-text">{item.recommendation}</div>
                        {item.alternative_drugs?.length > 0 && <div className="dint-rec-note">Alternatives: {item.alternative_drugs.join(", ")}</div>}
                      </div>
                    </div>
                  ))}
              </>
            )}

            {intTab === "drug-food" && (
              drugFood.length === 0
                ? <OkMessage text="No significant drug-food interactions found." />
                : drugFood.map((item, i) => (
                  <div key={i} className="dint-item">
                    <div className="dint-item-top">
                      <div className="dint-item-name" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <Pill size={13} />{item.drug}
                      </div>
                      <div className="dint-item-right">
                        <EvidenceLink href={pubmedUrl(item.drug, "food interaction")}><BookOpen size={11} />PubMed</EvidenceLink>
                        <FdaLabelLink drug={item.drug}><Pill size={11} />FDA label</FdaLabelLink>
                      </div>
                    </div>
                    {item.foods_to_avoid?.length > 0 && (
                      <div className="dint-food-row" style={{ marginTop: 8 }}>
                        <span className="dint-food-avoid"><XCircle size={11} />AVOID:</span>
                        <span className="dint-food-val">{item.foods_to_avoid.join(", ")}</span>
                      </div>
                    )}
                    {item.foods_to_separate?.length > 0 && (
                      <div className="dint-food-row">
                        <span className="dint-food-separate"><Clock size={11} />SEPARATE TIMING:</span>
                        <span className="dint-food-val">{item.foods_to_separate.join(", ")}</span>
                      </div>
                    )}
                    {item.foods_to_monitor?.length > 0 && (
                      <div className="dint-food-row">
                        <span className="dint-food-monitor"><Eye size={11} />MONITOR:</span>
                        <span className="dint-food-val">{item.foods_to_monitor.join(", ")}</span>
                      </div>
                    )}
                    {item.mechanism && <div className="dint-desc">{item.mechanism}</div>}
                  </div>
                ))
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default DrugInteractionWarning;