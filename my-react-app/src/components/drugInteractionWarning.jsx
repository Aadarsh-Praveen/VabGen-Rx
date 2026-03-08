/*
import "../components/styles/drugInteractionWarning.css";

const SevPills = ({ tabs, active, onSelect }) => (
  <div className="dint-pills">
    {tabs.map(t => (
      <button
        key={t.key}
        className="dint-pill"
        onClick={() => onSelect(t.key)}
        style={{
          border:     `1.5px solid ${active === t.key ? t.border : "#e0e3ef"}`,
          background: active === t.key ? t.bg  : "#fff",
          color:      active === t.key ? t.color : "#888",
        }}
      >
        {t.label}
        {t.items.length > 0 && (
          <span
            className="dint-pill-count"
            style={{ background: t.color }}
          >
            {t.items.length}
          </span>
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
    minor:    drugDrug.filter(
      i => i.severity !== "severe" && i.severity !== "moderate"
    ),
  };
  const ddTabs = [
    {
      key: "severe",   label: "Severe",
      color: "#e05252", bg: "#fff0f0", border: "#fca5a5",
      items: ddMap.severe,
    },
    {
      key: "moderate", label: "Moderate",
      color: "#f59e0b", bg: "#fff7ed", border: "#fcd34d",
      items: ddMap.moderate,
    },
    {
      key: "minor",    label: "Minor",
      color: "#888",    bg: "#f0f0f8", border: "#e0e3ef",
      items: ddMap.minor,
    },
  ];

  const disMap = {
    contraindicated: drugDisease.filter(i => i.contraindicated),
    moderate:        drugDisease.filter(
      i => !i.contraindicated && i.severity === "moderate"
    ),
    minor:           drugDisease.filter(
      i => !i.contraindicated && i.severity !== "moderate"
    ),
  };
  const disTabs = [
    {
      key: "contraindicated", label: "Contraindicated",
      color: "#e05252", bg: "#fff0f0", border: "#fca5a5",
      items: disMap.contraindicated,
    },
    {
      key: "moderate", label: "Moderate",
      color: "#f59e0b", bg: "#fff7ed", border: "#fcd34d",
      items: disMap.moderate,
    },
    {
      key: "minor",    label: "Minor",
      color: "#888",    bg: "#f0f0f8", border: "#e0e3ef",
      items: disMap.minor,
    },
  ];

  // ── Helper — read evidence count from nested or flat field ───
  // New architecture stores in item.evidence.pubmed_papers
  // Old cached results store in item.pubmed_papers directly
  const getPubmedCount = (item) =>
    item?.evidence?.pubmed_papers ?? item?.pubmed_papers ?? 0;

  const getFdaReports = (item) =>
    item?.evidence?.fda_reports ?? item?.fda_reports ?? 0;

  const getFdaSections = (item) =>
    item?.evidence?.fda_label_sections_count ??
    item?.fda_label_sections_count ?? 0;

  const getConfidenceLabel = (item) => {
    if (item.confidence != null) {
      return `${Math.round(item.confidence * 100)}% confidence`;
    }
    if (item.severity === "unknown") {
      return "Insufficient evidence";
    }
    return "Confidence unavailable";
  };

  return (
    <div className="dint-card">
      {agentResult && (
        drugDrug.length > 0 ||
        drugDisease.length > 0 ||
        drugFood.length > 0
      ) && (
        <div className="dint-alert-badge">⚠️</div>
      )}

      {/* ── Header + tabs ── *}
      <div className="dint-header">
        <div className="dint-title">Drug Interaction Warning</div>
        <div className="dint-tabs">
          {[
            { key: "drug-drug",    label: "Drug–Drug",
              count: drugDrug.length    },
            { key: "drug-disease", label: "Drug–Disease",
              count: drugDisease.length },
            { key: "drug-food",    label: "Drug–Food",
              count: drugFood.length    },
          ].map(t => (
            <button
              key={t.key}
              className={
                `dint-tab${intTab === t.key ? " active" : ""}`
              }
              onClick={() => setIntTab(t.key)}
            >
              <span className="dint-tab-label">
                {t.label}
                {t.count > 0 && (
                  <span className="dint-tab-badge">
                    {t.count}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="dint-body">

        {/* ── Loading ── *}
        {agentLoading && (
          <div className="dint-loading">
            <div
              className="pd-spinner"
              style={{ margin: "0 auto 0.75rem" }}
            />
            <p>Analysing interactions...</p>
          </div>
        )}

        {/* ── Empty state ── *}
        {!agentLoading && !agentResult && !agentError && (
          <p className="dint-empty">
            Add medications and click{" "}
            <strong>Done — Run Analysis</strong> to see results.
          </p>
        )}

        {/* ── Results ── *}
        {!agentLoading && agentResult && (
          <>
            {/* ════ DRUG-DRUG ════ *}
            {intTab === "drug-drug" && (
              <>
                <SevPills
                  tabs={ddTabs}
                  active={ddSevTab}
                  onSelect={setDdSevTab}
                />
                {ddMap[ddSevTab].length === 0 ? (
                  <p className="dint-ok">
                    ✅ No {ddSevTab} drug-drug interactions.
                  </p>
                ) : ddMap[ddSevTab].map((item, i) => (
                  <div key={i} className="dint-item">
                    <div className="dint-item-top">
                      <div className="dint-item-left">
                        <span className="dint-item-name">
                          {item.drug1} + {item.drug2}
                        </span>
                        <span className="dint-badge-gray">
                          {getConfidenceLabel(item)}
                        </span>
                      </div>
                      <div className="dint-item-right">
                        {getPubmedCount(item) > 0 && (
                          <span className="dint-source-tag">
                            📚 {getPubmedCount(item)} PubMed
                          </span>
                        )}
                        {getFdaReports(item) > 0 && (
                          <span className="dint-source-tag">
                            🏛️ {getFdaReports(item)} FDA
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="dint-desc">
                      {item.mechanism}
                    </div>
                    {item.clinical_effects && (
                      <div className="dint-desc dint-desc-warn">
                        {item.clinical_effects}
                      </div>
                    )}
                    <div className="dint-rec-box">
                      <div className="dint-rec-label">
                        Recommendation
                      </div>
                      <div className="dint-rec-text">
                        {item.recommendation}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* ════ DRUG-DISEASE ════ *}
            {intTab === "drug-disease" && (
              <>
                <SevPills
                  tabs={disTabs}
                  active={ddisTab}
                  onSelect={setDdisTab}
                />
                {disMap[ddisTab].length === 0 ? (
                  <p className="dint-ok">
                    ✅ No {ddisTab} drug-disease interactions.
                  </p>
                ) : disMap[ddisTab].map((item, i) => (
                  <div key={i} className="dint-item">
                    <div className="dint-item-top">
                      <div className="dint-item-left">
                        <span className="dint-item-name">
                          {item.drug} + {item.disease}
                        </span>
                        <span className="dint-badge-gray">
                          {getConfidenceLabel(item)}
                        </span>
                      </div>
                      <div className="dint-item-right">
                        {getPubmedCount(item) > 0 && (
                          <span className="dint-source-tag">
                            📚 {getPubmedCount(item)} PubMed
                          </span>
                        )}
                        {getFdaSections(item) > 0 && (
                          <span className="dint-source-tag">
                            📋 {getFdaSections(item)} FDA sections
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="dint-desc">
                      {item.clinical_evidence}
                    </div>
                    <div className="dint-rec-box">
                      <div className="dint-rec-label">
                        Recommendation
                      </div>
                      <div className="dint-rec-text">
                        {item.recommendation}
                      </div>
                      {item.alternative_drugs?.length > 0 && (
                        <div className="dint-rec-note">
                          Alternatives:{" "}
                          {item.alternative_drugs.join(", ")}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* ════ DRUG-FOOD ════ *}
            {intTab === "drug-food" && (
              drugFood.length === 0 ? (
                <p className="dint-ok">
                  ✅ No significant drug-food interactions found.
                </p>
              ) : drugFood.map((item, i) => (
                <div key={i} className="dint-item">
                  <div
                    className="dint-item-name"
                    style={{ marginBottom: 8 }}
                  >
                    {item.drug}
                  </div>
                  {item.foods_to_avoid?.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <span className="dint-food-avoid">
                        AVOID:{" "}
                      </span>
                      <span className="dint-food-val">
                        {item.foods_to_avoid.join(", ")}
                      </span>
                    </div>
                  )}
                  {item.foods_to_separate?.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <span className="dint-food-separate">
                        SEPARATE TIMING:{" "}
                      </span>
                      <span className="dint-food-val">
                        {item.foods_to_separate.join(", ")}
                      </span>
                    </div>
                  )}
                  {item.foods_to_monitor?.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <span className="dint-food-monitor">
                        MONITOR:{" "}
                      </span>
                      <span className="dint-food-val">
                        {item.foods_to_monitor.join(", ")}
                      </span>
                    </div>
                  )}
                  {item.mechanism && (
                    <div className="dint-desc">
                      {item.mechanism}
                    </div>
                  )}
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default DrugInteractionWarning;*/





