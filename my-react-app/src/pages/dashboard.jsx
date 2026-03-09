import { useEffect, useRef, useState } from "react";
import morningIcon   from "../assets/morning.png";
import afternoonIcon from "../assets/afternoon.png";
import eveningIcon   from "../assets/evening.png";
import Nav from "../components/nav";
import { apiFetch } from "../services/api";
import "./dashboard.css";
import PageFooter from "../components/pageFooter"
// ── SVG Icons ─────────────────────────────────────────────────
const UsersIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const HospitalIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);
const WalkIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="4" r="2"/>
    <path d="M12 6v6l-2 4"/><path d="M12 12l2 4"/><path d="M9 20l1-4"/><path d="M15 20l-1-4"/>
  </svg>
);
const LabIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 3h6v11l3.5 6H5.5L9 14V3z"/><line x1="9" y1="3" x2="15" y2="3"/>
  </svg>
);
const ClipboardIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
  </svg>
);
const ProfileIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);
const ChartIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
  </svg>
);
const ClockIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const BellIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);
const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/>
    <path d="M9 6V4h6v2"/>
  </svg>
);

// ── Time image helper ─────────────────────────────────────────
const getTimeEmoji = () => {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return <img src={morningIcon}   alt="morning"   className="dash-time-img" />;
  if (h >= 12 && h < 17) return <img src={afternoonIcon} alt="afternoon" className="dash-time-img" />;
  return <img src={eveningIcon} alt="evening" className="dash-time-img" />;
};

// ── Animated counter ──────────────────────────────────────────
const useCountUp = (target, duration = 1200) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return count;
};
const AnimatedValue = ({ value }) => { const count = useCountUp(value); return <>{count}</>; };

const useBarAnimation = (pct) => {
  const [width, setWidth] = useState(0);
  useEffect(() => { const t = setTimeout(() => setWidth(pct), 100); return () => clearTimeout(t); }, [pct]);
  return width;
};
const AnimatedBar = ({ pct, color, label }) => {
  const width = useBarAnimation(pct);
  const count = useCountUp(pct);
  return (
    <div className="mbar-row">
      <span className="mbar-label">{label}</span>
      <div className="mbar-track">
        <div className="mbar-fill" style={{ width: `${width}%`, background: color, transition: "width 1s cubic-bezier(0.4,0,0.2,1)" }} />
      </div>
      <span className="mbar-pct">{count}%</span>
    </div>
  );
};
const Badge = ({ text, color }) => <span className={`badge badge-${color}`}>{text}</span>;

// ── Static data ───────────────────────────────────────────────
const statsCards = [
  { title: "TOTAL PATIENTS",      value: 284, sub: "▲ 12 this month",    Icon: UsersIcon,    color: "blue"   },
  { title: "PATIENTS IN",         value: 21,  sub: "▲ 3 from yesterday", Icon: HospitalIcon, color: "yellow" },
  { title: "PATIENTS OUT",        value: 17,  sub: "▼ 2 from yesterday", Icon: WalkIcon,     color: "orange" },
  { title: "PENDING LAB RESULTS", value: 5,   sub: "12 critical flags",  Icon: LabIcon,      color: "red"    },
];
const APPT_META = [
  { time: "08:30 AM", type: "Follow-Up",   typeColor: "blue",   status: "Checked In", statusColor: "blue",   room: "Room 12" },
  { time: "09:00 AM", type: "Urgent",      typeColor: "orange", status: "Waiting",    statusColor: "orange", room: "Room 8"  },
  { time: "09:45 AM", type: "New Patient", typeColor: "blue",   status: "Scheduled",  statusColor: "gray",   room: "Room 15" },
  { time: "10:30 AM", type: "Emergency",   typeColor: "red",    status: "Critical",   statusColor: "red",    room: "ICU-3"   },
  { time: "11:00 AM", type: "Procedure",   typeColor: "blue",   status: "Scheduled",  statusColor: "gray",   room: "Room 20" },
];
const AVATAR_COLORS = ["#1a73e8", "#f59e0b", "#8b5cf6", "#ef4444", "#10b981"];
const timeline = [
  { time: "07:00", label: "Morning Ward Rounds",        sub: "Ward 4B – 8 patients reviewed",           color: "#1a73e8" },
  { time: "07:45", label: "Nurse Handover Briefing",    sub: "Station 2 – overnight updates",           color: "#1a73e8" },
  { time: "08:30", label: "OPD Consultations",          sub: "Room 12 – 5 patients booked",             color: "#1a73e8" },
  { time: "09:15", label: "Lab Results Review",         sub: "5 pending results – 2 flagged critical",  color: "#ef4444" },
  { time: "10:00", label: "New Patient Assessment",     sub: "Room 15 – Sofia Reyes, PT-00513",         color: "#1a73e8" },
  { time: "10:30", label: "Emergency Consult – Ali N.", sub: "ICU-3 – Cardiac event monitoring",        color: "#ef4444" },
  { time: "11:30", label: "Prescription Approvals",     sub: "Pharmacy – 4 scripts pending sign-off",   color: "#1a73e8" },
  { time: "12:00", label: "Lunch Break",                sub: "Doctors' Lounge – 30 min",                color: "#6b7280" },
  { time: "13:00", label: "Department Meeting",         sub: "Conference Room B – 45 min",              color: "#f97316" },
  { time: "14:00", label: "Procedure: Priya O.",        sub: "Cath Lab – Angioplasty",                  color: "#1a73e8" },
  { time: "15:30", label: "Post-Op Follow-Ups",         sub: "Room 7 – 3 post-surgery check-ins",       color: "#1a73e8" },
  { time: "16:30", label: "Referral Review",            sub: "Neurology reply PT-00421 – action needed",color: "#f97316" },
  { time: "17:00", label: "End of Day Notes",           sub: "Update records & discharge summaries",    color: "#6b7280" },
];
const monthlyStats = [
  { label: "Appointments",   pct: 88, color: "#1a73e8" },
  { label: "On-Time Rate",   pct: 91, color: "#10b981" },
  { label: "Follow-Up Rate", pct: 76, color: "#f59e0b" },
  { label: "Referrals Done", pct: 65, color: "#ef4444" },
];
const getGreeting    = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
const getCurrentDate = () => new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

