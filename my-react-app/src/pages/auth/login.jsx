import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import logo from "../../assets/vabgen_logo.png";
import "./login.css";
import AccountLockedModal from "../../components/accountLockedModal"; // ← ADD

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
  const [formData, setFormData]     = useState({ email: "", password: "", remember: false });
  const [showPwd, setShowPwd]       = useState(false);
  const [msg, setMsg]               = useState(null);
  const [loading, setLoading]       = useState(false);
  const [lockedEmail, setLockedEmail]     = useState(null);
  const [pwdWarning,  setPwdWarning]      = useState(null); // { daysLeft, urgent }

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
      const res  = await fetch("/api/signin", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: formData.email, password: formData.password }),
      });
      const data = await res.json();

      if (res.status === 423 || data.locked) {
        setLockedEmail(data.email || formData.email);
        return;
      }

      if (res.status === 403 && data.passwordExpired) {
        setMsg({
          type: 'danger',
          text: '🔒 Your password has expired after 90 days.',
          expired: true,
          email: data.email || formData.email,
        });
        return;
      }

      if (res.ok) {
        if (data.token) localStorage.setItem('token', data.token);
        onLogin(data.user);
        // Always show password days remaining banner
        if (data.passwordWarning) setPwdWarning(data.passwordWarning);
        setMsg({ type: 'success', text: `Welcome back, ${data.user.name}!` });
        navigate('/dashboard');
      } else {
        setMsg({ type: 'danger', text: data.message || 'Invalid email or password.' });
      }
    } catch {
      setMsg({ type: "danger", text: "Cannot connect to server. Make sure backend is running." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">

      {/* ── Account Locked Modal ── */}
      {lockedEmail && (
        <AccountLockedModal
          email={lockedEmail}
          reason={msg?.expired ? 'expired' : 'locked'}
          onClose={() => {
            setLockedEmail(null);
            setFormData(prev => ({ ...prev, password: '' }));
            setMsg(null);
          }}
        />
      )}

      {/* ── Password Days Remaining Banner — always visible after login ── */}
      {pwdWarning && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9998,
          background: pwdWarning.daysLeft <= 5  ? '#fef2f2'
                    : pwdWarning.daysLeft <= 15 ? '#fffbeb'
                    : '#f0fdf4',
          borderBottom: `2px solid ${
            pwdWarning.daysLeft <= 5  ? '#ef4444'
          : pwdWarning.daysLeft <= 15 ? '#f59e0b'
          : '#22c55e'}`,
          padding: '10px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '12px',
        }}>
          <span style={{
            color: pwdWarning.daysLeft <= 5  ? '#dc2626'
                 : pwdWarning.daysLeft <= 15 ? '#92400e'
                 : '#166534',
            fontWeight: 600, fontSize: '13px',
          }}>
            {pwdWarning.daysLeft <= 5  ? '🚨' :
             pwdWarning.daysLeft <= 15 ? '⚠️' : '🔑'}
            {' '}Password Security:{' '}
            <strong>{pwdWarning.daysLeft} day{pwdWarning.daysLeft !== 1 ? 's' : ''}</strong> remaining
            until your 90-day password change is required.
            {pwdWarning.daysLeft <= 15 && ' Please update it in Settings → Change Password.'}
          </span>
          <button
            onClick={() => setPwdWarning(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#64748b', flexShrink: 0 }}
          >✕</button>
        </div>
      )}

      <div className="login-card">

        {/* Left Panel */}
        <div className="login-panel-left">
          <div className="login-left-content">
            <img src={logo} alt="VabGen Rx" className="login-logo" />
            <h1 className="login-brand">
              VabGen <span className="rx-r">R</span><span className="rx-x">x</span>
            </h1>
            <p className="login-tagline">Medication Safety Platform</p>
           
           
          </div>
        </div>

        {/* Right Panel */}
        <div className="login-panel-right">
          <div className="login-form-wrap">
            <div className="login-form-header">
              <h2 className="form-title">Welcome, Doctor!</h2>
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
                <span>{msg.text}</span>
                {/* Show change password button if expired */}
                {msg.expired && (
                  <button
                    onClick={() => {
                      setLockedEmail(msg.email);
                      setMsg(null);
                    }}
                    style={{
                      display: 'block', marginTop: '10px', width: '100%',
                      padding: '9px', borderRadius: '8px', border: 'none',
                      background: '#ef4444', color: '#fff',
                      fontWeight: 600, fontSize: '13px', cursor: 'pointer',
                    }}
                  >
                    🔑 Change My Password
                  </button>
                )}
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

            {/* Footer */}
            <p className="login-footer-note">
              © {new Date().getFullYear()} VabGen Rx · All rights reserved ·{" "}
              <Link to="/privacy" style={{ color: "#1a73e8", textDecoration: "none", fontWeight: 500 }}>
                Privacy Policy
              </Link>
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Login;