import "../components/styles/drugInteractionWarning.css";

import { useState, useCallback } from "react";

// ── Evidence URL builders ─────────────────────────────────────────

// PubMed search for a drug pair or single drug
const pubmedUrl = (drug1, drug2 = null) => {
  const query = drug2
    ? `${drug1.trim()} ${drug2.trim()} drug interaction`
    : `${drug1.trim()} drug interaction`;
  return `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(query)}&sort=relevance`;
};

// FDA adverse reports — FAERS info page (no deep link available publicly)
const fdaReportsUrl = () =>
  `https://www.fda.gov/drugs/drug-approvals-and-databases/fda-adverse-event-reporting-system-faers`;

// ── Smart FDA Label Link ──────────────────────────────────────────
// Calls OpenFDA API to get the exact DailyMed set_id for the drug,
// then opens the precise label page — not a search page.
// Falls back to DailyMed search if API call fails.
const FdaLabelLink = ({ drug, children, className }) => {
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Query OpenFDA for the drug label — prefers Rx label
      const url = `https://api.fda.gov/drug/label.json?search=openfda.generic_name:"${encodeURIComponent(drug.trim())}"&limit=1`;
      const res  = await fetch(url);
      const data = await res.json();
      const result = data?.results?.[0];

      if (result?.openfda?.spl_set_id?.[0]) {
        // Exact DailyMed label page using set_id
        const setId = result.openfda.spl_set_id[0];
        window.open(
          `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setId}`,
          "_blank"
        );
      } else {
        // Fallback — DailyMed search
        window.open(
          `https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=${encodeURIComponent(drug.trim())}`,
          "_blank"
        );
      }
    } catch {
      // Fallback on network error
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
      className={className || "dint-source-tag"}
      style={{
        background: "none", border: "1px solid #e0e3ef",
        cursor: loading ? "wait" : "pointer",
        opacity: loading ? 0.7 : 1,
        textDecoration: "none", padding: "2px 8px",
        borderRadius: 20, fontSize: "0.75rem",
      }}
      title="Click to view FDA label"
      disabled={loading}
    >
      {loading ? "⏳ Loading..." : children}
    </button>
  );
};

