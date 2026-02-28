import { useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../../assets/vabgen_logo.png";
import "./login.css";

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
        // ── Save JWT token to localStorage ──
        if (data.token) {
          localStorage.setItem("token", data.token);
        }

        setMsg({ type: "success", text: `Welcome back to VabGen Rx, ${data.user.name}!` });
        onLogin(data.user);
        navigate("/dashboard");
      } else {
        setMsg({ type: "danger", text: data.message || "Invalid email or password." });
      }
    } catch (err) {
      setMsg({ type: "danger", text: "Cannot connect to server. Make sure backend is running." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">

        {/* Brand Header */}
        <div className="login-header">
          <img
            src={logo}
            alt="VabGen Rx Logo"
            style={{ width: 120, height: 120, objectFit: "contain", marginBottom: 10 }}
          />
          <h1 className="brand-name">
            VabGen <span style={{ color: "#ef4444" }}>R</span><span style={{ color: "#1a73e8" }}>x</span>
          </h1>
          <p className="brand-tagline">Medication Safety Platform</p>
        </div>

        {/* Form Body */}
        <div className="login-body">
          <h2 className="form-title">Welcome Back!</h2>
          <p className="form-subtitle">Sign in to your account to continue</p>

          {msg && (
            <div className={`alert alert-${msg.type}`}>{msg.text}</div>
          )}

          <form onSubmit={handleSubmit} noValidate>

            {/* Email */}
            <div className="form-group">
              <label className="form-label" htmlFor="email">Email Address</label>
              <input
                id="email"
                name="email"
                type="email"
                className="form-control"
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
              />
            </div>

            {/* Password */}
            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <div className="input-wrap">
                <input
                  id="password"
                  name="password"
                  type={showPwd ? "text" : "password"}
                  className="form-control"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                />
                <span className="eye-icon" onClick={() => setShowPwd(!showPwd)}>
                  {showPwd ? "🙈" : "👁️"}
                </span>
              </div>
            </div>

            {/* Remember me */}
            <div className="login-options">
              <label className="remember-label">
                <input
                  type="checkbox"
                  name="remember"
                  checked={formData.remember}
                  onChange={handleChange}
                />
                Remember me
              </label>
            </div>

            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign In →"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;