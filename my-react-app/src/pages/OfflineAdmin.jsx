import { useState, useEffect, useRef } from "react";
import "./OfflineAdmin.css";
import vabgenLogo from "../assets/vabgen_logo.png";

const OFFLINE_API = "http://localhost:8000";

export default function OfflineAdmin() {
  const [stats,       setStats]       = useState(null);
  const [uploading,   setUploading]   = useState(false);
  const [uploadMsg,   setUploadMsg]   = useState("");
  const [uploadErr,   setUploadErr]   = useState("");
  const [searchQ,     setSearchQ]     = useState("");
  const [searchRes,   setSearchRes]   = useState([]);
  const [searching,   setSearching]   = useState(false);
  const [dragOver,    setDragOver]    = useState(false);

  const fileInputRef = useRef(null);

  const loadStats = () => {
    fetch(`${OFFLINE_API}/offline/vector-stats`)
      .then(r => r.json())
      .then(setStats)
      .catch(() => {});
  };

  useEffect(() => { loadStats(); }, []);

  const handleFile = async (file) => {
    if (!file) return;
    const allowed = [".pdf", ".txt", ".md"];
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (!allowed.includes(ext)) {
      setUploadErr("❌ Only PDF, TXT, and MD files are supported.");
      return;
    }
    setUploading(true);
    setUploadMsg("");
    setUploadErr("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res  = await fetch(`${OFFLINE_API}/offline/ingest`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      setUploadMsg(`✅ "${file.name}" ingested successfully — ${data.chunks_added} knowledge chunks added. Total in database: ${data.total_in_db}`);
      loadStats();
    } catch (err) {
      setUploadErr(`❌ ${err.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileInput = (e) => handleFile(e.target.files?.[0]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const handleSearch = async () => {
    if (!searchQ.trim()) return;
    setSearching(true);
    setSearchRes([]);
    try {
      const res  = await fetch(`${OFFLINE_API}/offline/search`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQ.trim(), top_k: 5 }),
      });
      const data = await res.json();
      setSearchRes(data.results || []);
    } catch {
      setSearchRes([]);
    } finally {
      setSearching(false);
    }
  };

  const severityColor = (s) => ({
    MAJOR:    "#dc2626",
    MODERATE: "#d97706",
    MINOR:    "#16a34a",
    UNKNOWN:  "#6b7280",
  }[s] || "#6b7280");

  const severityBg = (s) => ({
    MAJOR:    "#fef2f2",
    MODERATE: "#fffbeb",
    MINOR:    "#f0fdf4",
    UNKNOWN:  "#f9fafb",
  }[s] || "#f9fafb");

  return (
    <div className="oa-root">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="oa-header">
        <div className="oa-header-left">
          <img src={vabgenLogo} alt="VabGenRx" className="oa-logo" />
          <span className="oa-logo-text">VabGen<span>Rx</span></span>
          <div className="oa-divider" />
          <div className="oa-header-title">Knowledge Base Admin</div>
        </div>
        <a href="/offline" className="oa-back-btn">
          ← Back to Clinical Tool
        </a>
      </div>

      <div className="oa-body">

        {/* ── Stats Row ───────────────────────────────────────────────── */}
        {stats && (
          <div className="oa-stats-row">
            <div className="oa-stat-card">
              <div className="oa-stat-num">{stats.total_pairs}</div>
              <div className="oa-stat-label">Total Drug Pairs</div>
            </div>
            <div className="oa-stat-card">
              <div className="oa-stat-num">{stats.sources?.length || 0}</div>
              <div className="oa-stat-label">Knowledge Sources</div>
            </div>
            <div className="oa-stat-card oa-stat-major">
              <div className="oa-stat-num">{stats.by_severity?.MAJOR || 0}</div>
              <div className="oa-stat-label">MAJOR Interactions</div>
            </div>
            <div className="oa-stat-card oa-stat-moderate">
              <div className="oa-stat-num">{stats.by_severity?.MODERATE || 0}</div>
              <div className="oa-stat-label">MODERATE Interactions</div>
            </div>
            <div className="oa-stat-card oa-stat-minor">
              <div className="oa-stat-num">{stats.by_severity?.MINOR || 0}</div>
              <div className="oa-stat-label">MINOR Interactions</div>
            </div>
          </div>
        )}

        <div className="oa-grid">
          <div className="oa-left">

            {/* ── Upload ──────────────────────────────────────────────── */}
            <div className="oa-card">
              <div className="oa-card-title">📤 Upload Evidence Document</div>
              <div className="oa-card-desc">
                Upload FDA drug labels, WHO guidelines, clinical protocols, or any medical PDF/TXT.
                Documents are split into chunks, embedded as vectors, and stored locally.
                The offline clinical tool will immediately use the new knowledge.
              </div>

              <div
                className={`oa-dropzone ${dragOver ? "oa-dropzone-active" : ""} ${uploading ? "oa-dropzone-uploading" : ""}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => !uploading && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md"
                  onChange={handleFileInput}
                  style={{ display: "none" }}
                />
                {uploading ? (
                  <>
                    <div className="oa-drop-spinner" />
                    <div className="oa-drop-text">Processing document...</div>
                    <div className="oa-drop-sub">Extracting text · Generating embeddings · Storing locally</div>
                  </>
                ) : (
                  <>
                    <div className="oa-drop-icon">📄</div>
                    <div className="oa-drop-text">
                      {dragOver ? "Drop to upload" : "Drag & drop or click to upload"}
                    </div>
                    <div className="oa-drop-sub">PDF, TXT, MD supported · All processing done locally</div>
                  </>
                )}
              </div>

              {uploadMsg && <div className="oa-upload-success">{uploadMsg}</div>}
              {uploadErr && <div className="oa-upload-error">{uploadErr}</div>}
            </div>

            {/* ── Sources ─────────────────────────────────────────────── */}
            {stats?.sources && stats.sources.length > 0 && (
              <div className="oa-card">
                <div className="oa-card-title">📚 Ingested Sources</div>
                <div className="oa-sources-list">
                  {stats.sources.map((s, i) => (
                    <div key={i} className="oa-source-row">
                      <div className="oa-source-icon">
                        {s.source.endsWith(".pdf") ? "📄" :
                         s.source.endsWith(".txt") ? "📝" : "📋"}
                      </div>
                      <div className="oa-source-info">
                        <div className="oa-source-name">{s.source}</div>
                        <div className="oa-source-count">{s.count} knowledge chunks</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="oa-right">

            {/* ── Search ──────────────────────────────────────────────── */}
            <div className="oa-card">
              <div className="oa-card-title">🔍 Search Knowledge Base</div>
              <div className="oa-card-desc">
                Test what evidence exists for any drug or interaction query.
              </div>
              <div className="oa-search-row">
                <input
                  className="oa-input"
                  placeholder="e.g. warfarin bleeding risk, metformin kidney"
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                />
                <button
                  className="oa-btn-search"
                  onClick={handleSearch}
                  disabled={searching || !searchQ.trim()}
                >
                  {searching ? "Searching..." : "Search"}
                </button>
              </div>

              {searchRes.length > 0 && (
                <div className="oa-search-results">
                  {searchRes.map((r, i) => (
                    <div key={i} className="oa-result-item">
                      <div className="oa-result-header">
                        <span className="oa-result-pair">{r.drug_pair}</span>
                        <span className="oa-result-badge" style={{
                          background: severityBg(r.severity),
                          color: severityColor(r.severity),
                          border: `1px solid ${severityColor(r.severity)}40`,
                        }}>
                          {r.severity}
                        </span>
                        <span className="oa-result-score">score: {r.score?.toFixed(3)}</span>
                      </div>
                      <div className="oa-result-text">{r.abstract_text?.slice(0, 200)}...</div>
                      <div className="oa-result-source">{r.source}</div>
                    </div>
                  ))}
                </div>
              )}

              {searchRes.length === 0 && searchQ && !searching && (
                <div className="oa-no-results">No results found for "{searchQ}"</div>
              )}
            </div>

            {/* ── Instructions ────────────────────────────────────────── */}
            <div className="oa-card oa-info-card">
              <div className="oa-card-title">ℹ️ How Document Ingestion Works</div>
              <div className="oa-steps">
                <div className="oa-step">
                  <span className="oa-step-num">1</span>
                  <span><strong>Upload</strong> — PDF or TXT document uploaded here</span>
                </div>
                <div className="oa-step">
                  <span className="oa-step-num">2</span>
                  <span><strong>Extract</strong> — Text extracted from document locally</span>
                </div>
                <div className="oa-step">
                  <span className="oa-step-num">3</span>
                  <span><strong>Chunk</strong> — Split into 400-word overlapping segments</span>
                </div>
                <div className="oa-step">
                  <span className="oa-step-num">4</span>
                  <span><strong>Embed</strong> — Each chunk converted to 384-dim vector</span>
                </div>
                <div className="oa-step">
                  <span className="oa-step-num">5</span>
                  <span><strong>Store</strong> — Saved to local SQLite database</span>
                </div>
                <div className="oa-step">
                  <span className="oa-step-num">6</span>
                  <span><strong>Available</strong> — Clinical tool immediately uses new knowledge</span>
                </div>
              </div>
              <div className="oa-info-note">
                🔒 All processing happens locally. No data leaves the device.
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}