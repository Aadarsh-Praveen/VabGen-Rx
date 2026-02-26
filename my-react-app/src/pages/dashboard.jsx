import { useEffect, useState } from "react";
import Nav from "../components/nav";
import "./dashboard.css";

const statsCards = [
  { title: "TOTAL PATIENTS",      value: 284, sub: "▲ 12 this month",    icon: "👥", color: "blue"   },
  { title: "PATIENTS IN",         value: 21,  sub: "▲ 3 from yesterday", icon: "🏥", color: "yellow" },
  { title: "PATIENTS OUT",        value: 17,  sub: "▼ 2 from yesterday", icon: "🚶", color: "orange" },
  { title: "PENDING LAB RESULTS", value: 5,   sub: "12 critical flags",  icon: "🧪", color: "red"    },
];

// Static time/type/status/room — only name is dynamic
const APPT_META = [
  { time: "08:30 AM", type: "Follow-Up",   typeColor: "blue",   status: "Checked In", statusColor: "green",  room: "Room 12" },
  { time: "09:00 AM", type: "Urgent",      typeColor: "red",    status: "Waiting",    statusColor: "orange", room: "Room 8"  },
  { time: "09:45 AM", type: "New Patient", typeColor: "purple", status: "Scheduled",  statusColor: "gray",   room: "Room 15" },
  { time: "10:30 AM", type: "Emergency",   typeColor: "red",    status: "Critical",   statusColor: "red",    room: "ICU-3"   },
  { time: "11:00 AM", type: "Procedure",   typeColor: "teal",   status: "Scheduled",  statusColor: "gray",   room: "Room 20" },
];

const AVATAR_COLORS = ["#1a73e8", "#f59e0b", "#8b5cf6", "#ef4444", "#10b981"];

const timeline = [
  { time: "07:00", label: "Morning Ward Rounds",        sub: "Ward 4B – 8 patients reviewed",            color: "#10b981" },
  { time: "07:45", label: "Nurse Handover Briefing",    sub: "Station 2 – overnight updates",            color: "#10b981" },
  { time: "08:30", label: "OPD Consultations",          sub: "Room 12 – 5 patients booked",              color: "#1a73e8" },
  { time: "09:15", label: "Lab Results Review",         sub: "5 pending results – 2 flagged critical",   color: "#ef4444" },
  { time: "10:00", label: "New Patient Assessment",     sub: "Room 15 – Sofia Reyes, PT-00513",          color: "#8b5cf6" },
  { time: "10:30", label: "Emergency Consult – Ali N.", sub: "ICU-3 – Cardiac event monitoring",         color: "#ef4444" },
  { time: "11:30", label: "Prescription Approvals",     sub: "Pharmacy – 4 scripts pending sign-off",    color: "#8b5cf6" },
  { time: "12:00", label: "Lunch Break",                sub: "Doctors' Lounge – 30 min",                 color: "#d1d5db" },
  { time: "13:00", label: "Department Meeting",         sub: "Conference Room B – 45 min",               color: "#f59e0b" },
  { time: "14:00", label: "Procedure: Priya O.",        sub: "Cath Lab – Angioplasty",                   color: "#1a73e8" },
  { time: "15:30", label: "Post-Op Follow-Ups",         sub: "Room 7 – 3 post-surgery check-ins",        color: "#10b981" },
  { time: "16:30", label: "Referral Review",            sub: "Neurology reply PT-00421 – action needed", color: "#f59e0b" },
  { time: "17:00", label: "End of Day Notes",           sub: "Update records & discharge summaries",     color: "#667085" },
];

const alerts = [
  { color: "#ef4444", title: "Critical Lab – Ali Nassar",  desc: "Troponin 1: 2.1 ng/mL — Cardiac marker elevated. Immediate review." },
  { color: "#f59e0b", title: "Drug Interaction Warning",    desc: "Warfarin + new Rx for Priya Osel. Verify before dispensing." },
  { color: "#1a73e8", title: "Referral Response Received",  desc: "Neurology reply for PT-00421 ready to review." },
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

const Dashboard = ({ user }) => {
  const [appointments, setAppointments] = useState([]);

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const res  = await fetch("http://localhost:8080/api/patients");
        const data = await res.json();
        if (res.ok && data.patients) {
          // Take first 5 patients, merge with static meta
          const appts = data.patients.slice(0, 5).map((p, i) => ({
            initials:    p.Name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
            color:       AVATAR_COLORS[i],
            name:        p.Name,
            id:          p.IP_No,
            ...APPT_META[i],
          }));
          setAppointments(appts);
        }
      } catch (err) {
        console.error("Failed to fetch patients for dashboard:", err);
      }
    };
    fetchPatients();
  }, []);

  return (
    <div className="dash-layout">
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
            <button className="dash-notif">🔔</button>
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

        {/* ── Main Grid ── */}
        <div className="dash-content-grid">

          <div className="dash-left-col">

            {/* Appointments Table */}
            <div className="dash-panel dash-appointments">
              <div className="dash-panel-header">
                <span>📋 Today's Appointments</span>
              </div>
              <table className="appt-table">
                <thead>
                  <tr>
                    {["PATIENT","TIME","TYPE","STATUS","ACTIONS"].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {appointments.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", padding: "1.5rem", color: "#aaa" }}>
                        Loading appointments...
                      </td>
                    </tr>
                  ) : (
                    appointments.map((a) => (
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
                        <td className="appt-actions">
                          <button>•••</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Row: Profile + Monthly Stats */}
            <div className="dash-bottom">

              {/* My Profile */}
              <div className="dash-panel dash-profile">
                <div className="dash-panel-header">
                  <span>🏅 My Profile</span>
                  <a href="/settings" className="dash-viewall">Edit →</a>
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
                    ["Department",  user?.department || "N/A"],
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

            </div>
          </div>

          {/* ── Right column: Timeline ── */}
          <div className="dash-panel dash-timeline">
            <div className="dash-panel-header">
              <span>🕐 Today's Timeline</span>
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
      </main>
    </div>
  );
};

export default Dashboard;