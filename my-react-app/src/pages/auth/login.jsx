import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useDispatch } from "react-redux";
import { loginSuccess } from "../../store/authSlice";
import logo from "../../assets/vabgen_logo.png";
import "./login.css";
import AccountLockedModal from "../../components/accountLockedModal";
import AboutSection from "../../components/aboutSection";

const rand = (min, max) => Math.round(min + Math.random() * (max - min));

const LoginBackground = ({ canvasRef, svgRef }) => {
  useEffect(() => {
    const canvas = canvasRef.current;
    const svg    = svgRef.current;
    if (!canvas || !svg) return;

    // Use real pixel dimensions of the hero section
    const W = canvas.offsetWidth  || window.innerWidth;
    const H = canvas.offsetHeight || window.innerHeight;

    const NODE_COUNT = 18;
    const nodes = Array.from({ length: NODE_COUNT }, (_, i) => ({
      id: i,
      // Store as real pixel values
      x: (0.08 + Math.random() * 0.84) * W,
      y: (0.05 + Math.random() * 0.90) * H,
      dur: 12 + Math.random() * 16,
      del: -(Math.random() * 20),
    }));

    // Render glowing nodes
    const nodeEls = nodes.map((n) => {
      const wrap = document.createElement("div");
      wrap.className = "login-node";
      wrap.style.cssText = `
        left: ${n.x}px;
        top:  ${n.y}px;
        --dx1: ${rand(-30, 30)}px; --dy1: ${rand(-25, 25)}px;
        --dx2: ${rand(-30, 30)}px; --dy2: ${rand(-25, 25)}px;
        --dx3: ${rand(-30, 30)}px; --dy3: ${rand(-25, 25)}px;
        animation: node-drift ${n.dur}s ease-in-out ${n.del}s infinite;
      `;
      const dot = document.createElement("div");
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

    // SVG viewBox matches real pixel dimensions
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid slice");

    const lines = [];
    const MAX_DIST = W * 0.22; // connect nodes within ~22% of screen width

    nodes.forEach((a) => {
      nodes
        .filter((b) => b.id !== a.id)
        .map((b)    => ({ b, d: Math.hypot(b.x - a.x, b.y - a.y) }))
        .sort((x, y) => x.d - y.d)
        .slice(0, 2)
        .forEach(({ b, d }) => {
          if (d > MAX_DIST) return;
          const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
          line.setAttribute("x1", a.x);
          line.setAttribute("y1", a.y);
          line.setAttribute("x2", b.x);
          line.setAttribute("y2", b.y);
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

const EyeOpen = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);
const EyeClosed = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);
const MailIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
);
const LockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const pwdWarningColor = (days) => ({
  bg:     days <= 5  ? "#fef2f2" : days <= 15 ? "#fffbeb" : "#f0fdf4",
  border: days <= 5  ? "#ef4444" : days <= 15 ? "#f59e0b" : "#22c55e",
  text:   days <= 5  ? "#dc2626" : days <= 15 ? "#92400e" : "#166534",
});

const Login = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [formData,    setFormData]    = useState({ email: "", password: "", remember: false });
  const [showPwd,     setShowPwd]     = useState(false);
  const [msg,         setMsg]         = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [lockedEmail, setLockedEmail] = useState(null);
  const [pwdWarning,  setPwdWarning]  = useState(null);

  const canvasRef = useRef(null);
  const svgRef    = useRef(null);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.email || !formData.password) {
      setMsg({ type: "danger", text: "Please fill in all fields." });
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const res  = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email, password: formData.password }),
      });
      const data = await res.json();

      if (res.status === 423 || data.locked) {
        setLockedEmail(data.email || formData.email);
        return;
      }
      if (res.status === 403 && data.passwordExpired) {
        setMsg({ type: "danger", text: "Your password has expired after 90 days.", expired: true, email: data.email || formData.email });
        return;
      }
      if (res.ok) {
        dispatch(loginSuccess({ user: data.user, token: data.token }));
        if (data.passwordWarning) setPwdWarning(data.passwordWarning);
        navigate("/dashboard");
      } else {
        setMsg({ type: "danger", text: data.message || "Invalid email or password." });
      }
    } catch {
      setMsg({ type: "danger", text: "Cannot connect to server. Make sure backend is running." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">

      {lockedEmail && (
        <AccountLockedModal
          email={lockedEmail}
          reason={msg?.expired ? "expired" : "locked"}
          onClose={() => {
            setLockedEmail(null);
            setFormData(prev => ({ ...prev, password: "" }));
            setMsg(null);
          }}
        />
      )}

      {pwdWarning && (() => {
        const c = pwdWarningColor(pwdWarning.daysLeft);
        return (
          <div className="pwd-warning-banner" style={{ background: c.bg, borderBottomColor: c.border }}>
            <span className="pwd-warning-text" style={{ color: c.text }}>
              Password Security:{" "}
              <strong>{pwdWarning.daysLeft} day{pwdWarning.daysLeft !== 1 ? "s" : ""}</strong> remaining
              until your 90-day password change is required.
              {pwdWarning.daysLeft <= 15 && " Please update it in Settings → Change Password."}
            </span>
            <button className="pwd-warning-close" onClick={() => setPwdWarning(null)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        );
      })()}

      <div className="login-hero-section">

        <div className="login-bg-blob login-bg-blob-1" />
        <div className="login-bg-blob login-bg-blob-2" />
        <div className="login-bg-blob login-bg-blob-3" />

        <svg className="login-bg-svg" ref={svgRef} />
        <div className="login-bg-canvas" ref={canvasRef} />
        <LoginBackground canvasRef={canvasRef} svgRef={svgRef} />

        <div className="login-card-wrap">
          <div className="login-card">
            <div className="login-panel-left">
              <div className="login-left-content">
                <img src={logo} alt="VabGen Rx" className="login-logo" />
                <h1 className="login-brand">
                  VabGen <span className="rx-r">R</span><span className="rx-x">x</span>
                </h1>
                <p className="login-tagline">Medication Safety Platform</p>
              </div>
            </div>

            <div className="login-panel-right">
              <div className="login-form-wrap">
                <div className="login-form-header">
                  <h2 className="form-title">Welcome, Doctor!</h2>
                  <p className="form-subtitle">Sign in to your account to continue</p>
                </div>

                {msg && (
                  <div className={`alert alert-${msg.type}`}>
                    {msg.type === "danger"
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}
                    <span>{msg.text}</span>
                    {msg.expired && (
                      <button className="btn-change-password" onClick={() => { setLockedEmail(msg.email); setMsg(null); }}>
                        Change My Password
                      </button>
                    )}
                  </div>
                )}

                <form onSubmit={handleSubmit} noValidate>
                  <div className="form-group">
                    <label className="form-label" htmlFor="email">Email Address</label>
                    <div className="input-wrap">
                      <span className="input-icon"><MailIcon /></span>
                      <input
                        id="email" name="email" type="email"
                        className="form-control has-icon"
                        placeholder="you@hospital.com"
                        value={formData.email}
                        onChange={handleChange}
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="password">Password</label>
                    <div className="input-wrap">
                      <span className="input-icon"><LockIcon /></span>
                      <input
                        id="password" name="password"
                        type={showPwd ? "text" : "password"}
                        className="form-control has-icon"
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={handleChange}
                        autoComplete="current-password"
                      />
                      <button type="button" className="eye-btn" onClick={() => setShowPwd(p => !p)}>
                        {showPwd ? <EyeClosed /> : <EyeOpen />}
                      </button>
                    </div>
                  </div>

                  <div className="login-options">
                    <label className="remember-label">
                      <input type="checkbox" name="remember" checked={formData.remember} onChange={handleChange} />
                      <span>Remember me</span>
                    </label>
                  </div>

                  <button type="submit" className="btn-submit" disabled={loading}>
                    {loading ? <span className="btn-spinner" /> : (
                      <>
                        Sign In
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                        </svg>
                      </>
                    )}
                  </button>
                </form>

                <p className="login-footer-note">
                  © {new Date().getFullYear()} VabGen Rx · All rights reserved ·{" "}
                  <Link to="/privacy" className="login-privacy-link">Privacy Policy</Link>
                </p>
              </div>
            </div>
          </div>
        </div>

        <AboutSection />
      </div>

    </div>
  );
};

export default Login;