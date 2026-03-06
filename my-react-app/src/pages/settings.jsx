import { useState, useEffect } from "react";
import Nav from "../components/nav";
import { apiFetch } from "../services/api";
import "./settings.css";

// ── SVG Icons ─────────────────────────────────────────────────
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

// ── Tab config ────────────────────────────────────────────────
const TABS = [
  { id: "profile",    label: "My Profile",     Icon: ProfileIcon  },
  { id: "address",    label: "Address",         Icon: MapPinIcon   },
  { id: "password",   label: "Change Password", Icon: LockIcon     },
  { id: "appearance", label: "Appearance",      Icon: PaletteIcon  },
];

// ── Component ──────────────────────────────────────────────────
const Settings = ({ user, onUserUpdate }) => {
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
              const parsed = typeof data.user.address === "string"
                ? JSON.parse(data.user.address) : data.user.address;
              setAddress(parsed);
            } catch {
              setAddress({ street: data.user.address, city: "", state: "", zip: "", country: "" });
            }
          }
        }
      } catch (err) { console.error("Failed to fetch profile:", err); }
      finally { setLoading(false); }
    };
    fetchProfile();
  }, [user]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === "light" ? "dark" : "light");

  const handleAddressSave = async (e) => {
    e.preventDefault();
    setAddrLoading(true); setAddrMsg(null);
    try {
      const res  = await apiFetch("/api/profile/update-address", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, address }),
      });
      const data = await res.json();
      if (res.ok) {
        setAddrMsg({ type: "success", text: "Address updated successfully!" });
        setProfile(prev => ({ ...prev, address: JSON.stringify(address) }));
        if (onUserUpdate) onUserUpdate({ ...user, address: JSON.stringify(address) });
      } else { setAddrMsg({ type: "error", text: data.message || "Failed to update address." }); }
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
        setPwdMsg({ type: "success", text: "Password changed successfully!" });
        setPwdForm({ current: "", newPwd: "", confirm: "" });
      } else { setPwdMsg({ type: "error", text: data.message || "Failed to change password." }); }
    } catch { setPwdMsg({ type: "error", text: "Cannot connect to server." }); }
    finally { setPwdLoading(false); }
  };

  const displayUser = profile || user;

  return (
    <div className="dash-layout">
      <Nav user={user} />
      <main className="dash-main settings-main">

        {/* Page Header */}
        <div className="settings-page-header">
          <div className="settings-page-header-icon"><SettingsGearIcon /></div>
          <div>
            <h1 className="settings-page-title">Settings</h1>
            <p className="settings-page-sub">Manage your account, preferences and security</p>
          </div>
        </div>

        <div className="settings-layout">

          {/* Sidebar */}
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
                {activeTab === id && <span className="stab-active-bar" />}
              </button>
            ))}
          </aside>

          {/* Content */}
          <section className="settings-content">

            {/* ── Profile ── */}
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
                    <div className="profile-banner">
                      <div className="profile-banner-bg" />
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

            {/* ── Address ── */}
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

            {/* ── Password ── */}
            {activeTab === "password" && (
              <div className="settings-card">
                <div className="settings-card-header">
                  <div className="settings-card-header-icon red"><LockIcon /></div>
                  <div>
                    <h2 className="settings-card-title">Change Password</h2>
                    <p className="settings-card-sub">Keep your account secure with a strong password</p>
                  </div>
                </div>
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

            {/* ── Appearance ── */}
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
                    { id: "light", label: "Light Mode",  Icon: SunIcon,  previewClass: "light-preview" },
                    { id: "dark",  label: "Dark Mode",   Icon: MoonIcon, previewClass: "dark-preview"  },
                  ].map(({ id, label, Icon, previewClass }) => (
                    <div
                      key={id}
                      className={`theme-card${theme === id ? " selected" : ""}`}
                      onClick={() => setTheme(id)}
                    >
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
                <div className="theme-toggle-row">
                  <div className="theme-toggle-info">
                    <span className="theme-toggle-icon">{theme === "light" ? <SunIcon /> : <MoonIcon />}</span>
                    <span>Currently using <strong>{theme === "light" ? "Light" : "Dark"} Mode</strong></span>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={theme === "dark"} onChange={toggleTheme} />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>
            )}

          </section>
        </div>
      </main>
    </div>
  );
};

export default Settings;