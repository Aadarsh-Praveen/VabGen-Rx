import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import logo from "../assets/vabgen_logo.png";
import "../components/styles/nav.css";

// ── SVG Icons ────────────────────────────────────────────────
const DashboardIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
);

const PatientsIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const SettingsIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33
      1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06
      a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09
      A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06
      A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51
      a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9
      a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

const LogoutIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

const LogoutModalIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
    stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

// ── Nav Items ─────────────────────────────────────────────────
const NAV_ITEMS = {
  MAIN: [
    { label: "Dashboard",   icon: <DashboardIcon />, path: "/dashboard" },
    { label: "My Patients", icon: <PatientsIcon />,  path: "/patients"  },
  ],
  TOOLS: [
    { label: "Settings",    icon: <SettingsIcon />,  path: "/settings"  },
  ],
};

const NavSection = ({ title, items }) => (
  <div className="nav-section">
    <p className="nav-section-title">{title}</p>
    {items.map(({ label, icon, path, badge }) => (
      <NavLink
        key={path}
        to={path}
        className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
      >
        <span className="nav-icon">{icon}</span>
        <span className="nav-label">{label}</span>
        {badge && <span className="nav-badge">{badge}</span>}
      </NavLink>
    ))}
  </div>
);

const Nav = ({ user }) => {
  const navigate = useNavigate();
  const [profile, setProfile]               = useState(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.email) return;
      try {
        const res  = await fetch(`/api/profile?email=${encodeURIComponent(user.email)}`);
        const data = await res.json();
        if (res.ok) setProfile(data.user);
      } catch (err) { console.error("Failed to fetch profile:", err); }
    };
    fetchProfile();
  }, [user]);

  const handleLogoutConfirm = () => { setShowLogoutModal(false); navigate("/login"); };
  const displayUser = profile || user;

  return (
    <>
      <aside className="nav-sidebar">

        {/* Brand */}
        <div className="nav-brand">
          <img src={logo} alt="VabGen Rx" className="nav-logo" />
          <span className="nav-brand-name">
            VabGen <span className="nav-r">R</span><span className="nav-x">x</span>
          </span>
        </div>

        {/* Links */}
        <nav className="nav-links">
          <NavSection title="MAIN"  items={NAV_ITEMS.MAIN} />
          <NavSection title="TOOLS" items={NAV_ITEMS.TOOLS} />

          <div className="nav-section">
            <button className="nav-item nav-logout-btn" onClick={() => setShowLogoutModal(true)}>
              <span className="nav-icon"><LogoutIcon /></span>
              <span className="nav-label">Logout</span>
            </button>
          </div>
        </nav>

        {/* Footer */}
        <div className="nav-footer" onClick={() => navigate("/settings")}>
          {displayUser?.image_url ? (
            <img
              src={displayUser.image_url}
              alt="Profile"
              className="nav-avatar-img"
              onError={e => {
                e.target.style.display = "none";
                e.target.nextSibling.style.display = "flex";
              }}
            />
          ) : null}
          <div
            className="nav-avatar"
            style={{ display: displayUser?.image_url ? "none" : "flex" }}
          >
            {displayUser?.name ? displayUser.name.charAt(0).toUpperCase() : "U"}
          </div>
          <div className="nav-user-info">
            <p className="nav-user-name">{displayUser?.name || "User"}</p>
            <p className="nav-user-role">
              {displayUser?.designation || "Staff"}
              {displayUser?.department ? ` · ${displayUser.department}` : ""}
            </p>
          </div>
          <span className="nav-online-dot" />
        </div>

      </aside>

      {/* Logout Modal */}
      {showLogoutModal && (
        <div className="logout-overlay" onClick={() => setShowLogoutModal(false)}>
          <div className="logout-modal" onClick={e => e.stopPropagation()}>
            <div className="logout-icon"><LogoutModalIcon /></div>
            <h3 className="logout-title">Confirm Logout</h3>
            <p className="logout-msg">Are you sure you want to logout from VabGen Rx?</p>
            <div className="logout-actions">
              <button className="logout-cancel" onClick={() => setShowLogoutModal(false)}>
                Cancel
              </button>
              <button className="logout-confirm" onClick={handleLogoutConfirm}>
                Yes, Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Nav;