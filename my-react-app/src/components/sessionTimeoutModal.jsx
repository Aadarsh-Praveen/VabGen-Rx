import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useIdleTimeout } from "../hooks/useIdleTimeout";
import "../components/styles/sessionTimeoutModal.css";

const SessionTimeoutModal = ({ onLogout }) => {
  const navigate              = useNavigate();
  const [show, setShow]       = useState(false);
  const [countdown, setCount] = useState(60);

  const handleLogout = () => {
    localStorage.removeItem("token");
    setShow(false);
    onLogout();
    navigate("/login");
  };

  const handleStayLoggedIn = () => { setShow(false); setCount(60); };

  useEffect(() => {
    if (!show) return;
    if (countdown <= 0) { handleLogout(); return; }
    const t = setTimeout(() => setCount(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [show, countdown]);

  useIdleTimeout({
    onWarn:   () => { setShow(true); setCount(60); },
    onLogout: handleLogout,
  });

  if (!show) return null;

  return (
    <div className="stm-overlay">
      <div className="stm-modal">
        <div className="stm-icon-wrap">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
            stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8"  x2="12"    y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h2 className="stm-title">Session Expiring Soon</h2>
        <p className="stm-body">
          You've been inactive for 14 minutes. You will be automatically
          logged out in <strong className="stm-countdown">{countdown}s</strong>.
        </p>
        <div className="stm-bar-bg">
          <div className="stm-bar-fill" style={{ width: `${(countdown / 60) * 100}%` }} />
        </div>
        <div className="stm-btn-row">
          <button className="stm-btn-stay"   onClick={handleStayLoggedIn}>Stay Logged In</button>
          <button className="stm-btn-logout" onClick={handleLogout}>Logout Now</button>
        </div>
      </div>
    </div>
  );
};

export default SessionTimeoutModal;