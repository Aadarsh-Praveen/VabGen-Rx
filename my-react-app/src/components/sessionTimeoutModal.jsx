// src/components/sessionTimeoutModal.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIdleTimeout } from '../hooks/useIdleTimeout';

const SessionTimeoutModal = ({ onLogout }) => {
  const navigate     = useNavigate();
  const [show, setShow]       = useState(false);
  const [countdown, setCount] = useState(60);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setShow(false);
    onLogout();
    navigate('/login');
  };

  const handleStayLoggedIn = () => {
    setShow(false);
    setCount(60);
  };

  // Countdown tick when modal is visible
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
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.iconWrap}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
            stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h2 style={styles.title}>Session Expiring Soon</h2>
        <p style={styles.body}>
          You've been inactive for 14 minutes. You will be automatically
          logged out in <strong style={{ color: '#ef4444' }}>{countdown}s</strong>.
        </p>

        {/* Progress bar */}
        <div style={styles.barBg}>
          <div style={{ ...styles.barFill, width: `${(countdown / 60) * 100}%` }} />
        </div>

        <div style={styles.btnRow}>
          <button style={styles.btnStay} onClick={handleStayLoggedIn}>
            Stay Logged In
          </button>
          <button style={styles.btnLogout} onClick={handleLogout}>
            Logout Now
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999,
  },
  modal: {
    background: '#fff', borderRadius: '16px',
    padding: '36px 32px', width: '100%', maxWidth: '420px',
    textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
  },
  iconWrap: { marginBottom: '16px' },
  title: { margin: '0 0 12px', fontSize: '20px', fontWeight: 700, color: '#1e293b' },
  body:  { margin: '0 0 20px', fontSize: '15px', color: '#475569', lineHeight: 1.6 },
  barBg: {
    height: '6px', background: '#e2e8f0', borderRadius: '9999px',
    marginBottom: '24px', overflow: 'hidden',
  },
  barFill: {
    height: '100%', background: '#f59e0b', borderRadius: '9999px',
    transition: 'width 1s linear',
  },
  btnRow: { display: 'flex', gap: '12px' },
  btnStay: {
    flex: 1, padding: '11px', borderRadius: '8px', border: 'none',
    background: '#1a73e8', color: '#fff', fontWeight: 600,
    fontSize: '14px', cursor: 'pointer',
  },
  btnLogout: {
    flex: 1, padding: '11px', borderRadius: '8px',
    border: '1.5px solid #e2e8f0', background: '#fff',
    color: '#64748b', fontWeight: 600, fontSize: '14px', cursor: 'pointer',
  },
};

export default SessionTimeoutModal;