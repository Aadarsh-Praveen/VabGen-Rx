import Nav from "../components/nav";
import "./dashboard.css";

const statsCards = [
  { title: "TODAY'S APPOINTMENTS", value: 12, sub: "▲ 2 from yesterday", icon: "📅", color: "blue" },
  { title: "PATIENTS UNDER CARE",  value: 38, sub: "▲ 5 this week",      icon: "🏥", color: "yellow" },
  { title: "PENDING LAB RESULTS",  value: 5,  sub: "12 critical flags",  icon: "🧪", color: "orange" },
  { title: "URGENT ALERTS",        value: 2,  sub: "⚠ Needs action",     icon: "🚨", color: "red" },
];

const appointments = [
  { initials: "MK", color: "#1a73e8", name: "Maria Kim",   id: "PT-88421", time: "08:30 AM", type: "Follow-Up",   typeColor: "blue",   status: "Checked In", statusColor: "green",  room: "Room 12" },
  { initials: "JL", color: "#f59e0b", name: "James Liu",   id: "PT-00387", time: "09:00 AM", type: "Urgent",      typeColor: "red",    status: "Waiting",    statusColor: "orange", room: "Room 8" },
  { initials: "SR", color: "#8b5cf6", name: "Sofia Reyes", id: "PT-00513", time: "09:45 AM", type: "New Patient", typeColor: "purple", status: "Scheduled",  statusColor: "gray",   room: "Room 15" },
  { initials: "AN", color: "#ef4444", name: "Ali Nassar",  id: "PT-00299", time: "10:30 AM", type: "Emergency",   typeColor: "red",    status: "Critical",   statusColor: "red",    room: "ICU-3" },
  { initials: "PO", color: "#10b981", name: "Priya Osel",  id: "PT-00691", time: "11:00 AM", type: "Procedure",   typeColor: "teal",   status: "Scheduled",  statusColor: "gray",   room: "Room 20" },
];

const timeline = [
  { time: "07:00", label: "Morning Ward Rounds",       sub: "Ward 48 – 8 patients",             color: "#10b981" },
  { time: "08:30", label: "OPD Consultations",         sub: "Room 12 – 5 patients booked",      color: "#1a73e8" },
  { time: "10:30", label: "Emergency Consult – Ali N.", sub: "ICU-3 – Cardiac event monitoring", color: "#ef4444" },
  { time: "11:30", label: "— Free Slot",               sub: "",                                 color: "#d1d5db" },
  { time: "13:00", label: "Department Meeting",        sub: "Conference Room B – 45 min",       color: "#f59e0b" },
  { time: "14:00", label: "Procedure: Priya O.",       sub: "Cath Lab – Angioplasty",            color: "#1a73e8" },
];

const alerts = [
  { color: "#ef4444", title: "Critical Lab – Ali Nassar",   desc: "Troponin 1: 2.1 ng/mL — Cardiac marker elevated. Immediate review." },
  { color: "#f59e0b", title: "Drug Interaction Warning",     desc: "Warfarin + new Rx for Priya Osel. Verify before dispensing." },
  { color: "#1a73e8", title: "Referral Response Received",   desc: "Neurology reply for PT-00421 ready to review." },
];

const monthlyStats = [
  { label: "Appointments",   pct: 88, color: "#1a73e8" },
  { label: "On-Time Rate",   pct: 91, color: "#10b981" },
  { label: "Follow-Up Rate", pct: 76, color: "#f59e0b" },
  { label: "Referrals Done", pct: 65, color: "#ef4444" },
];

const Badge = ({ text, color }) => (
  <span className={`badge badge-${color}`}>{text}</span>
);

