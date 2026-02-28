import { useState, useEffect } from "react";
import Nav from "../components/nav";
import { apiFetch } from "../services/api";
import "./settings.css";

const Settings = ({ user, onUserUpdate }) => {
  const [profile, setProfile]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState("profile");
  const [theme, setTheme]         = useState(() => localStorage.getItem("theme") || "light");

  const [address, setAddress]       = useState({ street: "", city: "", state: "", zip: "", country: "" });
  const [addrMsg, setAddrMsg]       = useState(null);
  const [addrLoading, setAddrLoading] = useState(false);

  const [pwdForm, setPwdForm]   = useState({ current: "", newPwd: "", confirm: "" });
  const [pwdMsg, setPwdMsg]     = useState(null);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [showPwd, setShowPwd]   = useState({ current: false, newPwd: false, confirm: false });

  // ── Fetch profile ──────────────────────────────────────────
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
                ? JSON.parse(data.user.address)
                : data.user.address;
              setAddress(parsed);
            } catch {
              setAddress({ street: data.user.address, city: "", state: "", zip: "", country: "" });
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch profile:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [user]);

  // ── Theme toggle ───────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === "light" ? "dark" : "light");

  // ── Save address ───────────────────────────────────────────
  const handleAddressSave = async (e) => {
    e.preventDefault();
    setAddrLoading(true); setAddrMsg(null);
    try {
      const res  = await apiFetch("/api/profile/update-address", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: user.email, address }),
      });
      const data = await res.json();
      if (res.ok) {
        setAddrMsg({ type: "success", text: "Address updated successfully!" });
        setProfile(prev => ({ ...prev, address: JSON.stringify(address) }));
        if (onUserUpdate) onUserUpdate({ ...user, address: JSON.stringify(address) });
      } else {
        setAddrMsg({ type: "error", text: data.message || "Failed to update address." });
      }
    } catch {
      setAddrMsg({ type: "error", text: "Cannot connect to server." });
    } finally {
      setAddrLoading(false);
    }
  };

  // ── Change password ────────────────────────────────────────
  const handlePasswordSave = async (e) => {
    e.preventDefault();
    setPwdMsg(null);
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
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: user.email, currentPassword: pwdForm.current, newPassword: pwdForm.newPwd }),
      });
      const data = await res.json();
      if (res.ok) {
        setPwdMsg({ type: "success", text: "Password changed successfully!" });
        setPwdForm({ current: "", newPwd: "", confirm: "" });
      } else {
        setPwdMsg({ type: "error", text: data.message || "Failed to change password." });
      }
    } catch {
      setPwdMsg({ type: "error", text: "Cannot connect to server." });
    } finally {
      setPwdLoading(false);
    }
  };

  const displayUser = profile || user;
  const tabs = [
    { id: "profile",    label: "My Profile",     icon: "👤" },
    { id: "address",    label: "Address",         icon: "📍" },
    { id: "password",   label: "Change Password", icon: "🔒" },
    { id: "appearance", label: "Appearance",      icon: "🎨" },
  ];

  return (
    <div className="dash-layout">
      <Nav user={user} />
      <main className="dash-main settings-main">
        <div className="dash-topbar">
          <div>
            <h1 className="dash-greeting">⚙️ Settings</h1>
            <p className="dash-meta">Manage your account, preferences and security</p>
          </div>
        </div>

        <div className="settings-layout">
          <aside className="settings-sidebar">
            {tabs.map(t => (
              <button key={t.id} className={`stab-btn${activeTab === t.id ? " active" : ""}`}
                onClick={() => setActiveTab(t.id)}>
                <span>{t.icon}</span> {t.label}
              </button>
            ))}
          </aside>

          <section className="settings-content">

            {activeTab === "profile" && (
              <div className="settings-card">
                <h2 className="settings-card-title">My Profile</h2>
                {loading ? <p className="settings-loading">Loading profile…</p> : (
                  <>
                    <div className="profile-banner">
                      {displayUser?.image_url ? (
                        <img src={displayUser.image_url} alt="Avatar" className="sp-avatar-img" />
                      ) : (
                        <div className="sp-avatar">
                          {displayUser?.name ? displayUser.name.charAt(0).toUpperCase() : "U"}
                        </div>
                      )}
                      <div>
                        <p className="sp-name">{displayUser?.name || "—"}</p>
                        <p className="sp-role">{displayUser?.designation || "—"} · {displayUser?.department || "—"}</p>
                        <span className="sp-badge">Active</span>
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
                <h2 className="settings-card-title">📍 Address Information</h2>
                <p className="settings-card-sub">Update your residential address.</p>
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
                  {addrMsg && <p className={`sf-msg ${addrMsg.type}`}>{addrMsg.text}</p>}
                  <button type="submit" className="sf-save-btn" disabled={addrLoading}>
                    {addrLoading ? "Saving…" : "💾 Save Address"}
                  </button>
                </form>
              </div>
            )}

            {activeTab === "password" && (
              <div className="settings-card">
                <h2 className="settings-card-title">🔒 Change Password</h2>
                <p className="settings-card-sub">Keep your account secure with a strong password.</p>
                <form onSubmit={handlePasswordSave} className="settings-form">
                  {[
                    { key: "current", label: "Current Password",   placeholder: "Enter current password" },
                    { key: "newPwd",  label: "New Password",        placeholder: "Min. 6 characters" },
                    { key: "confirm", label: "Confirm New Password", placeholder: "Repeat new password" },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key} className="sf-group full">
                      <label>{label}</label>
                      <div className="sf-pwd-wrap">
                        <input type={showPwd[key] ? "text" : "password"} placeholder={placeholder}
                          value={pwdForm[key]}
                          onChange={e => setPwdForm(p => ({ ...p, [key]: e.target.value }))} />
                        <span className="sf-eye" onClick={() => setShowPwd(p => ({ ...p, [key]: !p[key] }))}>
                          {showPwd[key] ? "🙈" : "👁️"}
                        </span>
                      </div>
                    </div>
                  ))}
                  {pwdMsg && <p className={`sf-msg ${pwdMsg.type}`}>{pwdMsg.text}</p>}
                  <button type="submit" className="sf-save-btn" disabled={pwdLoading}>
                    {pwdLoading ? "Updating…" : "🔑 Update Password"}
                  </button>
                </form>
              </div>
            )}

            {activeTab === "appearance" && (
              <div className="settings-card">
                <h2 className="settings-card-title">🎨 Appearance</h2>
                <p className="settings-card-sub">Choose how VabGen Rx looks for you.</p>
                <div className="theme-options">
                  <div className={`theme-card${theme === "light" ? " selected" : ""}`} onClick={() => setTheme("light")}>
                    <div className="theme-preview light-preview">
                      <div className="tp-sidebar" /><div className="tp-body"><div className="tp-bar" /><div className="tp-bar short" /></div>
                    </div>
                    <p className="theme-label">☀️ Light Mode</p>
                    {theme === "light" && <span className="theme-check">✓ Active</span>}
                  </div>
                  <div className={`theme-card${theme === "dark" ? " selected" : ""}`} onClick={() => setTheme("dark")}>
                    <div className="theme-preview dark-preview">
                      <div className="tp-sidebar" /><div className="tp-body"><div className="tp-bar" /><div className="tp-bar short" /></div>
                    </div>
                    <p className="theme-label">🌙 Dark Mode</p>
                    {theme === "dark" && <span className="theme-check">✓ Active</span>}
                  </div>
                </div>
                <div className="theme-toggle-row">
                  <span>Current: <strong>{theme === "light" ? "Light" : "Dark"} Mode</strong></span>
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