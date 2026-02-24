import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import logo from "../assets/vabgen_logo.png";
import "./nav.css";

const NAV_ITEMS = {
  MAIN: [
    { label: "Dashboard",   icon: "🏠", path: "/dashboard" },
    { label: "My Patients", icon: "👤", path: "/patients" },
   
  ],
  TOOLS: [
    { label: "Calculators", icon: "🧮", path: "/calculators" },
    { label: "Settings",    icon: "⚙️", path: "/settings" },
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
  const [profile, setProfile] = useState(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.email) return;
      try {
        const res = await fetch(`/api/profile?email=${encodeURIComponent(user.email)}`);
        const data = await res.json();
        if (res.ok) setProfile(data.user);
      } catch (err) {
        console.error('Failed to fetch profile:', err);
      }
    };
    fetchProfile();
  }, [user]);

  const handleLogoutConfirm = () => {
    setShowLogoutModal(false);
    navigate("/login");
  };

  const displayUser = profile || user;

  return (
    <>
      <aside className="nav-sidebar">
        {/* Logo / Brand */}
        <div className="nav-brand">
          <img src={logo} alt="VabGen Rx" className="nav-logo" />
          <span className="nav-brand-name">
            VabGen <span className="nav-r">R</span><span className="nav-x">x</span>
          </span>
        </div>

        {/* Navigation Links */}
        <nav className="nav-links">
          <NavSection title="MAIN"  items={NAV_ITEMS.MAIN} />
          <NavSection title="TOOLS" items={NAV_ITEMS.TOOLS} />

          {/* Logout Button */}
          <div className="nav-section">
            <button
              className="nav-item nav-logout-btn"
              onClick={() => setShowLogoutModal(true)}
            >
              <span className="nav-icon">🚪</span>
              <span className="nav-label">Logout</span>
            </button>
          </div>
        </nav>

        {/* User Footer */}
        <div className="nav-footer">
          {displayUser?.image_url ? (
            <img
              src={displayUser.image_url}
              alt="Profile"
              className="nav-avatar-img"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
          ) : null}
          <div
            className="nav-avatar"
            style={{ display: displayUser?.image_url ? 'none' : 'flex' }}
          >
            {displayUser?.name ? displayUser.name.charAt(0).toUpperCase() : "U"}
          </div>
          <div className="nav-user-info">
            <p className="nav-user-name">{displayUser?.name || "User"}</p>
            <p className="nav-user-role">
              {displayUser?.designation || "Staff"}
              {displayUser?.department ? ` • ${displayUser.department}` : ""}
            </p>
          </div>
          <span className="nav-online-dot" />
        </div>
      </aside>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="logout-overlay">
          <div className="logout-modal">
            <div className="logout-icon">🚪</div>
            <h3 className="logout-title">Confirm Logout</h3>
            <p className="logout-msg">Are you sure you want to logout from VabGen Rx?</p>
            <div className="logout-actions">
              <button
                className="logout-cancel"
                onClick={() => setShowLogoutModal(false)}
              >
                Cancel
              </button>
              <button
                className="logout-confirm"
                onClick={handleLogoutConfirm}
              >
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