// ✅ receives real user from App.jsx
const Dashboard = ({ user }) => {
  return (
    <div className="dash-layout">
      {/* ✅ pass real user to Nav */}
      <Nav user={user} />

      <main className="dash-main">

        {/* ── Top Bar ── */}
        <div className="dash-topbar">
          <div>
            <h1 className="dash-greeting">
              Good morning, {user?.name || "Doctor"} 👋
            </h1>
            <p className="dash-meta">
              Monday, 23 February 2026 · {user?.department || "Hospital"} Department
            </p>
          </div>
          <div className="dash-topbar-right">
            <input className="dash-search" placeholder="🔍  Search patient, record…" />
            <button className="dash-notif">🔔</button>
            <button className="dash-new-appt">+ New Appointment</button>
          </div>
        </div>

        {/* ── Stat Cards ── */}
        <div className="dash-cards">
          {statsCards.map((c) => (
            <div key={c.title} className={`dash-card dash-card-${c.color}`}>
              <div className="dash-card-top">
                <span className="dash-card-title">{c.title}</span>
                <span className="dash-card-icon">{c.icon}</span>
              </div>
              <p className="dash-card-value">{c.value}</p>
              <p className="dash-card-sub">{c.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Middle Row ── */}
        <div className="dash-mid">

          {/* Appointments Table */}
          <div className="dash-panel dash-appointments">
            <div className="dash-panel-header">
              <span>📋 Today's Appointments</span>
              <div className="dash-panel-actions">
                <select className="dash-select"><option>All Status</option></select>
                <a href="#" className="dash-viewall">View All →</a>
              </div>
            </div>
            <table className="appt-table">
              <thead>
                <tr>
                  {["PATIENT","TIME","TYPE","STATUS","ROOM","ACTIONS"].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {appointments.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div className="appt-patient">
                        <div className="appt-avatar" style={{ background: a.color }}>{a.initials}</div>
                        <div>
                          <p className="appt-name">{a.name}</p>
                          <p className="appt-id">{a.id}</p>
                        </div>
                      </div>
                    </td>
                    <td>{a.time}</td>
                    <td><Badge text={a.type} color={a.typeColor} /></td>
                    <td><Badge text={a.status} color={a.statusColor} /></td>
                    <td>{a.room}</td>
                    <td className="appt-actions">
                      <button>📄</button>
                      <button>▶</button>
                      <button>•••</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Timeline */}
          <div className="dash-panel dash-timeline">
            <div className="dash-panel-header">
              <span>🕐 Today's Timeline</span>
              <a href="#" className="dash-viewall">Full View →</a>
            </div>
            <div className="timeline-list">
              {timeline.map((t) => (
                <div key={t.time} className="timeline-item">
                  <span className="tl-time">{t.time}</span>
                  <div className="tl-dot" style={{ background: t.color }} />
                  <div className="tl-content" style={{ borderLeft: `3px solid ${t.color}` }}>
                    <p className="tl-label">{t.label}</p>
                    {t.sub && <p className="tl-sub">{t.sub}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Bottom Row ── */}
        <div className="dash-bottom">

          {/* My Profile — now shows real user data */}
          <div className="dash-panel dash-profile">
            <div className="dash-panel-header">
              <span>🏅 My Profile</span>
              <a href="#" className="dash-viewall">Edit →</a>
            </div>
            <div className="profile-top">
              {user?.image_url ? (
                <img
                  src={user.image_url}
                  alt="Profile"
                  className="profile-avatar-img"
                  style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <div className="profile-avatar">
                  {user?.name ? user.name.charAt(0).toUpperCase() : "DR"}
                </div>
              )}
              <div>
                <p className="profile-name">{user?.name || "Doctor"}</p>
                <p className="profile-role">{user?.designation || "Doctor"}</p>
                <p className="profile-meta">ID: {user?.hospital_id || "N/A"}</p>
              </div>
            </div>
            <div className="profile-rows">
              {[
                ["Department",  user?.department  || "N/A"],
                ["License No.", user?.licence_no  || "N/A"],
                ["Contact",     user?.contact_no  || "N/A"],
                ["Email",       user?.email       || "N/A"],
                ["DOB",         user?.dob         || "N/A"],
                ["Age",         user?.age         || "N/A"],
                ["Sex",         user?.sex         || "N/A"],
              ].map(([k, v]) => (
                <div key={k} className="profile-row">
                  <span className="profile-key">{k}</span>
                  <span className="profile-val">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Monthly Stats */}
          <div className="dash-panel dash-monthly">
            <div className="dash-panel-header">
              <span>📈 Monthly Stats</span>
              <span className="dash-viewall">Feb 2026</span>
            </div>
            <div className="monthly-grid">
              <div className="monthly-stat-box blue">
                <p className="msb-value">142</p>
                <p className="msb-label">Patients Seen</p>
              </div>
              <div className="monthly-stat-box green">
                <p className="msb-value">94%</p>
                <p className="msb-label">Satisfaction</p>
              </div>
              <div className="monthly-stat-box yellow">
                <p className="msb-value">8</p>
                <p className="msb-label">Procedures</p>
              </div>
              <div className="monthly-stat-box gray">
                <p className="msb-value">18m</p>
                <p className="msb-label">Avg. Consult</p>
              </div>
            </div>
            <div className="monthly-bars">
              {monthlyStats.map((s) => (
                <div key={s.label} className="mbar-row">
                  <span className="mbar-label">{s.label}</span>
                  <div className="mbar-track">
                    <div className="mbar-fill" style={{ width: `${s.pct}%`, background: s.color }} />
                  </div>
                  <span className="mbar-pct">{s.pct}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Current Patient */}
          <div className="dash-panel dash-patient">
            <div className="dash-panel-header">
              <span>❤️ Current Patient – James Liu</span>
              <a href="#" className="dash-viewall">Full Record →</a>
            </div>
            <div className="cp-top">
              <div className="cp-avatar">JL</div>
              <div>
                <p className="cp-name">James Liu</p>
                <p className="cp-meta">PT-00387 · Male, 58 yrs · Blood: A+</p>
                <p className="cp-meta">Hypertension, Type 2 Diabetes</p>
              </div>
            </div>
            <div className="cp-tabs">
              <button className="cp-tab">💊 Rx</button>
              <button className="cp-tab">🧪 Labs</button>
              <button className="cp-tab active">📝 Notes</button>
            </div>
            <div className="cp-vitals">
              {[
                { label: "HEART RATE",     value: "92 bpm",    color: "#1a73e8" },
                { label: "BLOOD PRESSURE", value: "158/96",    color: "#ef4444" },
                { label: "SPO₂",           value: "97%",       color: "#10b981" },
                { label: "TEMPERATURE",    value: "37.2°C",    color: "#f59e0b" },
                { label: "GLUCOSE",        value: "178 mg/dL", color: "#8b5cf6" },
                { label: "LAST UPDATED",   value: "08:44 AM",  color: "#6b7280" },
              ].map((v) => (
                <div key={v.label} className="vital-box">
                  <p className="vital-label">{v.label}</p>
                  <p className="vital-value" style={{ color: v.color }}>{v.value}</p>
                </div>
              ))}
            </div>
            <div className="cp-alert">
              ⚠ Alert: BP consistently elevated over last 48h. Review medication dosage.
            </div>

            {/* Active Alerts */}
            <div className="active-alerts">
              <div className="dash-panel-header" style={{ marginTop: "16px" }}>
                <span>🔴 Active Alerts</span>
                <a href="#" className="dash-viewall">Clear All</a>
              </div>
              {alerts.map((a) => (
                <div key={a.title} className="alert-item">
                  <div className="alert-dot" style={{ background: a.color }} />
                  <div>
                    <p className="alert-title">{a.title}</p>
                    <p className="alert-desc">{a.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};

export default Dashboard;