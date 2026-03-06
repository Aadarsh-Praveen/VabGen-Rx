import { useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../../assets/vabgen_logo.png";
import "./login.css";

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

const Login = ({ onLogin }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: "", password: "", remember: false });
  const [showPwd, setShowPwd]   = useState(false);
  const [msg, setMsg]           = useState(null);
  const [loading, setLoading]   = useState(false);

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
      const res = await fetch("/api/signin", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: formData.email, password: formData.password }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.token) localStorage.setItem("token", data.token);
        setMsg({ type: "success", text: `Welcome back, ${data.user.name}!` });
        onLogin(data.user);
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
      <div className="login-card">

        {/* Left Panel */}
        <div className="login-panel-left">
          <div className="login-left-content">
            <img src={logo} alt="VabGen Rx" className="login-logo" />
            <h1 className="login-brand">
              VabGen <span className="rx-r">R</span><span className="rx-x">x</span>
            </h1>
            <p className="login-tagline">Medication Safety Platform</p>
            <div className="login-divider" />
            <ul className="login-features">
              <li>
                <span className="feature-dot" />
                AI-powered drug interaction analysis
              </li>
              <li>
                <span className="feature-dot" />
                Real-time dosing recommendations
              </li>
              <li>
                <span className="feature-dot" />
                Integrated patient counselling
              </li>
              <li>
                <span className="feature-dot" />
                JWT-secured, access control
              </li>
            </ul>
          </div>
        </div>

        {/* Right Panel */}
        <div className="login-panel-right">
          <div className="login-form-wrap">
            <div className="login-form-header">
              <h2 className="form-title">Welcome back</h2>
              <p className="form-subtitle">Sign in to your account to continue</p>
            </div>

            {msg && (
              <div className={`alert alert-${msg.type}`}>
                {msg.type === "danger" ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                )}
                {msg.text}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>

              {/* Email */}
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

              {/* Password */}
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
                  <button type="button" className="eye-btn" onClick={() => setShowPwd(!showPwd)}>
                    {showPwd ? <EyeClosed /> : <EyeOpen />}
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <div className="login-options">
                <label className="remember-label">
                  <input type="checkbox" name="remember" checked={formData.remember} onChange={handleChange} />
                  <span>Remember me</span>
                </label>
              </div>

              <button type="submit" className="btn-submit" disabled={loading}>
                {loading ? (
                  <span className="btn-spinner" />
                ) : (
                  <>
                    Sign In
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12"/>
                      <polyline points="12 5 19 12 12 19"/>
                    </svg>
                  </>
                )}
              </button>
            </form>

            <p className="login-footer-note">
              © {new Date().getFullYear()} VabGen Rx · All rights reserved
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Login;