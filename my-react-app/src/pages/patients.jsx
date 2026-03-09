import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Nav from "../components/nav";
import { apiFetch } from "../services/api";
import "./patients.css";
import PageFooter from "../components/pageFooter";
// ── SVG Icons ─────────────────────────────────────────────────
const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const FilterIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
  </svg>
);

const InPatientIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const OutPatientIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="4" r="2"/>
    <path d="M12 6v6l-2 4"/><path d="M12 12l2 4"/>
    <path d="M9 20l1-4"/><path d="M15 20l-1-4"/>
  </svg>
);

const WarningIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const EyeIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const UsersIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

// ── Sub-components ────────────────────────────────────────────
const Badge = ({ value, type }) => (
  <span className={`pt-badge pt-badge-${type}`}>{value}</span>
);

const FilterDropdown = ({ departments, deptFilter, setDeptFilter, onClose }) => (
  <div className="pt-filter-dropdown">
    <p className="pt-filter-heading">Filter by Department</p>
    {departments.map(d => (
      <button key={d} className={`pt-filter-option${deptFilter === d ? " active" : ""}`}
        onClick={() => { setDeptFilter(d); onClose(); }}>
        {deptFilter === d && <span className="pt-filter-check"><CheckIcon /></span>}
        {d}
      </button>
    ))}
  </div>
);

// ── Main Component ────────────────────────────────────────────
const Patients = ({ user }) => {
  const navigate = useNavigate();
  const [patientType, setPatientType] = useState("inpatient");
  const [patients,    setPatients]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [search,      setSearch]      = useState("");
  const [deptFilter,  setDeptFilter]  = useState("All");
  const [showFilter,  setShowFilter]  = useState(false);

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
    const q = search.toLowerCase();
    const matchSearch =
      p.Name?.toLowerCase().includes(q) ||
      p.IP_No?.toLowerCase().includes(q) ||
      p.OP_No?.toLowerCase().includes(q) ||
      p.Reason_for_Admission?.toLowerCase().includes(q);
    return matchSearch && (deptFilter === "All" || p.Dept === deptFilter);
  });

  const getSexBadge = sex => sex === "M" ? "blue" : "pink";

  return (
    <div className="pt-layout">
      <Nav user={user} />
      <main className="pt-main">

        {/* Header */}
        <div className="pt-header">
          <div className="pt-header-left">
            <div className="pt-header-icon"><UsersIcon /></div>
            <div>
              <h1 className="pt-title">My Patients</h1>
              <p className="pt-subtitle">{patients.length} patients in the database</p>
            </div>
          </div>
          <div className="pt-type-toggle">
            <button
              className={`pt-type-btn${patientType === "inpatient" ? " active" : ""}`}
              onClick={() => setPatientType("inpatient")}
            >
              <InPatientIcon /> In-Patients
            </button>
            <button
              className={`pt-type-btn${patientType === "outpatient" ? " active" : ""}`}
              onClick={() => setPatientType("outpatient")}
            >
              <OutPatientIcon /> Out-Patients
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="pt-filters">
          <div className="pt-search-wrap">
            <span className="pt-search-icon"><SearchIcon /></span>
            <input
              className="pt-search"
              placeholder="Search by name, IP/OP No, or reason..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="pt-filter-wrap">
            <button
              className={`pt-filter-icon-btn${showFilter ? " active" : ""}`}
              onClick={() => setShowFilter(v => !v)}
              title="Filter by department"
            >
              <FilterIcon />
              Filter
              {deptFilter !== "All" && <span className="pt-filter-dot" />}
            </button>
            {showFilter && (
              <FilterDropdown
                departments={departments}
                deptFilter={deptFilter}
                setDeptFilter={setDeptFilter}
                onClose={() => setShowFilter(false)}
              />
            )}
          </div>
        </div>

        {/* Active Filter Chip */}
        {deptFilter !== "All" && (
          <div className="pt-active-filter">
            <span>Dept: <strong>{deptFilter}</strong></span>
            <button onClick={() => setDeptFilter("All")}>✕</button>
          </div>
        )}

        {/* States */}
        {loading && <div className="pt-state"><div className="pt-spinner" /><p>Loading patients...</p></div>}
        {error   && (
          <div className="pt-state pt-error">
            <WarningIcon /> {error}
          </div>
        )}

        {/* Table */}
        {!loading && !error && (
          <div className="pt-table-wrap">
            <table className="pt-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Patient</th>
                  <th>{patientType === "inpatient" ? "IP No" : "OP No"}</th>
                  <th>Age / Sex</th>
                  <th>Dept</th>
                  <th>DOA</th>
                  <th>Reason for Admission</th>
                  <th>Patient Profile</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="pt-empty">No patients found.</td></tr>
                ) : filtered.map((p, i) => (
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
                      <button
                        className="pt-view-btn"
                        onClick={() => navigate(`/patients/${encodeURIComponent(p.IP_No || p.OP_No)}`)}
                      >
                        <EyeIcon /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PageFooter />

      </main>
    </div>
  );
};

export default Patients;