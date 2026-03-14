import { useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { updateUser } from "../store/authSlice";
import Nav from "../components/nav";
import { apiFetch } from "../services/api";
import "./settings.css";
import PageFooter from "../components/pageFooter";

/* ── Profile banner animated background ── */
const rand = (min, max) => Math.round(min + Math.random() * (max - min));

const BannerBackground = ({ canvasRef, svgRef }) => {
  useEffect(() => {
    const canvas = canvasRef.current;
    const svg    = svgRef.current;
    if (!canvas || !svg) return;

    const W = canvas.offsetWidth  || 800;
    const H = canvas.offsetHeight || 120;
    const NODE_COUNT = 14;

    const nodes = Array.from({ length: NODE_COUNT }, (_, i) => ({
      id: i,
      x: (0.02 + Math.random() * 0.96) * W,
      y: (0.05 + Math.random() * 0.90) * H,
      dur: 10 + Math.random() * 14,
      del: -(Math.random() * 16),
    }));

    const nodeEls = nodes.map((n) => {
      const wrap = document.createElement("div");
      wrap.className = "banner-node";
      wrap.style.cssText = `
        left:${n.x}px; top:${n.y}px;
        --dx1:${rand(-18,18)}px; --dy1:${rand(-12,12)}px;
        --dx2:${rand(-18,18)}px; --dy2:${rand(-12,12)}px;
        --dx3:${rand(-18,18)}px; --dy3:${rand(-12,12)}px;
        animation: node-drift ${n.dur}s ease-in-out ${n.del}s infinite;
      `;
      const dot  = document.createElement("div");
      dot.className = "banner-node-dot";
      dot.style.animationDelay = `${Math.random() * -3}s`;
      const ring = document.createElement("div");
      ring.className = "banner-node-ring";
      ring.style.animationDelay = `${Math.random() * -3}s`;
      wrap.appendChild(dot);
      wrap.appendChild(ring);
      canvas.appendChild(wrap);
      return wrap;
    });

    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid slice");

    const lines = [];
    const MAX_DIST = W * 0.28;
    nodes.forEach((a) => {
      nodes
        .filter((b) => b.id !== a.id)
        .map((b) => ({ b, d: Math.hypot(b.x - a.x, b.y - a.y) }))
        .sort((x, y) => x.d - y.d)
        .slice(0, 2)
        .forEach(({ b, d }) => {
          if (d > MAX_DIST) return;
          const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
          line.setAttribute("x1", a.x); line.setAttribute("y1", a.y);
          line.setAttribute("x2", b.x); line.setAttribute("y2", b.y);
          line.setAttribute("class", "banner-connector");
          line.style.animationDelay = `${Math.random() * -4}s`;
          svg.appendChild(line);
          lines.push(line);
        });
    });

    return () => {
      nodeEls.forEach(el => el.remove());
      lines.forEach(el => el.remove());
    };
  }, [canvasRef, svgRef]);

  return null;
};

/* ── Icons (unchanged) ── */
const ProfileIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);
const MapPinIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);
const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);
const PaletteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/>
    <circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/>
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
  </svg>
);
const SettingsGearIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);
const EyeOpen = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);
const EyeClosed = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);
const SaveIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
    <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
  </svg>
);
const KeyIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
  </svg>
);
const SunIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);
const MoonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);
const CheckCircleIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);
const AlertIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);
const ShieldIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

const TABS = [
  { id: "profile",    label: "My Profile",     Icon: ProfileIcon  },
  { id: "address",    label: "Address",         Icon: MapPinIcon   },
  { id: "password",   label: "Change Password", Icon: LockIcon     },
  { id: "appearance", label: "Appearance",      Icon: PaletteIcon  },
];

const getPwdScheme = (daysLeft, expired) => {
  if (expired || daysLeft <= 0) return { bg: '#fef2f2', border: '#ef4444', text: '#dc2626', bar: '#ef4444', label: 'Expired'  };
  if (daysLeft <= 5)            return { bg: '#fef2f2', border: '#ef4444', text: '#dc2626', bar: '#ef4444', label: 'Critical' };
  if (daysLeft <= 15)           return { bg: '#fffbeb', border: '#f59e0b', text: '#92400e', bar: '#f59e0b', label: 'Warning'  };
  if (daysLeft <= 30)           return { bg: '#eff6ff', border: '#3b82f6', text: '#1d4ed8', bar: '#3b82f6', label: 'Notice'   };
  return                               { bg: '#f0fdf4', border: '#22c55e', text: '#166534', bar: '#22c55e', label: 'Good'     };
};

