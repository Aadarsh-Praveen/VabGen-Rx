// src/components/accountLockedModal.jsx
import { useState } from 'react';

const STEPS = { LOCKED: 'locked', OTP: 'otp', RESET: 'reset', SUCCESS: 'success' };

const AccountLockedModal = ({ email, onClose, reason = 'locked' }) => {
  const [step, setStep]         = useState(STEPS.LOCKED);
  const [otp, setOtp]           = useState(['', '', '', '', '', '']);
  const [newPwd, setNewPwd]     = useState('');
  const [confirmPwd, setConfirm]= useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [msg, setMsg]           = useState(null);
  const [loading, setLoading]   = useState(false);

  // ── OTP box input handling ──────────────────────────────────
  const handleOtpChange = (val, idx) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp];
    next[idx] = val.slice(-1);
    setOtp(next);
    if (val && idx < 5) document.getElementById(`otp-${idx + 1}`)?.focus();
  };

  const handleOtpKeyDown = (e, idx) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0)
      document.getElementById(`otp-${idx - 1}`)?.focus();
  };

  // ── Step 1: Send OTP ────────────────────────────────────────
  const handleSendOtp = async () => {
    setLoading(true); setMsg(null);
    try {
      const res  = await fetch('/api/send-unlock-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) { setStep(STEPS.OTP); setMsg({ type: 'success', text: `OTP sent to ${email}` }); }
      else setMsg({ type: 'error', text: data.message });
    } catch { setMsg({ type: 'error', text: 'Network error. Try again.' }); }
    finally { setLoading(false); }
  };

  // ── Step 2: Verify OTP ──────────────────────────────────────
  const handleVerifyOtp = async () => {
    const code = otp.join('');
    if (code.length < 6) { setMsg({ type: 'error', text: 'Enter all 6 digits.' }); return; }
    setLoading(true); setMsg(null);
    try {
      const res  = await fetch('/api/verify-unlock-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: code }),
      });
      const data = await res.json();
      if (res.ok) { setStep(STEPS.RESET); setMsg(null); }
      else setMsg({ type: 'error', text: data.message });
    } catch { setMsg({ type: 'error', text: 'Network error. Try again.' }); }
    finally { setLoading(false); }
  };

  // ── Step 3: Reset Password ──────────────────────────────────
  const handleResetPassword = async () => {
    if (newPwd.length < 8) { setMsg({ type: 'error', text: 'Password must be at least 8 characters.' }); return; }
    if (newPwd !== confirmPwd) { setMsg({ type: 'error', text: 'Passwords do not match.' }); return; }
    setLoading(true); setMsg(null);
    try {
      const res  = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, newPassword: newPwd }),
      });
      const data = await res.json();
      if (res.ok) setStep(STEPS.SUCCESS);
      else setMsg({ type: 'error', text: data.message });
    } catch { setMsg({ type: 'error', text: 'Network error. Try again.' }); }
    finally { setLoading(false); }
  };

  return (
    <div style={s.overlay}>
      <div style={s.modal}>

        {/* ── Step 1: Account Locked ── */}
        {step === STEPS.LOCKED && (
          <>
            <div style={s.iconWrap}>
              {reason === 'expired' ? (
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              ) : (
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              )}
            </div>
            <h2 style={s.title}>
              {reason === 'expired' ? 'Password Expired' : 'Account Locked'}
            </h2>
            <p style={s.body}>
              {reason === 'expired'
                ? 'Your password has expired after 90 days. To set a new password, we\'ll send a 6-digit verification code to:'
                : 'Your account has been locked after 3 consecutive failed login attempts. To reactivate your account, we\'ll send a 6-digit verification code to:'}
            </p>
            <div style={s.emailBadge}>{email}</div>
            {msg && <div style={msg.type === 'error' ? s.errBox : s.sucBox}>{msg.text}</div>}
            <div style={s.btnRow}>
              <button style={s.btnPrimary} onClick={handleSendOtp} disabled={loading}>
                {loading ? <span style={s.spinner} /> : 'Send Verification Code'}
              </button>
              <button style={s.btnSecondary} onClick={onClose}>Cancel</button>
            </div>
          </>
        )}

        {/* ── Step 2: Enter OTP ── */}
        {step === STEPS.OTP && (
          <>
            <div style={s.iconWrap}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <h2 style={s.title}>Check Your Email</h2>
            <p style={s.body}>Enter the 6-digit code sent to <strong>{email}</strong></p>

            {msg && <div style={msg.type === 'error' ? s.errBox : s.sucBox}>{msg.text}</div>}

            <div style={s.otpRow}>
              {otp.map((digit, i) => (
                <input
                  key={i} id={`otp-${i}`}
                  type="text" inputMode="numeric"
                  maxLength={1} value={digit}
                  onChange={e => handleOtpChange(e.target.value, i)}
                  onKeyDown={e => handleOtpKeyDown(e, i)}
                  style={{ ...s.otpBox, borderColor: digit ? '#1a73e8' : '#e2e8f0' }}
                />
              ))}
            </div>

            <div style={s.btnRow}>
              <button style={s.btnPrimary} onClick={handleVerifyOtp} disabled={loading}>
                {loading ? <span style={s.spinner} /> : 'Verify Code'}
              </button>
            </div>
            <p style={s.resend}>
              Didn't receive it?{' '}
              <span style={s.link} onClick={handleSendOtp}>Resend code</span>
            </p>
          </>
        )}

        {/* ── Step 3: Reset Password ── */}
        {step === STEPS.RESET && (
          <>
            <div style={s.iconWrap}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                <line x1="12" y1="15" x2="12" y2="17"/>
              </svg>
            </div>
            <h2 style={s.title}>Set New Password</h2>
            <p style={s.body}>Choose a strong new password for your account.</p>

            {msg && <div style={s.errBox}>{msg.text}</div>}

            <div style={s.field}>
              <label style={s.label}>New Password</label>
              <div style={s.inputWrap}>
                <input
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Min. 8 characters"
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  style={s.input}
                />
                <button style={s.eyeBtn} type="button" onClick={() => setShowPwd(p => !p)}>
                  {showPwd ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div style={s.field}>
              <label style={s.label}>Confirm New Password</label>
              <input
                type="password"
                placeholder="Re-enter password"
                value={confirmPwd}
                onChange={e => setConfirm(e.target.value)}
                style={s.input}
              />
            </div>

            {/* Password strength indicator */}
            {newPwd && (
              <div style={s.strengthWrap}>
                {['Weak', 'Fair', 'Good', 'Strong'].map((label, i) => (
                  <div key={i} style={{
                    ...s.strengthBar,
                    background: newPwd.length > i * 3 + 3
                      ? ['#ef4444','#f59e0b','#3b82f6','#22c55e'][i]
                      : '#e2e8f0'
                  }} />
                ))}
                <span style={s.strengthLabel}>
                  {newPwd.length < 6 ? 'Weak' : newPwd.length < 9 ? 'Fair' : newPwd.length < 12 ? 'Good' : 'Strong'}
                </span>
              </div>
            )}

            <div style={s.btnRow}>
              <button style={s.btnPrimary} onClick={handleResetPassword} disabled={loading}>
                {loading ? <span style={s.spinner} /> : 'Reset Password'}
              </button>
            </div>
          </>
        )}

        {/* ── Step 4: Success ── */}
        {step === STEPS.SUCCESS && (
          <>
            <div style={s.iconWrap}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <h2 style={{ ...s.title, color: '#16a34a' }}>Password Changed!</h2>
            <p style={s.body}>
              Your password has been reset successfully. A confirmation has been sent to <strong>{email}</strong>.
            </p>
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '14px', marginBottom: '20px' }}>
              <p style={{ color: '#166534', margin: 0, fontSize: '14px' }}>
                ✅ Please log in again with your new password.
              </p>
            </div>
            <button style={s.btnPrimary} onClick={onClose}>Back to Login</button>
          </>
        )}

      </div>
    </div>
  );
};