// ── Simple clickable evidence tag (for PubMed + FDA reports) ─────
const EvidenceLink = ({ href, children }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="dint-source-tag"
    style={{ textDecoration: "none", cursor: "pointer" }}
    title="Click to view evidence"
  >
    {children}
  </a>
);

const SevPills = ({ tabs, active, onSelect }) => (
  <div className="dint-pills">
    {tabs.map(t => (
      <button
        key={t.key}
        className="dint-pill"
        onClick={() => onSelect(t.key)}
        style={{
          border:     `1.5px solid ${active === t.key ? t.border : "#e0e3ef"}`,
          background: active === t.key ? t.bg  : "#fff",
          color:      active === t.key ? t.color : "#888",
        }}
      >
        {t.label}
        {t.items.length > 0 && (
          <span className="dint-pill-count" style={{ background: t.color }}>
            {t.items.length}
          </span>
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

  const getPubmedCount  = (item) => item?.evidence?.pubmed_papers          ?? item?.pubmed_papers          ?? 0;
  const getFdaReports   = (item) => item?.evidence?.fda_reports             ?? item?.fda_reports             ?? 0;
  const getFdaSections  = (item) => item?.evidence?.fda_label_sections_count ?? item?.fda_label_sections_count ?? 0;

  const getConfidenceLabel = (item) => {
    if (item.confidence != null) return `${Math.round(item.confidence * 100)}% confidence`;
    if (item.severity === "unknown") return "Insufficient evidence";
    return "Confidence unavailable";
  };

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
            <button
              key={t.key}
              className={`dint-tab${intTab === t.key ? " active" : ""}`}
              onClick={() => setIntTab(t.key)}
            >
              <span className="dint-tab-label">
                {t.label}
                {t.count > 0 && <span className="dint-tab-badge">{t.count}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="dint-body">

        {/* ── Loading ── */}
        {agentLoading && (
          <div className="dint-loading">
            <div className="pd-spinner" style={{ margin: "0 auto 0.75rem" }} />
            <p>Analysing interactions...</p>
          </div>
        )}

        {/* ── Empty state ── */}
        {!agentLoading && !agentResult && !agentError && (
          <p className="dint-empty">
            Add medications and click <strong>Done — Run Analysis</strong> to see results.
          </p>
        )}

        {/* ── Results ── */}
        {!agentLoading && agentResult && (
          <>
            {/* ════ DRUG-DRUG ════ */}
            {intTab === "drug-drug" && (
              <>
                <SevPills tabs={ddTabs} active={ddSevTab} onSelect={setDdSevTab} />
                {ddMap[ddSevTab].length === 0 ? (
                  <p className="dint-ok">✅ No {ddSevTab} drug-drug interactions.</p>
                ) : ddMap[ddSevTab].map((item, i) => (
                  <div key={i} className="dint-item">
                    <div className="dint-item-top">
                      <div className="dint-item-left">
                        <span className="dint-item-name">
                          {item.drug1} + {item.drug2}
                        </span>
                        <span className="dint-badge-gray">
                          {getConfidenceLabel(item)}
                        </span>
                      </div>
                      <div className="dint-item-right">
                        {/* ── Clickable evidence links ── */}
                        {getPubmedCount(item) > 0 && (
                          <EvidenceLink href={pubmedUrl(item.drug1, item.drug2)}>
                            📚 {getPubmedCount(item)} PubMed
                          </EvidenceLink>
                        )}
                        {getFdaReports(item) > 0 && (
                          <EvidenceLink href={fdaReportsUrl()}>
                            🏛️ {getFdaReports(item)} FDA reports
                          </EvidenceLink>
                        )}
                        <FdaLabelLink drug={item.drug1}>
                          💊 FDA label
                        </FdaLabelLink>
                      </div>
                    </div>
                    <div className="dint-desc">{item.mechanism}</div>
                    {item.clinical_effects && (
                      <div className="dint-desc dint-desc-warn">{item.clinical_effects}</div>
                    )}
                    <div className="dint-rec-box">
                      <div className="dint-rec-label">Recommendation</div>
                      <div className="dint-rec-text">{item.recommendation}</div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* ════ DRUG-DISEASE ════ */}
            {intTab === "drug-disease" && (
              <>
                <SevPills tabs={disTabs} active={ddisTab} onSelect={setDdisTab} />
                {disMap[ddisTab].length === 0 ? (
                  <p className="dint-ok">✅ No {ddisTab} drug-disease interactions.</p>
                ) : disMap[ddisTab].map((item, i) => (
                  <div key={i} className="dint-item">
                    <div className="dint-item-top">
                      <div className="dint-item-left">
                        <span className="dint-item-name">
                          {item.drug} + {item.disease}
                        </span>
                        <span className="dint-badge-gray">
                          {getConfidenceLabel(item)}
                        </span>
                      </div>
                      <div className="dint-item-right">
                        {/* ── Clickable evidence links ── */}
                        {getPubmedCount(item) > 0 && (
                          <EvidenceLink href={pubmedUrl(item.drug, item.disease)}>
                            📚 {getPubmedCount(item)} PubMed
                          </EvidenceLink>
                        )}
                        {getFdaSections(item) > 0 && (
                          <FdaLabelLink drug={item.drug}>
                            📋 {getFdaSections(item)} FDA sections
                          </FdaLabelLink>
                        )}
                      </div>
                    </div>
                    <div className="dint-desc">{item.clinical_evidence}</div>
                    <div className="dint-rec-box">
                      <div className="dint-rec-label">Recommendation</div>
                      <div className="dint-rec-text">{item.recommendation}</div>
                      {item.alternative_drugs?.length > 0 && (
                        <div className="dint-rec-note">
                          Alternatives: {item.alternative_drugs.join(", ")}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* ════ DRUG-FOOD ════ */}
            {intTab === "drug-food" && (
              drugFood.length === 0 ? (
                <p className="dint-ok">✅ No significant drug-food interactions found.</p>
              ) : drugFood.map((item, i) => (
                <div key={i} className="dint-item">
                  <div className="dint-item-top">
                    <div className="dint-item-name" style={{ marginBottom: 0 }}>
                      {item.drug}
                    </div>
                    <div className="dint-item-right">
                      {/* ── Evidence link for food tab ── */}
                      <EvidenceLink href={pubmedUrl(item.drug, "food interaction")}>
                        📚 PubMed
                      </EvidenceLink>
                      <FdaLabelLink drug={item.drug}>
                        💊 FDA label
                      </FdaLabelLink>
                    </div>
                  </div>
                  {item.foods_to_avoid?.length > 0 && (
                    <div style={{ marginBottom: 6, marginTop: 8 }}>
                      <span className="dint-food-avoid">AVOID: </span>
                      <span className="dint-food-val">{item.foods_to_avoid.join(", ")}</span>
                    </div>
                  )}
                  {item.foods_to_separate?.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <span className="dint-food-separate">SEPARATE TIMING: </span>
                      <span className="dint-food-val">{item.foods_to_separate.join(", ")}</span>
                    </div>
                  )}
                  {item.foods_to_monitor?.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <span className="dint-food-monitor">MONITOR: </span>
                      <span className="dint-food-val">{item.foods_to_monitor.join(", ")}</span>
                    </div>
                  )}
                  {item.mechanism && (
                    <div className="dint-desc">{item.mechanism}</div>
                  )}
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