// ── Password scheme helper ────────────────────────────────────
const getPwdScheme = (daysLeft, expired) => {
  if (expired || daysLeft <= 0) return { bg: '#fef2f2', border: '#ef4444', text: '#dc2626', bar: '#ef4444', label: 'Expired'  };
  if (daysLeft <= 5)            return { bg: '#fef2f2', border: '#ef4444', text: '#dc2626', bar: '#ef4444', label: 'Critical' };
  if (daysLeft <= 15)           return { bg: '#fffbeb', border: '#f59e0b', text: '#92400e', bar: '#f59e0b', label: 'Warning'  };
  return                               { bg: '#f0fdf4', border: '#22c55e', text: '#166534', bar: '#22c55e', label: 'Good'     };
};

// ── Component ─────────────────────────────────────────────────
const Dashboard = ({ user }) => {
  const [appointments,   setAppointments]   = useState([]);
  const [currentDate,    setCurrentDate]    = useState(getCurrentDate());
  const [showNotif,      setShowNotif]      = useState(false);
  const [notifEnabled,   setNotifEnabled]   = useState(true);
  const [pwdStatus,      setPwdStatus]      = useState(null);
  // Persist dismiss in sessionStorage — clears on browser close / new login
  const [pwdDismissed, setPwdDismissed] = useState(
    () => sessionStorage.getItem('pwdNotifDismissed') === 'true'
  );
  const notifRef = useRef(null);

  useEffect(() => {
    const handler = e => { if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotif(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setCurrentDate(getCurrentDate()), 60000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const fetchPwdStatus = async () => {
      if (!user?.email) return;
      try {
        const res  = await apiFetch(`/api/password-expiry-status?email=${encodeURIComponent(user.email)}`);
        const data = await res.json();
        if (res.ok) setPwdStatus(data);
      } catch (err) { console.error('pwd status err:', err); }
    };
    fetchPwdStatus();
  }, [user]);

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const res  = await apiFetch("/api/patients");
        const data = await res.json();
        if (res.ok && data.patients) {
          setAppointments(data.patients.slice(0, 5).map((p, i) => ({
            initials: p.Name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
            color: AVATAR_COLORS[i], name: p.Name, id: p.IP_No, ...APPT_META[i],
          })));
        }
      } catch (err) { console.error("Failed to fetch patients:", err); }
    };
    fetchPatients();
  }, []);

  const scheme         = pwdStatus ? getPwdScheme(pwdStatus.daysLeft, pwdStatus.expired) : null;
  const showPwdNotif   = pwdStatus && !pwdDismissed;
  const hasUnread      = showPwdNotif;

  const dismissPwdNotif = () => {
    sessionStorage.setItem('pwdNotifDismissed', 'true');
    setPwdDismissed(true);
  };

  const handleBellClick = () => setShowNotif(v => !v);

  return (
    <div className="dash-layout">
      <Nav user={user} />
      <main className="dash-main">

        {/* Top Bar */}
        <div className="dash-topbar">
          <div>
            <h1 className="dash-greeting">
              {getGreeting()}, {user?.name || "Doctor"}
              <span className="dash-time-icon">{getTimeEmoji()}</span>
            </h1>
            <p className="dash-meta">
              {currentDate} &nbsp;·&nbsp; {user?.department || "Hospital"} Department
            </p>
          </div>
          <div className="dash-topbar-right">
            <div className="notif-wrap" ref={notifRef}>
              <button className="dash-notif" onClick={handleBellClick}>
                <BellIcon />
                {hasUnread && <span className="notif-dot" />}
              </button>

              {showNotif && (
                <div className="notif-modal">
                  {/* Header */}
                  <div className="notif-modal-header">
                    <span className="notif-modal-title">Notifications</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {/* Clear all button */}
                      {showPwdNotif && (
                        <button
                          onClick={dismissPwdNotif}
                          title="Clear all notifications"
                          style={{
                            background: 'none', border: '1px solid #e2e8f0',
                            borderRadius: '6px', padding: '3px 8px',
                            cursor: 'pointer', fontSize: '11px', color: '#64748b',
                            display: 'flex', alignItems: 'center', gap: '4px',
                          }}
                        >
                          <TrashIcon /> Clear all
                        </button>
                      )}
                      <button
                        className={`notif-toggle-btn ${notifEnabled ? "on" : "off"}`}
                        onClick={() => setNotifEnabled(v => !v)}
                      >
                        <span className="notif-toggle-knob" />
                      </button>
                    </div>
                  </div>

                  <div className="notif-modal-body">
                    {/* ── Password Expiry Notification ── */}
                    {showPwdNotif && (
                      <div style={{
                        background: scheme.bg,
                        border: `1.5px solid ${scheme.border}`,
                        borderRadius: '10px',
                        padding: '12px 14px',
                        marginBottom: '10px',
                        position: 'relative',
                      }}>
                        {/* Individual dismiss X */}
                        <button
                          onClick={dismissPwdNotif}
                          title="Dismiss"
                          style={{
                            position: 'absolute', top: '8px', right: '8px',
                            background: 'none', border: 'none',
                            cursor: 'pointer', color: '#9ca3af', fontSize: '14px',
                            lineHeight: 1, padding: '2px 4px',
                          }}
                        >✕</button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <LockIcon />
                          <span style={{ fontWeight: 700, fontSize: '13px', color: scheme.text }}>
                            Password {pwdStatus.expired ? 'Expired' : 'Security'}
                          </span>
                          <span style={{
                            background: scheme.border, color: '#fff',
                            fontSize: '10px', fontWeight: 700,
                            padding: '2px 8px', borderRadius: '9999px',
                          }}>{scheme.label}</span>
                        </div>

                        {pwdStatus.expired ? (
                          <p style={{ margin: 0, fontSize: '12px', color: '#dc2626' }}>
                            🔒 Your password has expired. Please log out and reset it.
                          </p>
                        ) : (
                          <>
                            <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#374151' }}>
                              Your password expires in{' '}
                              <strong style={{ color: scheme.text }}>
                                {pwdStatus.daysLeft} day{pwdStatus.daysLeft !== 1 ? 's' : ''}
                              </strong>.
                              {' '}Last changed: <strong>{pwdStatus.lastChanged}</strong>.
                              {pwdStatus.daysLeft <= 15 && (
                                <span style={{ color: scheme.text }}> Please update soon!</span>
                              )}
                            </p>
                            {/* Mini progress bar */}
                            <div style={{ height: '5px', background: '#e5e7eb', borderRadius: '9999px', overflow: 'hidden', marginBottom: '10px' }}>
                              <div style={{
                                height: '100%',
                                width: `${Math.max(0, (pwdStatus.daysLeft / 90) * 100)}%`,
                                background: scheme.bar, borderRadius: '9999px',
                              }} />
                            </div>
                            <a
                              href="/settings"
                              onClick={() => setShowNotif(false)}
                              style={{
                                display: 'inline-block', fontSize: '12px', fontWeight: 600,
                                color: '#fff', background: scheme.border,
                                padding: '5px 12px', borderRadius: '6px', textDecoration: 'none',
                              }}
                            >
                              Change Password →
                            </a>
                          </>
                        )}
                      </div>
                    )}

                    {/* Empty state — shown when password notif is dismissed */}
                    {!showPwdNotif && (
                      notifEnabled ? (
                        <div className="notif-empty">
                          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d0d5dd" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                          </svg>
                          <p>No notifications</p>
                          <span>You're all caught up!</span>
                        </div>
                      ) : (
                        <div className="notif-empty notif-off-state">
                          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d0d5dd" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="1" y1="1" x2="23" y2="23"/>
                            <path d="M17.73 17.73A10 10 0 0 1 6 8"/>
                            <path d="M11.39 3.07A6 6 0 0 1 18 9c0 3.56-.91 5.96-1.93 7.56"/>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                            <path d="M3 3l18 18"/>
                          </svg>
                          <p>Notifications off</p>
                          <span>Turn on to receive alerts</span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="dash-cards">
          {statsCards.map(({ title, value, sub, Icon, color }) => (
            <div key={title} className={`dash-card dash-card-${color}`}>
              <div className="dash-card-top">
                <span className="dash-card-title">{title}</span>
                <span className={`dash-card-icon-wrap dash-icon-${color}`}><Icon /></span>
              </div>
              <p className="dash-card-value"><AnimatedValue value={value} /></p>
              <p className="dash-card-sub">{sub}</p>
            </div>
          ))}
        </div>

        <div className="dash-content-grid">
          <div className="dash-left-col">

            {/* Appointments */}
            <div className="dash-panel dash-appointments">
              <div className="dash-panel-header">
                <span className="dash-panel-title"><ClipboardIcon /> Today's Appointments</span>
              </div>
              <table className="appt-table">
                <thead>
                  <tr>{["PATIENT","TIME","TYPE","STATUS","ACTIONS"].map(h => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {appointments.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: "center", padding: "1.5rem", color: "#aaa" }}>Loading appointments...</td></tr>
                  ) : appointments.map(a => (
                    <tr key={a.id}>
                      <td>
                        <div className="appt-patient">
                          <div className="appt-avatar" style={{ background: a.color }}>{a.initials}</div>
                          <div><p className="appt-name">{a.name}</p><p className="appt-id">{a.id}</p></div>
                        </div>
                      </td>
                      <td>{a.time}</td>
                      <td><Badge text={a.type} color={a.typeColor} /></td>
                      <td><Badge text={a.status} color={a.statusColor} /></td>
                      <td className="appt-actions"><button>•••</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom Row */}
            <div className="dash-bottom">
              {/* Profile */}
              <div className="dash-panel dash-profile">
                <div className="dash-panel-header">
                  <span className="dash-panel-title"><ProfileIcon /> My Profile</span>
                  <a href="/settings" className="dash-viewall">Edit →</a>
                </div>
                <div className="profile-top">
                  {user?.image_url ? (
                    <img src={user.image_url} alt="Profile" className="profile-avatar-img"
                      style={{ width: 60, height: 60, borderRadius: "50%", objectFit: "cover" }} />
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
                    ["Department",  user?.department],
                    ["License No.", user?.licence_no],
                    ["Contact",     user?.contact_no],
                    ["Email",       user?.email],
                    ["DOB",         user?.dob],
                    ["Age",         user?.age],
                    ["Sex",         user?.sex],
                  ].map(([k, v]) => (
                    <div key={k} className="profile-row">
                      <span className="profile-key">{k}</span>
                      <span className="profile-val">{v || "N/A"}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Monthly Stats */}
              <div className="dash-panel dash-monthly">
                <div className="dash-panel-header">
                  <span className="dash-panel-title"><ChartIcon /> Monthly Stats</span>
                  <span className="dash-viewall">
                    {new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                  </span>
                </div>
                <div className="monthly-grid">
                  <div className="monthly-stat-box blue"><p className="msb-value"><AnimatedValue value={142} /></p><p className="msb-label">Patients Seen</p></div>
                  <div className="monthly-stat-box green"><p className="msb-value"><AnimatedValue value={94} />%</p><p className="msb-label">Satisfaction</p></div>
                  <div className="monthly-stat-box yellow"><p className="msb-value"><AnimatedValue value={8} /></p><p className="msb-label">Procedures</p></div>
                  <div className="monthly-stat-box gray"><p className="msb-value"><AnimatedValue value={18} />m</p><p className="msb-label">Avg. Consult</p></div>
                </div>
                <div className="monthly-bars">
                  {monthlyStats.map(s => <AnimatedBar key={s.label} pct={s.pct} color={s.color} label={s.label} />)}
                </div>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="dash-panel dash-timeline">
            <div className="dash-panel-header">
              <span className="dash-panel-title"><ClockIcon /> Today's Timeline</span>
            </div>
            <div className="timeline-list">
              {timeline.map(t => (
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
        <PageFooter />

      </main>
      
    </div>
  );
};

export default Dashboard;