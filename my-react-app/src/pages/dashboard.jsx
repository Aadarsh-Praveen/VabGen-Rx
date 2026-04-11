import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import morningIcon    from "../assets/morning.png";
import afternoonIcon  from "../assets/afternoon.png";
import eveningIcon    from "../assets/evening.png";
import patientIcon    from "../assets/patient.png";
import inPatientIcon  from "../assets/in_patient.png";
import outPatientIcon from "../assets/out_patient.png";
import labIcon        from "../assets/lab.png";
import Nav            from "../components/nav";
import { apiFetch }   from "../services/api";
import "./dashboard.css";
import PageFooter from "../components/pageFooter";

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
    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);

const getTimeEmoji = () => {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return <img src={morningIcon}   alt="morning"   className="dash-time-img" />;
  if (h >= 12 && h < 17) return <img src={afternoonIcon} alt="afternoon" className="dash-time-img" />;
  return <img src={eveningIcon} alt="evening" className="dash-time-img" />;
};

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

const AnimatedValue = ({ value }) => <>{useCountUp(value)}</>;

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

const statsCards = [
  { title: "TOTAL PATIENTS",      value: 284, sub: "▲ 12 this month",    icon: patientIcon,    color: "blue"   },
  { title: "PATIENTS IN",         value: 21,  sub: "▲ 3 from yesterday", icon: inPatientIcon,  color: "yellow" },
  { title: "PATIENTS OUT",        value: 17,  sub: "▼ 2 from yesterday", icon: outPatientIcon, color: "orange" },
  { title: "PENDING LAB RESULTS", value: 5,   sub: "12 critical flags",  icon: labIcon,        color: "red"    },
];

const AVATAR_COLORS = ["#1a73e8", "#f59e0b", "#8b5cf6", "#ef4444", "#10b981"];

// Map appointment status → badge color
const STATUS_COLOR_MAP = {
  'Scheduled':  'gray',
  'Checked In': 'blue',
  'Waiting':    'orange',
  'Completed':  'green',
  'Cancelled':  'red',
};

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
const formatDOB      = (dob) => { if (!dob) return "N/A"; try { return new Date(dob).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }); } catch { return dob; } };

const getPwdScheme = (daysLeft, expired) => {
  if (expired || daysLeft <= 0) return { bg: '#fef2f2', border: '#ef4444', text: '#dc2626', bar: '#ef4444', label: 'Expired'  };
  if (daysLeft <= 5)            return { bg: '#fef2f2', border: '#ef4444', text: '#dc2626', bar: '#ef4444', label: 'Critical' };
  if (daysLeft <= 15)           return { bg: '#fffbeb', border: '#f59e0b', text: '#92400e', bar: '#f59e0b', label: 'Warning'  };
  return                               { bg: '#f0fdf4', border: '#22c55e', text: '#166534', bar: '#22c55e', label: 'Good'     };
};

// Reusable dropdown button style
const dropBtn = (color, hoverBg) => ({
  base: {
    width: '100%', padding: '10px 14px',
    background: '#ffffff', border: 'none',
    display: 'flex', alignItems: 'center', gap: '10px',
    fontSize: '13px', fontWeight: 600, color,
    cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s',
  },
  enter: (e) => { e.currentTarget.style.background = hoverBg; },
  leave: (e) => { e.currentTarget.style.background = '#ffffff'; },
});

