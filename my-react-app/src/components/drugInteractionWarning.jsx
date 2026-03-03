import "../components/styles/drugInteractionWarning.css";

const SevPills = ({ tabs, active, onSelect }) => (
  <div className="dint-pills">
    {tabs.map(t => (
      <button
        key={t.key}
        className="dint-pill"
        onClick={() => onSelect(t.key)}
        style={{
          border: `1.5px solid ${active === t.key ? t.border : "#e0e3ef"}`,
          background: active === t.key ? t.bg : "#fff",
          color: active === t.key ? t.color : "#888",
        }}
      >
        {t.label}
        {t.items.length > 0 && (
          <span className="dint-pill-count" style={{ background: t.color }}>{t.items.length}</span>
        )}
      </button>
    ))}
  </div>
);

const DrugInteractionWarning = ({
  agentResult,
  agentLoading,
  agentError,
  intTab,
  setIntTab,
  ddSevTab,
  setDdSevTab,
  ddisTab,
  setDdisTab,
}) => {
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

  return (
    <div className="dint-card">
      {agentResult && (drugDrug.length > 0 || drugDisease.length > 0 || drugFood.length > 0) && (
        <div className="dint-alert-badge">⚠️</div>
      )}

      {/* ── Header + tabs ── */}
      <div className="dint-header">
        <div className="dint-title">Drug Interaction Warning</div>
        <div className="dint-tabs">
          {[
            { key: "drug-drug",    label: "Drug–Drug",    count: drugDrug.length    },
            { key: "drug-disease", label: "Drug–Disease", count: drugDisease.length },
            { key: "drug-food",    label: "Drug–Food",    count: drugFood.length    },
          ].map(t => (
            <button key={t.key} className={`dint-tab${intTab === t.key ? " active" : ""}`} onClick={() => setIntTab(t.key)}>
              <span className="dint-tab-label">
                {t.label}
                {t.count > 0 && <span className="dint-tab-badge">{t.count}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="dint-body">
        {/* Loading */}
        {agentLoading && (
          <div className="dint-loading">
            <div className="pd-spinner" style={{ margin: "0 auto 0.75rem" }} />
            <p>Analysing interactions...</p>
          </div>
        )}

        {/* Empty state */}
        {!agentLoading && !agentResult && !agentError && (
          <p className="dint-empty">Add medications and click <strong>Done — Run Analysis</strong> to see results.</p>
        )}

        {/* Results */}
        {!agentLoading && agentResult && (
          <>
            {/* ── Drug-Drug ── */}
            {intTab === "drug-drug" && (
              <>
                <SevPills tabs={ddTabs} active={ddSevTab} onSelect={setDdSevTab} />
                {ddMap[ddSevTab].length === 0 ? (
                  <p className="dint-ok">✅ No {ddSevTab} drug-drug interactions.</p>
                ) : ddMap[ddSevTab].map((item, i) => (
                  <div key={i} className="dint-item">
                    <div className="dint-item-top">
                      <div className="dint-item-left">
                        <span className="dint-item-name">{item.drug1} + {item.drug2}</span>
                        <span className="dint-badge-gray">{Math.round((item.confidence || 0) * 100)}% confidence</span>
                      </div>
                      <div className="dint-item-right">
                        {item.pubmed_papers > 0 && <span className="dint-source-tag">📚 {item.pubmed_papers} PubMed</span>}
                        {item.fda_reports   > 0 && <span className="dint-source-tag">🏛️ {item.fda_reports} FDA</span>}
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

            {/* ── Drug-Disease ── */}
            {intTab === "drug-disease" && (
              <>
                <SevPills tabs={disTabs} active={ddisTab} onSelect={setDdisTab} />
                {disMap[ddisTab].length === 0 ? (
                  <p className="dint-ok">✅ No {ddisTab} drug-disease interactions.</p>
                ) : disMap[ddisTab].map((item, i) => (
                  <div key={i} className="dint-item">
                    <div className="dint-item-top">
                      <div className="dint-item-left">
                        <span className="dint-item-name">{item.drug} + {item.disease}</span>
                        <span className="dint-badge-gray">{Math.round((item.confidence || 0) * 100)}% confidence</span>
                      </div>
                      {item.pubmed_papers > 0 && <span className="dint-source-tag">{item.pubmed_papers} PubMed</span>}
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

            {/* ── Drug-Food ── */}
            {intTab === "drug-food" && (
              drugFood.length === 0 ? (
                <p className="dint-ok">✅ No significant drug-food interactions found.</p>
              ) : drugFood.map((item, i) => (
                <div key={i} className="dint-item">
                  <div className="dint-item-name" style={{ marginBottom: 8 }}>{item.drug}</div>
                  {item.foods_to_avoid?.length    > 0 && <div style={{ marginBottom: 6 }}><span className="dint-food-avoid">AVOID: </span><span className="dint-food-val">{item.foods_to_avoid.join(", ")}</span></div>}
                  {item.foods_to_separate?.length > 0 && <div style={{ marginBottom: 6 }}><span className="dint-food-separate">SEPARATE TIMING: </span><span className="dint-food-val">{item.foods_to_separate.join(", ")}</span></div>}
                  {item.foods_to_monitor?.length  > 0 && <div style={{ marginBottom: 6 }}><span className="dint-food-monitor">MONITOR: </span><span className="dint-food-val">{item.foods_to_monitor.join(", ")}</span></div>}
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