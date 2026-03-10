import { useState } from "react";
import "../components/styles/accountLockedModal.css";

const STEPS = { LOCKED: "locked", OTP: "otp", RESET: "reset", SUCCESS: "success" };

const AccountLockedModal = ({ email, onClose, reason = "locked" }) => {
  const [step,       setStep]      = useState(STEPS.LOCKED);
  const [otp,        setOtp]       = useState(["", "", "", "", "", ""]);
  const [newPwd,     setNewPwd]    = useState("");
  const [confirmPwd, setConfirm]   = useState("");
  const [showPwd,    setShowPwd]   = useState(false);
  const [msg,        setMsg]       = useState(null);
  const [loading,    setLoading]   = useState(false);

  const handleOtpChange = (val, idx) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp];
    next[idx] = val.slice(-1);
    setOtp(next);
    if (val && idx < 5) document.getElementById(`otp-${idx + 1}`)?.focus();
  };

  const handleOtpKeyDown = (e, idx) => {
    if (e.key === "Backspace" && !otp[idx] && idx > 0)
      document.getElementById(`otp-${idx - 1}`)?.focus();
  };

  const handleSendOtp = async () => {
    setLoading(true); setMsg(null);
    try {
      const res  = await fetch("/api/send-unlock-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await res.json();
      if (res.ok) { setStep(STEPS.OTP); setMsg({ type: "success", text: `OTP sent to ${email}` }); }
      else setMsg({ type: "error", text: data.message });
    } catch { setMsg({ type: "error", text: "Network error. Try again." }); }
    finally { setLoading(false); }
  };

  const handleVerifyOtp = async () => {
    const code = otp.join("");
    if (code.length < 6) { setMsg({ type: "error", text: "Enter all 6 digits." }); return; }
    setLoading(true); setMsg(null);
    try {
      const res  = await fetch("/api/verify-unlock-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, otp: code }) });
      const data = await res.json();
      if (res.ok) { setStep(STEPS.RESET); setMsg(null); }
      else setMsg({ type: "error", text: data.message });
    } catch { setMsg({ type: "error", text: "Network error. Try again." }); }
    finally { setLoading(false); }
  };

  const handleResetPassword = async () => {
    if (newPwd.length < 8)    { setMsg({ type: "error", text: "Password must be at least 8 characters." }); return; }
    if (newPwd !== confirmPwd) { setMsg({ type: "error", text: "Passwords do not match." }); return; }
    setLoading(true); setMsg(null);
    try {
      const res  = await fetch("/api/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, newPassword: newPwd }) });
      const data = await res.json();
      if (res.ok) setStep(STEPS.SUCCESS);
      else setMsg({ type: "error", text: data.message });
    } catch { setMsg({ type: "error", text: "Network error. Try again." }); }
    finally { setLoading(false); }
  };

  const strengthLevel = newPwd.length < 6 ? 0 : newPwd.length < 9 ? 1 : newPwd.length < 12 ? 2 : 3;
  const strengthLabels = ["Weak", "Fair", "Good", "Strong"];
  const strengthColors = ["#ef4444", "#f59e0b", "#3b82f6", "#22c55e"];

  return (
    <div className="alm-overlay">
      <div className="alm-modal">

        {step === STEPS.LOCKED && (
          <>
            <div className="alm-icon-wrap">
              {reason === "expired" ? (
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              ) : (
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              )}
            </div>
            <h2 className="alm-title">{reason === "expired" ? "Password Expired" : "Account Locked"}</h2>
            <p className="alm-body">
              {reason === "expired"
                ? "Your password has expired after 90 days. To set a new password, we'll send a 6-digit verification code to:"
                : "Your account has been locked after 3 consecutive failed login attempts. To reactivate your account, we'll send a 6-digit verification code to:"}
            </p>
            <div className="alm-email-badge">{email}</div>
            {msg && <div className={msg.type === "error" ? "alm-err-box" : "alm-suc-box"}>{msg.text}</div>}
            <div className="alm-btn-row">
              <button className="alm-btn-primary" onClick={handleSendOtp} disabled={loading}>
                {loading ? <span className="alm-spinner" /> : "Send Verification Code"}
              </button>
              <button className="alm-btn-secondary" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}

        {step === STEPS.OTP && (
          <>
            <div className="alm-icon-wrap">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <h2 className="alm-title">Check Your Email</h2>
            <p className="alm-body">Enter the 6-digit code sent to <strong>{email}</strong></p>
            {msg && <div className={msg.type === "error" ? "alm-err-box" : "alm-suc-box"}>{msg.text}</div>}
            <div className="alm-otp-row">
              {otp.map((digit, i) => (
                <input
                  key={i} id={`otp-${i}`}
                  type="text" inputMode="numeric" maxLength={1} value={digit}
                  onChange={e => handleOtpChange(e.target.value, i)}
                  onKeyDown={e => handleOtpKeyDown(e, i)}
                  className="alm-otp-box"
                  style={{ borderColor: digit ? "#1a73e8" : "#e2e8f0" }}
                />
              ))}
            </div>
            <div className="alm-btn-row">
              <button className="alm-btn-primary" onClick={handleVerifyOtp} disabled={loading}>
                {loading ? <span className="alm-spinner" /> : "Verify Code"}
              </button>
            </div>
            <p className="alm-resend">
              Didn't receive it?{" "}
              <span className="alm-link" onClick={handleSendOtp}>Resend code</span>
            </p>
          </>
        )}

        {step === STEPS.RESET && (
          <>
            <div className="alm-icon-wrap">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                <line x1="12" y1="15" x2="12" y2="17"/>
              </svg>
            </div>
            <h2 className="alm-title">Set New Password</h2>
            <p className="alm-body">Choose a strong new password for your account.</p>
            {msg && <div className="alm-err-box">{msg.text}</div>}
            <div className="alm-field">
              <label className="alm-label">New Password</label>
              <div className="alm-input-wrap">
                <input type={showPwd ? "text" : "password"} placeholder="Min. 8 characters" value={newPwd} onChange={e => setNewPwd(e.target.value)} className="alm-input" />
                <button className="alm-eye-btn" type="button" onClick={() => setShowPwd(p => !p)}>
                  {showPwd
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                </button>
              </div>
            </div>
            <div className="alm-field">
              <label className="alm-label">Confirm New Password</label>
              <input type="password" placeholder="Re-enter password" value={confirmPwd} onChange={e => setConfirm(e.target.value)} className="alm-input" />
            </div>
            {newPwd && (
              <div className="alm-strength-wrap">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="alm-strength-bar" style={{ background: strengthLevel > i ? strengthColors[strengthLevel] : "#e2e8f0" }} />
                ))}
                <span className="alm-strength-label">{strengthLabels[strengthLevel]}</span>
              </div>
            )}
            <div className="alm-btn-row">
              <button className="alm-btn-primary" onClick={handleResetPassword} disabled={loading}>
                {loading ? <span className="alm-spinner" /> : "Reset Password"}
              </button>
            </div>
          </>
        )}

        {step === STEPS.SUCCESS && (
          <>
            <div className="alm-icon-wrap">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <h2 className="alm-title alm-title-success">Password Changed!</h2>
            <p className="alm-body">Your password has been reset successfully. A confirmation has been sent to <strong>{email}</strong>.</p>
            <div className="alm-success-box">
              Your account is now active. Please log in again with your new password.
            </div>
            <button className="alm-btn-primary" onClick={onClose}>Back to Login</button>
          </>
        )}

      </div>
    </div>
  );
};

export default AccountLockedModal;