import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import logo          from "../assets/vabgen_logo.png";
import dashboardIcon from "../assets/dashboard.png";
import patientIcon   from "../assets/patient.png";
import settingsIcon  from "../assets/settings.png";
import logoutIcon    from "../assets/logout.png";
import "../components/styles/nav.css";

const rand = (min, max) => Math.round(min + Math.random() * (max - min));

const NavBackground = ({ canvasRef, svgRef }) => {
  useEffect(() => {
    const canvas = canvasRef.current;
    const svg    = svgRef.current;
    if (!canvas || !svg) return;

    const W = 220;          // sidebar width
    const H = window.innerHeight;
    const NODE_COUNT = 10;  // fewer nodes to suit narrow sidebar

    const nodes = Array.from({ length: NODE_COUNT }, (_, i) => ({
      id: i,
      x: (0.08 + Math.random() * 0.84) * W,
      y: (0.02 + Math.random() * 0.96) * H,
      dur: 12 + Math.random() * 16,
      del: -(Math.random() * 20),
    }));

    const nodeEls = nodes.map((n) => {
      const wrap = document.createElement("div");
      wrap.className = "login-node";
      wrap.style.cssText = `
        left: ${n.x}px; top: ${n.y}px;
        --dx1: ${rand(-20,20)}px; --dy1: ${rand(-18,18)}px;
        --dx2: ${rand(-20,20)}px; --dy2: ${rand(-18,18)}px;
        --dx3: ${rand(-20,20)}px; --dy3: ${rand(-18,18)}px;
        animation: node-drift ${n.dur}s ease-in-out ${n.del}s infinite;
      `;
      const dot  = document.createElement("div");
      dot.className = "login-node-dot";
      dot.style.animationDelay = `${Math.random() * -3}s`;
      const ring = document.createElement("div");
      ring.className = "login-node-ring";
      ring.style.animationDelay = `${Math.random() * -3}s`;
      wrap.appendChild(dot);
      wrap.appendChild(ring);
      canvas.appendChild(wrap);
      return wrap;
    });

    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid slice");

    const lines = [];
    const MAX_DIST = W * 0.9;
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
          line.setAttribute("class", "login-connector");
          line.style.animationDelay = `${Math.random() * -4}s`;
          svg.appendChild(line);
          lines.push(line);
        });
    });

    return () => {
      nodeEls.forEach((el) => el.remove());
      lines.forEach((el)   => el.remove());
    };
  }, [canvasRef, svgRef]);

  return null;
};

const NavPngIcon = ({ src, alt }) => (
  <img src={src} alt={alt} className="nav-png-icon" />
);

const LogoutModalIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
    stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

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
      <NavLink key={path} to={path} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
        {({ isActive }) => (
          <>
            <span className="nav-icon"><NavPngIcon src={icon} alt={alt} active={isActive} /></span>
            <span className="nav-label">{label}</span>
            {badge && <span className="nav-badge">{badge}</span>}
          </>
        )}
      </NavLink>
    ))}
  </div>
);

const Nav = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [profile,         setProfile]        = useState(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const canvasRef = useRef(null);
  const svgRef    = useRef(null);

  useEffect(() => {
    if (!user?.email) return;
    const fetchProfile = async () => {
      try {
        const res  = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/profile?email=${encodeURIComponent(user.email)}`);
        const data = await res.json();
        if (res.ok) setProfile(data.user);
      } catch (err) { console.error("Failed to fetch profile:", err); }
    };
    fetchProfile();
  }, [user]);

  const handleLogoutConfirm = () => {
    setShowLogoutModal(false);
    onLogout();
  };

  const displayUser = profile || user;

  return (
    <>
      <aside className="nav-sidebar">

        {/* ── Background layers ── */}
        <div className="nav-bg-blob nav-bg-blob-1" />
        <div className="nav-bg-blob nav-bg-blob-2" />
        <div className="nav-bg-blob nav-bg-blob-3" />
        <svg className="nav-bg-svg" ref={svgRef} />
        <div className="nav-bg-canvas" ref={canvasRef} />
        <NavBackground canvasRef={canvasRef} svgRef={svgRef} />

        {/* ── Mesh dot overlay ── */}
        <div className="nav-bg-mesh" />

        <div className="nav-brand">
          <img src={logo} alt="VabGen Rx" className="nav-logo" />
          <span className="nav-brand-name">
            VabGen <span className="nav-r">R</span><span className="nav-x">x</span>
          </span>
        </div>

        <nav className="nav-links">
          <NavSection title="MAIN"  items={NAV_ITEMS.MAIN}  />
          <NavSection title="TOOLS" items={NAV_ITEMS.TOOLS} />
          <div className="nav-section">
            <button className="nav-item nav-logout-btn" onClick={() => setShowLogoutModal(true)}>
              <span className="nav-icon">
                <img src={logoutIcon} alt="logout" className="nav-png-icon nav-png-icon-dim" />
              </span>
              <span className="nav-label">Logout</span>
            </button>
          </div>
        </nav>

        <div className="nav-footer" onClick={() => navigate("/settings")}>
          {displayUser?.image_url && (
            <img src={displayUser.image_url} alt="Profile" className="nav-avatar-img"
              onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }} />
          )}
          <div className="nav-avatar" style={{ display: displayUser?.image_url ? "none" : "flex" }}>
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