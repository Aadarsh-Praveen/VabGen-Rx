import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./registration.css";  

const getPasswordStrength = (pwd) => {
  if (!pwd) return { width: "0%", color: "#e4e7ec", label: "" };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const levels = [
    { width: "25%", color: "#f04438", label: "Weak" },
    { width: "50%", color: "#f79009", label: "Fair" },
    { width: "75%", color: "#12b76a", label: "Good" },
    { width: "100%", color: "#027a48", label: "Strong" },
  ];
  return levels[Math.max(score - 1, 0)];
};

const Register = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
    agree: false,
  });
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [msg, setMsg] = useState(null);

  const strength = getPasswordStrength(formData.password);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const { firstName, lastName, email, password, confirm, agree } = formData;

    if (!firstName || !lastName || !email || !password) {
      setMsg({ type: "danger", text: "Please fill in all required fields." });
      return;
    }
    if (password !== confirm) {
      setMsg({ type: "danger", text: "Passwords do not match." });
      return;
    }
    if (!agree) {
      setMsg({ type: "danger", text: "You must agree to the Terms & Conditions." });
      return;
    }

    // TODO: Connect to your registration API here
    setMsg({ type: "success", text: "Account created successfully! Redirecting to login..." });
    setTimeout(() => navigate("/login"), 2000);
  };

  return (
    <div className="register-container">
      <div className="register-card">

        {/* Brand Header */}
        <div className="register-header">
          <h1 className="brand-name">VabGen Rx</h1>
          <p className="brand-tagline">Medication Safety Platform</p> 
        </div>

        {/* Form Body */}
        <div className="register-body">
          <h2 className="form-title">Create Account</h2>
          <p className="form-subtitle">Join VabGen Rx to get started</p>

          {msg && (
            <div className={`alert alert-${msg.type}`}>{msg.text}</div>
          )}

          <form onSubmit={handleSubmit} noValidate>

            {/* Name Row */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="firstName">First Name <span className="required">*</span></label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  className="form-control"
                  placeholder="John"
                  value={formData.firstName}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="lastName">Last Name <span className="required">*</span></label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  className="form-control"
                  placeholder="Doe"
                  value={formData.lastName}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* Email */}
            <div className="form-group">
              <label className="form-label" htmlFor="email">Email Address <span className="required">*</span></label>
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

            {/* Phone */}
            <div className="form-group">
              <label className="form-label" htmlFor="phone">Phone Number</label>
              <input
                id="phone"
                name="phone"
                type="tel"
                className="form-control"
                placeholder="+1 (555) 000-0000"
                value={formData.phone}
                onChange={handleChange}
              />
            </div>

            {/* Password */}
            <div className="form-group">
              <label className="form-label" htmlFor="password">Password <span className="required">*</span></label>
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
              {formData.password && (
                <div className="strength-wrapper">
                  <div className="strength-bar">
                    <div className="strength-fill" style={{ width: strength.width, background: strength.color }} />
                  </div>
                  <span className="strength-text">Strength: <strong>{strength.label}</strong></span>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="form-group">
              <label className="form-label" htmlFor="confirm">Confirm Password <span className="required">*</span></label>
              <div className="input-wrap">
                <input
                  id="confirm"
                  name="confirm"
                  type={showConfirm ? "text" : "password"}
                  className="form-control"
                  placeholder="••••••••"
                  value={formData.confirm}
                  onChange={handleChange}
                />
                <span className="eye-icon" onClick={() => setShowConfirm(!showConfirm)}>
                  {showConfirm ? "🙈" : "👁️"}
                </span>
              </div>
            </div>

            {/* Terms */}
            <div className="form-check">
              <input
                type="checkbox"
                id="agree"
                name="agree"
                checked={formData.agree}
                onChange={handleChange}
              />
              <label htmlFor="agree">
                I agree to the <a href="/terms" className="terms-link">Terms &amp; Conditions</a>
              </label>
            </div>

            <button type="submit" className="btn-submit">Create Account →</button>
          </form>

          <p className="switch-text">
            Already have an account?{" "}
            <span className="switch-link" onClick={() => navigate("/login")}>
              Sign in
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;