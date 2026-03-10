import { Package, X, ArrowLeftRight, TrendingDown, AlertCircle } from "lucide-react";
import "./styles/outOfStockFinder.css";

const OutOfStockFinder = ({ outOfStock, setOutOfStock, handleSwitch }) => {
  if (outOfStock.length === 0) return null;

  return (
    <div className="oos-card">
      <div className="oos-header">
        <span className="oos-title">
          <Package size={14} strokeWidth={2.5} />Out-of-Stock Medication Finder
        </span>
        <button className="oos-close-btn" onClick={() => setOutOfStock([])}><X size={15} /></button>
      </div>

      <div className="oos-body">
        {outOfStock.map((entry, ei) => (
          <div key={ei} className="oos-entry">
            <div className="oos-drug-row">
              <span className="oos-drug-name">{entry.med.Brand_Name} {entry.med.Strength}</span>
              {entry.med.Route && <span className="oos-drug-detail">| {entry.med.Route} {entry.med.Frequency}</span>}
              <span className="oos-drug-badge">
                <AlertCircle size={11} />Out of Stock (Hospital Pharmacy)
              </span>
            </div>

            <div className="oos-alt-header">
              <span className="oos-alt-label">Available Alternatives</span>
              <span className="oos-alt-sub">(Same compound, same dose)</span>
            </div>

            {entry.alternatives.length === 0 ? (
              <p className="oos-no-alt">No alternatives found in inventory for this strength.</p>
            ) : (
              <div className="oos-table">
                <div className="oos-table-head">
                  {["Brand / Generic", "Strength", "Form", "Price (30-day)", "In Stock", "Action"].map(h => <span key={h}>{h}</span>)}
                </div>
                {entry.alternatives.map((alt, ai) => {
                  const inStock  = parseInt(alt.Stocks) > 0;
                  const isLowest = entry.alternatives
                    .filter(a => parseInt(a.Stocks) > 0)
                    .every(a => parseFloat(a.Cost_Per_30_USD) >= parseFloat(alt.Cost_Per_30_USD));
                  return (
                    <div key={ai} className="oos-table-row" style={{ opacity: inStock ? 1 : 0.5 }}>
                      <div>
                        <div className="oos-brand-cell">
                          <span className="oos-dot" style={{ background: inStock ? "#16a34a" : "#e05252" }} />
                          <span className="oos-brand-name">{alt.Brand_Name}</span>
                          {isLowest && inStock && <span className="oos-lowest-badge"><TrendingDown size={10} />Lowest Cost</span>}
                        </div>
                        <div className="oos-price-sub">
                          Price: <span style={{ color: inStock ? "#16a34a" : "#aaa", fontWeight: 600 }}>${alt.Cost_Per_30_USD}</span> (30-day)
                        </div>
                      </div>
                      <span className="oos-cell-text">{alt.Strength}</span>
                      <span className="oos-cell-text">{alt.Route || "Pill"}</span>
                      <span className="oos-price-text" style={{ color: inStock ? "#16a34a" : "#aaa" }}>${alt.Cost_Per_30_USD}</span>
                      <div>
                        <div className="oos-stock-units" style={{ color: inStock ? "#16a34a" : "#e05252" }}>{inStock ? `${alt.Stocks} units` : "0 units"}</div>
                        <div className="oos-stock-label" style={{ color: inStock ? "#888" : "#e05252" }}>{inStock ? "in stock" : "Unavailable"}</div>
                      </div>
                      <button className="oos-switch-btn" disabled={!inStock} onClick={() => handleSwitch(entry.med, alt)}
                        style={{ background: inStock ? "linear-gradient(135deg, #1a73e8, #1558b0)" : "#f0f0f8", color: inStock ? "#fff" : "#bbb", boxShadow: inStock ? "0 2px 8px rgba(26,115,232,0.25)" : "none" }}>
                        <ArrowLeftRight size={12} />Switch
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="oos-footer-note">Prices &amp; availability shown are real-time from hospital pharmacy database.</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OutOfStockFinder;