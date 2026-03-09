import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import logo         from "../assets/vabgen_logo.png";
import dashboardIcon from "../assets/dashboard.png";
import patientIcon   from "../assets/patient.png";
import settingsIcon  from "../assets/settings.png";
import logoutIcon    from "../assets/logout.png";
import "../components/styles/nav.css";

// ── PNG Icon helper ───────────────────────────────────────────
// Inverts icon to white in dark mode, keeps natural color in light mode
const NavPngIcon = ({ src, alt, active }) => (
  <img
    src={src}
    alt={alt}
    style={{
      width: 18, height: 18,
      objectFit: "contain",
      filter: "brightness(0) invert(1)",   // always white — sidebar is dark blue
      opacity: active ? 1 : 1,           // active = full, inactive = dimmed
      flexShrink: 0,
    }}
  />
);

// Logout modal icon (large, always red tint)
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
    { label: "Dashboard",   icon: dashboardIcon, alt: "dashboard", path: "/dashboard" },
    { label: "My Patients", icon: patientIcon,   alt: "patients",  path: "/patients"  },
  ],
  TOOLS: [
    { label: "Settings",    icon: settingsIcon,  alt: "settings",  path: "/settings"  },
  ],
};

const NavSection = ({ title, items }) => (
  <div className="nav-section">
    <p className="nav-section-title">{title}</p>
    {items.map(({ label, icon, alt, path, badge }) => (
      <NavLink
        key={path}
        to={path}
        className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
      >
        {({ isActive }) => (
          <>
            <span className="nav-icon">
              <NavPngIcon src={icon} alt={alt} active={isActive} />
            </span>
            <span className="nav-label">{label}</span>
            {badge && <span className="nav-badge">{badge}</span>}
          </>
        )}
      </NavLink>
    ))}
  </div>
);

const Nav = ({ user }) => {
  const navigate = useNavigate();
  const [profile, setProfile]               = useState(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";

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
          <NavSection title="MAIN"  items={NAV_ITEMS.MAIN}  />
          <NavSection title="TOOLS" items={NAV_ITEMS.TOOLS} />

          {/* Logout button */}
          <div className="nav-section">
            <button
              className="nav-item nav-logout-btn"
              onClick={() => setShowLogoutModal(true)}
            >
              <span className="nav-icon">
                <img
                  src={logoutIcon}
                  alt="logout"
                  style={{
                    width: 17, height: 17,
                    objectFit: "contain",
                    filter: "brightness(0) invert(1)",
                    opacity: 0.6,
                  }}
                />
              </span>
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
              <button className="logout-cancel"  onClick={() => setShowLogoutModal(false)}>Cancel</button>
              <button className="logout-confirm" onClick={handleLogoutConfirm}>Yes, Logout</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Nav;