const Dashboard = ({ user, onLogout }) => {
  const navigate = useNavigate();

  const [appointments,  setAppointments]  = useState([]);
  const [apptLoading,   setApptLoading]   = useState(true);
  const [currentDate,   setCurrentDate]   = useState(getCurrentDate());
  const [showNotif,     setShowNotif]     = useState(false);
  const [notifEnabled,  setNotifEnabled]  = useState(true);
  const [pwdStatus,     setPwdStatus]     = useState(null);
  const [pwdDismissed,  setPwdDismissed]  = useState(() => sessionStorage.getItem('pwdNotifDismissed') === 'true');
  const [heldRows,      setHeldRows]      = useState({});
  const [noteModal,     setNoteModal]     = useState(null);
  const [noteText,      setNoteText]      = useState('');
  const [noteSent,      setNoteSent]      = useState(false);
  const [openMenu,      setOpenMenu]      = useState(null);
  const [statusUpdating,setStatusUpdating]= useState(null); // appointment ID being updated
  const menuRef  = useRef({});
  const notifRef = useRef(null);

  useEffect(() => {
    const h = (e) => { if (!Object.values(menuRef.current).some(el => el && el.contains(e.target))) setOpenMenu(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    const h = e => { if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotif(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setCurrentDate(getCurrentDate()), 60000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!user?.email) return;
    apiFetch(`/api/password-expiry-status?email=${encodeURIComponent(user.email)}`)
      .then(r => r.json()).then(d => setPwdStatus(d)).catch(() => {});
  }, [user]);

  // ── Fetch today's real appointments for this doctor ──────────────────────
  useEffect(() => {
    const load = async () => {
      if (!user?.name) return;
      setApptLoading(true);
      try {
        const res  = await apiFetch(`/api/appointments/doctor/${encodeURIComponent(user.name)}`);
        const data = await res.json();
        const all  = data.appointments || [];

        // Filter to today only
        const todayStr = new Date().toISOString().split('T')[0];
        const todayAppt = all.filter(a => {
          const d = a.Appointment_Date || '';
          // SQL Server may return full datetime string — just check prefix
          return d.startsWith(todayStr) || d.slice(0, 10) === todayStr;
        });

        setAppointments(todayAppt.map((a, i) => ({
          // ── identity ──
          apptId:      a.ID,
          id:          a.Patient_No  || '—',
          patientType: a.Patient_Type || '—',
          name:        a.Patient_Name || '—',
          dept:        a.Doctor_Dept  || '—',
          reason:      a.Reason       || '',
          // ── display ──
          initials:    (a.Patient_Name || 'PT')
                         .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
          color:       AVATAR_COLORS[i % AVATAR_COLORS.length],
          time:        a.Appointment_Time || '—',
          type:        'Appointment',
          typeColor:   'blue',
          status:      a.Status || 'Scheduled',
          statusColor: STATUS_COLOR_MAP[a.Status] || 'gray',
        })));
      } catch (err) {
        console.error('Failed to fetch appointments:', err);
      } finally {
        setApptLoading(false);
      }
    };
    load();
  }, [user?.name]);

  const scheme       = pwdStatus ? getPwdScheme(pwdStatus.daysLeft, pwdStatus.expired) : null;
  const showPwdNotif = pwdStatus && !pwdDismissed;
  const dismissPwdNotif = () => { sessionStorage.setItem('pwdNotifDismissed', 'true'); setPwdDismissed(true); };

  const handleHold     = (id) => { setHeldRows(prev => ({ ...prev, [id]: true })); setOpenMenu(null); openNoteModal(id); };
  const handleRetrieve = (id) => setHeldRows(prev => { const n = { ...prev }; delete n[id]; return n; });
  const openNoteModal  = (id) => { setNoteModal(id); setNoteText(''); setNoteSent(false); };
  const closeNoteModal = ()   => { setNoteModal(null); setNoteText(''); setNoteSent(false); };
  const sendNote       = ()   => { if (!noteText.trim()) return; setNoteSent(true); setTimeout(closeNoteModal, 2000); };

  // ── Update appointment status in DB + local state ────────────────────────
  const handleStatusChange = async (apptId, rowId, newStatus) => {
    setStatusUpdating(apptId);
    setOpenMenu(null);
    try {
      await apiFetch('/api/appointments/update-status', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: apptId, status: newStatus }),
      });
      setAppointments(prev => prev.map(a =>
        a.apptId === apptId
          ? { ...a, status: newStatus, statusColor: STATUS_COLOR_MAP[newStatus] || 'gray' }
          : a
      ));
    } catch (err) {
      console.error('Status update failed:', err);
    } finally {
      setStatusUpdating(null);
    }
  };

  const viewBtn     = dropBtn('#1a73e8', '#eff6ff');
  const holdBtn     = dropBtn('#92400e', '#fffbeb');
  const notesBtn    = dropBtn('#6d28d9', '#f5f3ff');
  const retrieveBtn = dropBtn('#065f46', '#f0fdf4');
  const checkinBtn  = dropBtn('#0369a1', '#e0f2fe');
  const completeBtn = dropBtn('#166534', '#f0fdf4');
  const cancelBtn   = dropBtn('#991b1b', '#fef2f2');

  return (
    <div className="dash-layout">
      <Nav user={user} onLogout={onLogout} />
      <main className="dash-main">

        <div className="dash-topbar">
          <div>
            <h1 className="dash-greeting">
              {getGreeting()}, {user?.name || "Doctor"}
              <span className="dash-time-icon">{getTimeEmoji()}</span>
            </h1>
            <p className="dash-meta">{currentDate} &nbsp;·&nbsp; {user?.department || "Hospital"} Department</p>
          </div>

          <div className="dash-topbar-right">
            <div className="notif-wrap" ref={notifRef}>
              <button className="dash-notif" onClick={() => setShowNotif(v => !v)}>
                <BellIcon />
                {showPwdNotif && <span className="notif-dot" />}
              </button>

              {showNotif && (
                <div className="notif-modal">
                  <div className="notif-modal-header">
                    <span className="notif-modal-title">Notifications</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {showPwdNotif && (
                        <button onClick={dismissPwdNotif} title="Clear all" style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <TrashIcon /> Clear all
                        </button>
                      )}
                      <button className={`notif-toggle-btn ${notifEnabled ? "on" : "off"}`} onClick={() => setNotifEnabled(v => !v)}>
                        <span className="notif-toggle-knob" />
                      </button>
                    </div>
                  </div>

                  <div className="notif-modal-body">
                    {showPwdNotif && scheme && (
                      <div style={{ background: scheme.bg, border: `1.5px solid ${scheme.border}`, borderRadius: '10px', padding: '12px 14px', marginBottom: '10px', position: 'relative' }}>
                        <button onClick={dismissPwdNotif} style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '14px', lineHeight: 1, padding: '2px 4px' }}>✕</button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <LockIcon />
                          <span style={{ fontWeight: 700, fontSize: '13px', color: scheme.text }}>Password {pwdStatus.expired ? 'Expired' : 'Security'}</span>
                          <span style={{ background: scheme.border, color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px' }}>{scheme.label}</span>
                        </div>
                        {pwdStatus.expired ? (
                          <p style={{ margin: 0, fontSize: '12px', color: '#dc2626' }}>🔒 Your password has expired. Please log out and reset it.</p>
                        ) : (
                          <>
                            <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#374151' }}>
                              Your password expires in <strong style={{ color: scheme.text }}>{pwdStatus.daysLeft} day{pwdStatus.daysLeft !== 1 ? 's' : ''}</strong>.{' '}
                              Last changed: <strong>{pwdStatus.lastChanged}</strong>.
                              {pwdStatus.daysLeft <= 15 && <span style={{ color: scheme.text }}> Please update soon!</span>}
                            </p>
                            <div style={{ height: '5px', background: '#e5e7eb', borderRadius: '9999px', overflow: 'hidden', marginBottom: '10px' }}>
                              <div style={{ height: '100%', width: `${Math.max(0, (pwdStatus.daysLeft / 90) * 100)}%`, background: scheme.bar, borderRadius: '9999px' }} />
                            </div>
                            <button onClick={() => { setShowNotif(false); navigate('/settings'); }} style={{ fontSize: '12px', fontWeight: 600, color: '#fff', background: scheme.border, padding: '5px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}>
                              Change Password →
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    {!showPwdNotif && (
                      notifEnabled ? (
                        <div className="notif-empty">
                          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d0d5dd" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                          <p>No notifications</p><span>You're all caught up!</span>
                        </div>
                      ) : (
                        <div className="notif-empty notif-off-state">
                          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d0d5dd" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M17.73 17.73A10 10 0 0 1 6 8"/><path d="M11.39 3.07A6 6 0 0 1 18 9c0 3.56-.91 5.96-1.93 7.56"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M3 3l18 18"/></svg>
                          <p>Notifications off</p><span>Turn on to receive alerts</span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="dash-cards">
          {statsCards.map(({ title, value, sub, icon, color }) => (
            <div key={title} className={`dash-card dash-card-${color}`}>
              <div className="dash-card-top">
                <span className="dash-card-title">{title}</span>
                <span className={`dash-card-icon-wrap dash-icon-${color}`}>
                  <img src={icon} alt={title} style={{ width: 26, height: 26, objectFit: 'contain' }} />
                </span>
              </div>
              <p className="dash-card-value"><AnimatedValue value={value} /></p>
              <p className="dash-card-sub">
                <span style={{ color: sub.startsWith('▲') ? '#16a34a' : sub.startsWith('▼') ? '#dc2626' : 'inherit' }}>{sub.charAt(0)}</span>
                {sub.slice(1)}
              </p>
            </div>
          ))}
        </div>

        <div className="dash-content-grid">
          <div className="dash-left-col">

            {/* ── Appointments Table ── */}
            <div className="dash-panel dash-appointments">
              <div className="dash-panel-header">
                <span className="dash-panel-title"><ClipboardIcon /> Today's Appointments</span>
                <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                  {!apptLoading && `${appointments.length} appointment${appointments.length !== 1 ? 's' : ''}`}
                </span>
              </div>
              <table className="appt-table">
                <thead>
                  <tr>{["PATIENT", "TIME", "REASON", "STATUS", "DEPT", "ACTIONS"].map(h => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {apptLoading ? (
                    <tr><td colSpan={6} style={{ textAlign: "center", padding: "1.5rem", color: "#aaa" }}>Loading appointments…</td></tr>
                  ) : appointments.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: "2rem", color: "#9ca3af" }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                          <span style={{ fontSize: '13px' }}>No appointments today</span>
                        </div>
                      </td>
                    </tr>
                  ) : appointments.map(a => {
                    const isHeld    = !!heldRows[a.id];
                    const isUpdating = statusUpdating === a.apptId;
                    return (
                      <tr key={`${a.apptId}-${a.id}`} style={{ opacity: isHeld ? 0.7 : 1, background: isHeld ? '#f8fafc' : '', filter: isHeld ? 'grayscale(40%)' : 'none', transition: 'all 0.3s ease', position: 'relative' }}>

                        {/* Patient cell */}
                        <td>
                          <div className="appt-patient">
                            <div className="appt-avatar" style={{ background: a.color }}>{a.initials}</div>
                            <div>
                              <p className="appt-name">{a.name}</p>
                              <p className="appt-id">
                                {a.id}
                                <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '9999px', background: a.patientType === 'IP' ? '#dbeafe' : '#dcfce7', color: a.patientType === 'IP' ? '#1d4ed8' : '#166534' }}>
                                  {a.patientType}
                                </span>
                                {isHeld && (
                                  <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 700, padding: '1px 8px', borderRadius: '9999px', background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>
                                    ON HOLD
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Time */}
                        <td style={{ whiteSpace: 'nowrap' }}>{a.time}</td>

                        {/* Reason */}
                        <td>
                          <p style={{ margin: 0, fontSize: '12px', color: '#374151', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.reason}>
                            {a.reason || <span style={{ color: '#d1d5db' }}>—</span>}
                          </p>
                        </td>

                        {/* Status */}
                        <td>
                          {isUpdating
                            ? <span style={{ fontSize: '11px', color: '#9ca3af' }}>Updating…</span>
                            : <Badge text={a.status} color={a.statusColor} />
                          }
                        </td>

                        {/* Dept */}
                        <td style={{ fontSize: '12px', color: '#6b7280' }}>{a.dept || '—'}</td>

                        {/* Actions */}
                        <td className="appt-actions" style={{ opacity: 1, filter: 'none' }}>
                          <div style={{ position: 'relative', display: 'inline-block' }} ref={el => menuRef.current[a.apptId] = el}>
                            <button
                              onClick={() => setOpenMenu(prev => prev === a.apptId ? null : a.apptId)}
                              style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #e5e7eb', background: openMenu === a.apptId ? '#f3f4f6' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', color: '#6b7280', transition: 'background 0.15s' }}
                            >⋮</button>

                            {openMenu === a.apptId && (
                              <div style={{ position: 'absolute', right: 0, top: '38px', background: '#ffffff', borderRadius: '10px', boxShadow: '0 12px 36px rgba(0,0,0,0.16)', border: '1.5px solid #e2e8f0', minWidth: '175px', zIndex: 999, overflow: 'hidden', isolation: 'isolate' }}>

                                {/* View patient record */}
                                <button style={viewBtn.base} onMouseEnter={viewBtn.enter} onMouseLeave={viewBtn.leave}
                                  onClick={() => { setOpenMenu(null); navigate(`/patients/${a.id}`); }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                  View Patient
                                </button>

                                <div style={{ height: '1px', background: '#f1f5f9', margin: '0 10px' }} />

                                {/* Status change options — only show relevant ones */}
                                {a.status === 'Scheduled' && (
                                  <button style={checkinBtn.base} onMouseEnter={checkinBtn.enter} onMouseLeave={checkinBtn.leave}
                                    onClick={() => handleStatusChange(a.apptId, a.id, 'Checked In')}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                                    Check In
                                  </button>
                                )}

                                {(a.status === 'Checked In' || a.status === 'Waiting') && (
                                  <button style={completeBtn.base} onMouseEnter={completeBtn.enter} onMouseLeave={completeBtn.leave}
                                    onClick={() => handleStatusChange(a.apptId, a.id, 'Completed')}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                    Mark Complete
                                  </button>
                                )}

                                {a.status !== 'Cancelled' && a.status !== 'Completed' && (
                                  <button style={cancelBtn.base} onMouseEnter={cancelBtn.enter} onMouseLeave={cancelBtn.leave}
                                    onClick={() => handleStatusChange(a.apptId, a.id, 'Cancelled')}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                                    Cancel
                                  </button>
                                )}

                                <div style={{ height: '1px', background: '#f1f5f9', margin: '0 10px' }} />

                                {/* Hold / retrieve */}
                                {!isHeld ? (
                                  <button style={holdBtn.base} onMouseEnter={holdBtn.enter} onMouseLeave={holdBtn.leave}
                                    onClick={() => handleHold(a.id)}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                                    Hold Patient
                                  </button>
                                ) : (
                                  <>
                                    <button style={notesBtn.base} onMouseEnter={notesBtn.enter} onMouseLeave={notesBtn.leave}
                                      onClick={() => { openNoteModal(a.id); setOpenMenu(null); }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                                      Hold Notes
                                    </button>
                                    <div style={{ height: '1px', background: '#f1f5f9', margin: '0 10px' }} />
                                    <button style={retrieveBtn.base} onMouseEnter={retrieveBtn.enter} onMouseLeave={retrieveBtn.leave}
                                      onClick={() => { handleRetrieve(a.id); setOpenMenu(null); }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>
                                      Retrieve Patient
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="dash-bottom">
              <div className="dash-panel dash-profile">
                <div className="dash-panel-header">
                  <span className="dash-panel-title"><ProfileIcon /> My Profile</span>
                  <button onClick={() => navigate('/settings')} className="dash-viewall" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>Edit →</button>
                </div>
                <div className="profile-top">
                  {user?.image_url ? (
                    <img src={user.image_url} alt="Profile" style={{ width: 60, height: 60, borderRadius: "50%", objectFit: "cover" }} />
                  ) : (
                    <div className="profile-avatar">{user?.name ? user.name.charAt(0).toUpperCase() : "DR"}</div>
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
                    ["DOB",         formatDOB(user?.dob)],
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

              <div className="dash-panel dash-monthly">
                <div className="dash-panel-header">
                  <span className="dash-panel-title"><ChartIcon /> Monthly Stats</span>
                  <span className="dash-viewall">{new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
                </div>
                <div className="monthly-grid">
                  <div className="monthly-stat-box blue">  <p className="msb-value"><AnimatedValue value={142} /></p><p className="msb-label">Patients Seen</p></div>
                  <div className="monthly-stat-box green"> <p className="msb-value"><AnimatedValue value={94} />%</p><p className="msb-label">Satisfaction</p></div>
                  <div className="monthly-stat-box yellow"><p className="msb-value"><AnimatedValue value={8} /></p> <p className="msb-label">Procedures</p></div>
                  <div className="monthly-stat-box gray">  <p className="msb-value"><AnimatedValue value={18} />m</p><p className="msb-label">Avg. Consult</p></div>
                </div>
                <div className="monthly-bars">
                  {monthlyStats.map(s => <AnimatedBar key={s.label} pct={s.pct} color={s.color} label={s.label} />)}
                </div>
              </div>
            </div>
          </div>

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

        {/* ── Hold Note Modal ── */}
        {noteModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={e => { if (e.target === e.currentTarget) closeNoteModal(); }}>
            <div style={{ background: '#fff', borderRadius: '16px', padding: '28px 32px', width: '100%', maxWidth: '420px', boxShadow: '0 24px 48px rgba(0,0,0,0.18)', position: 'relative' }}>
              <button onClick={closeNoteModal} style={{ position: 'absolute', top: '14px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#9ca3af', lineHeight: 1 }}>✕</button>

              {!noteSent ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: '15px', color: '#111827' }}>Hold Note</p>
                      <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>Patient: <strong>{appointments.find(a => a.id === noteModal)?.name}</strong> &nbsp;·&nbsp; {noteModal}</p>
                    </div>
                  </div>
                  <p style={{ fontSize: '12.5px', color: '#6b7280', margin: '12px 0 10px' }}>Enter a note for the front desk regarding this hold:</p>
                  <textarea autoFocus rows={4} value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="e.g. Patient stepped out — will return in 15 mins. Please keep slot open."
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '9px', border: '1.5px solid #d0d5dd', fontSize: '13.5px', fontFamily: 'inherit', resize: 'vertical', outline: 'none', color: '#111827', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
                    onFocus={e => e.target.style.borderColor = '#8b5cf6'} onBlur={e => e.target.style.borderColor = '#d0d5dd'}
                  />
                  <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                    <button onClick={closeNoteModal} style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1.5px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
                      Skip
                    </button>
                    <button onClick={sendNote} disabled={!noteText.trim()} style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: noteText.trim() ? 'linear-gradient(135deg,#8b5cf6,#6d28d9)' : '#e5e7eb', color: noteText.trim() ? '#fff' : '#9ca3af', fontSize: '13.5px', fontWeight: 600, cursor: noteText.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                      Send to Front Desk
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: '16px', color: '#111827' }}>Note Sent!</p>
                  <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>Your hold note has been sent to the front desk successfully.</p>
                </div>
              )}
            </div>
          </div>
        )}

        <PageFooter />
      </main>
    </div>
  );
};

export default Dashboard;