// ── Styles ──────────────────────────────────────────────────────
const s = {
  overlay:      { position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 },
  modal:        { background:'#fff', borderRadius:'16px', padding:'36px 32px', width:'100%', maxWidth:'440px', textAlign:'center', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' },
  iconWrap:     { marginBottom:'16px' },
  title:        { margin:'0 0 10px', fontSize:'22px', fontWeight:700, color:'#1e293b' },
  body:         { margin:'0 0 20px', fontSize:'14px', color:'#475569', lineHeight:1.7 },
  emailBadge:   { background:'#f1f5f9', borderRadius:'8px', padding:'10px 16px', fontSize:'14px', fontWeight:600, color:'#1e293b', marginBottom:'20px' },
  errBox:       { background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:'8px', padding:'10px 14px', color:'#dc2626', fontSize:'13px', marginBottom:'16px' },
  sucBox:       { background:'#f0fdf4', border:'1px solid #86efac', borderRadius:'8px', padding:'10px 14px', color:'#16a34a', fontSize:'13px', marginBottom:'16px' },
  btnRow:       { display:'flex', flexDirection:'column', gap:'10px', marginTop:'4px' },
  btnPrimary:   { padding:'12px', borderRadius:'8px', border:'none', background:'#1a73e8', color:'#fff', fontWeight:600, fontSize:'15px', cursor:'pointer' },
  btnSecondary: { padding:'12px', borderRadius:'8px', border:'1.5px solid #e2e8f0', background:'#fff', color:'#64748b', fontWeight:600, fontSize:'14px', cursor:'pointer' },
  otpRow:       { display:'flex', gap:'10px', justifyContent:'center', marginBottom:'24px' },
  otpBox:       { width:'46px', height:'54px', textAlign:'center', fontSize:'22px', fontWeight:700, border:'2px solid', borderRadius:'10px', outline:'none', color:'#1e293b' },
  resend:       { marginTop:'14px', fontSize:'13px', color:'#64748b' },
  link:         { color:'#1a73e8', cursor:'pointer', fontWeight:600 },
  field:        { textAlign:'left', marginBottom:'14px' },
  label:        { display:'block', fontSize:'13px', fontWeight:600, color:'#374151', marginBottom:'6px' },
  inputWrap:    { position:'relative' },
  input:        { width:'100%', padding:'10px 12px', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'14px', outline:'none', boxSizing:'border-box' },
  eyeBtn:       { position:'absolute', right:'10px', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:'16px' },
  strengthWrap: { display:'flex', gap:'6px', alignItems:'center', marginBottom:'16px' },
  strengthBar:  { height:'4px', flex:1, borderRadius:'9999px', transition:'background 0.3s' },
  strengthLabel:{ fontSize:'12px', color:'#64748b', minWidth:'40px' },
  spinner:      { display:'inline-block', width:'16px', height:'16px', border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.7s linear infinite' },
};

export default AccountLockedModal;