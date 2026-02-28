import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Nav from "../components/nav";
import { apiFetch } from "../services/api";
import "./patients.css";

const Badge = ({ value, type }) => (
  <span className={`pt-badge pt-badge-${type}`}>{value}</span>
);

const FilterDropdown = ({ departments, deptFilter, setDeptFilter, onClose }) => (
  <div className="pt-filter-dropdown">
    <p className="pt-filter-heading">Filter by Department</p>
    {departments.map(d => (
      <button key={d} className={`pt-filter-option${deptFilter === d ? " active" : ""}`}
        onClick={() => { setDeptFilter(d); onClose(); }}>
        {deptFilter === d && <span className="pt-filter-check">✓</span>}
        {d}
      </button>
    ))}
  </div>
);

const Patients = ({ user }) => {
  const navigate = useNavigate();
  const [patientType, setPatientType] = useState("inpatient");
  const [patients, setPatients]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [search, setSearch]           = useState("");
  const [deptFilter, setDeptFilter]   = useState("All");
  const [showFilter, setShowFilter]   = useState(false);

  useEffect(() => {
    const fetchPatients = async () => {
      setLoading(true); setError(null); setPatients([]); setDeptFilter("All");
      try {
        const endpoint = patientType === "inpatient" ? "/api/patients" : "/api/outpatients";
        const res  = await apiFetch(endpoint);
        const data = await res.json();
        if (res.ok) setPatients(data.patients);
        else setError(data.message);
      } catch {
        setError("Could not connect to server.");
      } finally {
        setLoading(false);
      }
    };
    fetchPatients();
  }, [patientType]);

  const departments = ["All", ...new Set(patients.map(p => p.Dept).filter(Boolean))];
  const filtered = patients.filter(p => {
    const matchSearch =
      p.Name?.toLowerCase().includes(search.toLowerCase()) ||
      p.IP_No?.toLowerCase().includes(search.toLowerCase()) ||
      p.OP_No?.toLowerCase().includes(search.toLowerCase()) ||
      p.Reason_for_Admission?.toLowerCase().includes(search.toLowerCase());
    return matchSearch && (deptFilter === "All" || p.Dept === deptFilter);
  });

  const getSexBadge = sex => sex === "M" ? "blue" : "pink";

  return (
    <div className="pt-layout">
      <Nav user={user} />
      <main className="pt-main">
        <div className="pt-header">
          <div>
            <h1 className="pt-title">My Patients</h1>
            <p className="pt-subtitle">{patients.length} patients in the database</p>
          </div>
          <div className="pt-type-toggle">
            <button className={`pt-type-btn${patientType === "inpatient" ? " active" : ""}`}
              onClick={() => setPatientType("inpatient")}>🏥 In-Patients</button>
            <button className={`pt-type-btn${patientType === "outpatient" ? " active" : ""}`}
              onClick={() => setPatientType("outpatient")}>🚶 Out-Patients</button>
          </div>
        </div>

        <div className="pt-filters">
          <div className="pt-search-wrap">
            <span className="pt-search-icon">🔍</span>
            <input className="pt-search" placeholder="Search by name, IP/OP No, or reason..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="pt-filter-wrap">
            <button className={`pt-filter-icon-btn${showFilter ? " active" : ""}`}
              onClick={() => setShowFilter(v => !v)} title="Filter by department">
              ⚙️ Filter
              {deptFilter !== "All" && <span className="pt-filter-dot" />}
            </button>
            {showFilter && (
              <FilterDropdown departments={departments} deptFilter={deptFilter}
                setDeptFilter={setDeptFilter} onClose={() => setShowFilter(false)} />
            )}
          </div>
        </div>

        {deptFilter !== "All" && (
          <div className="pt-active-filter">
            <span>Dept: <strong>{deptFilter}</strong></span>
            <button onClick={() => setDeptFilter("All")}>✕</button>
          </div>
        )}

        {loading && <div className="pt-state"><div className="pt-spinner" /><p>Loading patients...</p></div>}
        {error   && <div className="pt-state pt-error">⚠️ {error}</div>}

        {!loading && !error && (
          <div className="pt-table-wrap">
            <table className="pt-table">
              <thead>
                <tr>
                  <th>#</th><th>Patient</th>
                  <th>{patientType === "inpatient" ? "IP No" : "OP No"}</th>
                  <th>Age / Sex</th><th>Dept</th><th>DOA</th>
                  <th>Reason for Admission</th><th>Patient Profile</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="pt-empty">No patients found.</td></tr>
                ) : (
                  filtered.map((p, i) => (
                    <tr key={p.IP_No || p.OP_No} className="pt-tr">
                      <td className="pt-num">{i + 1}</td>
                      <td>
                        <div className="pt-name-cell">
                          <div className="pt-mini-avatar">{p.Name?.charAt(0)}</div>
                          <span className="pt-name">{p.Name}</span>
                        </div>
                      </td>
                      <td><span className="pt-ip">{p.IP_No || p.OP_No}</span></td>
                      <td>{p.Age} <Badge value={p.Sex === "M" ? "M" : "F"} type={getSexBadge(p.Sex)} /></td>
                      <td><span className="pt-dept">{p.Dept}</span></td>
                      <td>{p.DOA ? new Date(p.DOA).toLocaleDateString() : "—"}</td>
                      <td className="pt-reason">{p.Reason_for_Admission}</td>
                      <td>
                        <button className="pt-view-btn"
                          onClick={() => navigate(`/patients/${encodeURIComponent(p.IP_No || p.OP_No)}`)}>
                          View History
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
};

export default Patients;