const Settings = ({ onLogout }) => {
  const dispatch = useDispatch();
  const user     = useSelector(state => state.auth.user);

  const [profile,     setProfile]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [activeTab,   setActiveTab]   = useState("profile");
  const [theme,       setTheme]       = useState(() => localStorage.getItem("theme") || "light");
  const [address,     setAddress]     = useState({ street: "", city: "", state: "", zip: "", country: "" });
  const [addrMsg,     setAddrMsg]     = useState(null);
  const [addrLoading, setAddrLoading] = useState(false);
  const [pwdForm,     setPwdForm]     = useState({ current: "", newPwd: "", confirm: "" });
  const [pwdMsg,      setPwdMsg]      = useState(null);
  const [pwdLoading,  setPwdLoading]  = useState(false);
  const [showPwd,     setShowPwd]     = useState({ current: false, newPwd: false, confirm: false });
  const [pwdStatus,   setPwdStatus]   = useState(null);

  /* banner animation refs */
  const bannerCanvasRef = useRef(null);
  const bannerSvgRef    = useRef(null);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.email) return;
      try {
        const res  = await apiFetch(`/api/profile?email=${encodeURIComponent(user.email)}`);
        const data = await res.json();
        if (res.ok) {
          setProfile(data.user);
          if (data.user.address) {
            try {
              const parsed = typeof data.user.address === "string" ? JSON.parse(data.user.address) : data.user.address;
              setAddress(parsed);
            } catch { setAddress({ street: data.user.address, city: "", state: "", zip: "", country: "" }); }
          }
        }
      } catch (err) { console.error("Failed to fetch profile:", err); }
      finally { setLoading(false); }
    };
    fetchProfile();
  }, [user]);

  useEffect(() => {
    const fetchPwdStatus = async () => {
      if (!user?.email) return;
      try {
        const res  = await apiFetch(`/api/password-expiry-status?email=${encodeURIComponent(user.email)}`);
        const data = await res.json();
        if (res.ok) setPwdStatus(data);
      } catch (err) { console.error("pwd status err:", err); }
    };
    fetchPwdStatus();
  }, [user]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const handleAddressSave = async (e) => {
    e.preventDefault(); setAddrLoading(true); setAddrMsg(null);
    try {
      const res  = await apiFetch("/api/profile/update-address", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, address }),
      });
      const data = await res.json();
      if (res.ok) {
        const updated = { ...user, address: JSON.stringify(address) };
        setProfile(prev => ({ ...prev, address: JSON.stringify(address) }));
        dispatch(updateUser(updated));
        setAddrMsg({ type: "success", text: "Address updated successfully!" });
      } else {
        setAddrMsg({ type: "error", text: data.message || "Failed to update address." });
      }
    } catch { setAddrMsg({ type: "error", text: "Cannot connect to server." }); }
    finally { setAddrLoading(false); }
  };

  const handlePasswordSave = async (e) => {
    e.preventDefault(); setPwdMsg(null);
    if (!pwdForm.current || !pwdForm.newPwd || !pwdForm.confirm) {
      setPwdMsg({ type: "error", text: "Please fill in all fields." }); return;
    }
    if (pwdForm.newPwd.length < 6) {
      setPwdMsg({ type: "error", text: "New password must be at least 6 characters." }); return;
    }
    if (pwdForm.newPwd !== pwdForm.confirm) {
      setPwdMsg({ type: "error", text: "New passwords do not match." }); return;
    }
    setPwdLoading(true);
    try {
      const res  = await apiFetch("/api/profile/change-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, currentPassword: pwdForm.current, newPassword: pwdForm.newPwd }),
      });
      const data = await res.json();
      if (res.ok) {
        setPwdMsg({ type: "success", text: "Password changed successfully! Your 90-day clock has been reset." });
        setPwdForm({ current: "", newPwd: "", confirm: "" });
        const r2 = await apiFetch(`/api/password-expiry-status?email=${encodeURIComponent(user.email)}`);
        const d2 = await r2.json();
        if (r2.ok) setPwdStatus(d2);
      } else {
        setPwdMsg({ type: "error", text: data.message || "Failed to change password." });
      }
    } catch { setPwdMsg({ type: "error", text: "Cannot connect to server." }); }
    finally { setPwdLoading(false); }
  };

  const displayUser = profile || user;
  const scheme      = pwdStatus ? getPwdScheme(pwdStatus.daysLeft, pwdStatus.expired) : null;
  const progress    = pwdStatus ? Math.max(0, Math.min(100, (pwdStatus.daysLeft / 90) * 100)) : 100;

  return (
    <div className="dash-layout">
      <Nav user={user} onLogout={onLogout} />
      <main className="dash-main settings-main">

        <div className="settings-page-header">
          <div className="settings-page-header-icon"><SettingsGearIcon /></div>
          <div>
            <h1 className="settings-page-title">Settings</h1>
            <p className="settings-page-sub">Manage your account, preferences and security</p>
          </div>
        </div>

        <div className="settings-layout">
          <aside className="settings-sidebar">
            <p className="settings-sidebar-label">Account</p>
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={`stab-btn${activeTab === id ? " active" : ""}`}
                onClick={() => setActiveTab(id)}
              >
                <span className="stab-icon"><Icon /></span>
                {label}
                {id === "password" && pwdStatus && (
                  <span style={{
                    marginLeft: 'auto', color: '#fff', fontSize: '10px', fontWeight: 700,
                    padding: '2px 7px', borderRadius: '9999px',
                    background: pwdStatus.expired || pwdStatus.daysLeft <= 5  ? '#ef4444'
                              : pwdStatus.daysLeft <= 15 ? '#f59e0b'
                              : pwdStatus.daysLeft <= 30 ? '#3b82f6'
                              : '#22c55e',
                  }}>
                    {pwdStatus.expired ? 'EXP' : `${pwdStatus.daysLeft}d`}
                  </span>
                )}
                {activeTab === id && <span className="stab-active-bar" />}
              </button>
            ))}
          </aside>

          <section className="settings-content">

            {activeTab === "profile" && (
              <div className="settings-card">
                <div className="settings-card-header">
                  <div className="settings-card-header-icon blue"><ProfileIcon /></div>
                  <div>
                    <h2 className="settings-card-title">My Profile</h2>
                    <p className="settings-card-sub">Your personal and professional information</p>
                  </div>
                </div>

                {loading ? (
                  <div className="settings-loading"><div className="pt-spinner" /></div>
                ) : (
                  <>
                    {/* ── Profile banner with node animation ── */}
                    <div className="profile-banner">
                      {/* animated layers — clipped inside banner via overflow:hidden on .profile-banner */}
                      <div className="banner-blob banner-blob-1" />
                      <div className="banner-blob banner-blob-2" />
                      <div className="banner-mesh" />
                      <svg  className="banner-svg"    ref={bannerSvgRef}    />
                      <div  className="banner-canvas" ref={bannerCanvasRef} />
                      <BannerBackground canvasRef={bannerCanvasRef} svgRef={bannerSvgRef} />

                      {/* actual content sits above bg */}
                      <div className="profile-banner-content">
                        {displayUser?.image_url ? (
                          <img src={displayUser.image_url} alt="Avatar" className="sp-avatar-img" />
                        ) : (
                          <div className="sp-avatar">
                            {displayUser?.name ? displayUser.name.charAt(0).toUpperCase() : "U"}
                          </div>
                        )}
                        <div className="sp-info">
                          <p className="sp-name">{displayUser?.name || "—"}</p>
                          <p className="sp-role">{displayUser?.designation || "—"} · {displayUser?.department || "—"}</p>
                          <div className="sp-badges">
                            <span className="sp-badge green">Active</span>
                            <span className="sp-badge blue">{displayUser?.hospital_id || "—"}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="sp-grid">
                      {[
                        ["Hospital ID",   displayUser?.hospital_id],
                        ["Email",         displayUser?.email],
                        ["Contact No.",   displayUser?.contact_no],
                        ["Department",    displayUser?.department],
                        ["Designation",   displayUser?.designation],
                        ["License No.",   displayUser?.licence_no],
                        ["Date of Birth", displayUser?.dob],
                        ["Age",           displayUser?.age],
                        ["Sex",           displayUser?.sex],
                      ].map(([k, v]) => (
                        <div key={k} className="sp-field">
                          <span className="sp-label">{k}</span>
                          <span className="sp-value">{v || "—"}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === "address" && (
              <div className="settings-card">
                <div className="settings-card-header">
                  <div className="settings-card-header-icon orange"><MapPinIcon /></div>
                  <div>
                    <h2 className="settings-card-title">Address Information</h2>
                    <p className="settings-card-sub">Update your residential or clinic address</p>
                  </div>
                </div>
                <form onSubmit={handleAddressSave} className="settings-form">
                  <div className="sf-group full">
                    <label>Street / House No.</label>
                    <input type="text" placeholder="e.g. 42 Main Street, Apt 3B"
                      value={address.street} onChange={e => setAddress(p => ({ ...p, street: e.target.value }))} />
                  </div>
                  <div className="sf-group">
                    <label>City</label>
                    <input type="text" placeholder="City"
                      value={address.city} onChange={e => setAddress(p => ({ ...p, city: e.target.value }))} />
                  </div>
                  <div className="sf-group">
                    <label>State / Province</label>
                    <input type="text" placeholder="State"
                      value={address.state} onChange={e => setAddress(p => ({ ...p, state: e.target.value }))} />
                  </div>
                  <div className="sf-group">
                    <label>ZIP / Postal Code</label>
                    <input type="text" placeholder="ZIP"
                      value={address.zip} onChange={e => setAddress(p => ({ ...p, zip: e.target.value }))} />
                  </div>
                  <div className="sf-group">
                    <label>Country</label>
                    <input type="text" placeholder="Country"
                      value={address.country} onChange={e => setAddress(p => ({ ...p, country: e.target.value }))} />
                  </div>
                  {addrMsg && (
                    <div className={`sf-msg ${addrMsg.type}`}>
                      {addrMsg.type === "success" ? <CheckCircleIcon /> : <AlertIcon />}
                      {addrMsg.text}
                    </div>
                  )}
                  <button type="submit" className="sf-save-btn" disabled={addrLoading}>
                    {addrLoading ? "Saving…" : <><SaveIcon /> Save Address</>}
                  </button>
                </form>
              </div>
            )}

            {activeTab === "password" && (
              <div className="settings-card">
                <div className="settings-card-header">
                  <div className="settings-card-header-icon red"><LockIcon /></div>
                  <div>
                    <h2 className="settings-card-title">Change Password</h2>
                    <p className="settings-card-sub">Keep your account secure with a strong password</p>
                  </div>
                </div>

                {pwdStatus && scheme && (
                  <div style={{
                    background: scheme.bg, border: `1.5px solid ${scheme.border}`,
                    borderRadius: '12px', padding: '18px 20px', marginBottom: '24px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <ShieldIcon />
                      <span style={{ fontWeight: 700, fontSize: '14px', color: scheme.text }}>Password Security Status</span>
                      <span style={{ marginLeft: 'auto', background: scheme.border, color: '#fff', fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '9999px' }}>{scheme.label}</span>
                    </div>
                    <p style={{ margin: '0 0 12px', fontSize: '14px', color: '#374151' }}>
                      {pwdStatus.expired ? (
                        <span style={{ color: '#dc2626', fontWeight: 600 }}>Your password has expired. Please change it immediately.</span>
                      ) : (
                        <>
                          Your password expires in{' '}
                          <strong style={{ color: scheme.text, fontSize: '16px' }}>{pwdStatus.daysLeft} day{pwdStatus.daysLeft !== 1 ? 's' : ''}</strong>
                          {pwdStatus.daysLeft <= 5  && ' — change it now to avoid being blocked!'}
                          {pwdStatus.daysLeft > 5 && pwdStatus.daysLeft <= 15 && ' — please update it soon.'}
                        </>
                      )}
                    </p>
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280', marginBottom: '5px' }}>
                        <span>0 days</span>
                        <span style={{ color: scheme.text, fontWeight: 600 }}>{pwdStatus.daysLeft} days remaining</span>
                        <span>90 days</span>
                      </div>
                      <div style={{ height: '8px', background: '#e5e7eb', borderRadius: '9999px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${progress}%`, background: scheme.bar, borderRadius: '9999px', transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {[['Last Changed', pwdStatus.lastChanged], ['Days Since Change', `${pwdStatus.daysSinceChange} days ago`], ['Policy', '90-day rotation']].map(([k, v]) => (
                        <div key={k} style={{ background: 'rgba(255,255,255,0.7)', borderRadius: '8px', padding: '8px 14px', flex: 1, minWidth: '120px' }}>
                          <span style={{ display: 'block', fontSize: '10px', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{k}</span>
                          <span style={{ display: 'block', fontSize: '13px', color: '#1e293b', fontWeight: 600 }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pwd-tips">
                  <p>Password must be at least <strong>6 characters</strong> and contain a mix of letters and numbers.</p>
                </div>

                <form onSubmit={handlePasswordSave} className="settings-form">
                  {[
                    { key: "current", label: "Current Password",    placeholder: "Enter your current password" },
                    { key: "newPwd",  label: "New Password",         placeholder: "Min. 6 characters"           },
                    { key: "confirm", label: "Confirm New Password", placeholder: "Repeat your new password"    },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key} className="sf-group full">
                      <label>{label}</label>
                      <div className="sf-pwd-wrap">
                        <input
                          type={showPwd[key] ? "text" : "password"}
                          placeholder={placeholder}
                          value={pwdForm[key]}
                          onChange={e => setPwdForm(p => ({ ...p, [key]: e.target.value }))}
                        />
                        <button type="button" className="sf-eye" onClick={() => setShowPwd(p => ({ ...p, [key]: !p[key] }))}>
                          {showPwd[key] ? <EyeClosed /> : <EyeOpen />}
                        </button>
                      </div>
                    </div>
                  ))}
                  {pwdMsg && (
                    <div className={`sf-msg ${pwdMsg.type}`}>
                      {pwdMsg.type === "success" ? <CheckCircleIcon /> : <AlertIcon />}
                      {pwdMsg.text}
                    </div>
                  )}
                  <button type="submit" className="sf-save-btn" disabled={pwdLoading}>
                    {pwdLoading ? "Updating…" : <><KeyIcon /> Update Password</>}
                  </button>
                </form>
              </div>
            )}

            {activeTab === "appearance" && (
              <div className="settings-card">
                <div className="settings-card-header">
                  <div className="settings-card-header-icon purple"><PaletteIcon /></div>
                  <div>
                    <h2 className="settings-card-title">Appearance</h2>
                    <p className="settings-card-sub">Choose how VabGen Rx looks for you</p>
                  </div>
                </div>
                <div className="theme-options">
                  {[
                    { id: "light", label: "Light Mode", Icon: SunIcon,  previewClass: "light-preview" },
                    { id: "dark",  label: "Dark Mode",  Icon: MoonIcon, previewClass: "dark-preview"  },
                  ].map(({ id, label, Icon, previewClass }) => (
                    <div key={id} className={`theme-card${theme === id ? " selected" : ""}`} onClick={() => setTheme(id)}>
                      <div className={`theme-preview ${previewClass}`}>
                        <div className="tp-sidebar" />
                        <div className="tp-body">
                          <div className="tp-bar" /><div className="tp-bar short" />
                          <div className="tp-card-row">
                            <div className="tp-mini-card" /><div className="tp-mini-card" /><div className="tp-mini-card" />
                          </div>
                        </div>
                      </div>
                      <div className="theme-card-footer">
                        <span className="theme-icon-wrap"><Icon /></span>
                        <p className="theme-label">{label}</p>
                        {theme === id && <span className="theme-check">Active</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </section>
        </div>

        <PageFooter />
      </main>
    </div>
  );
};

export default Settings;