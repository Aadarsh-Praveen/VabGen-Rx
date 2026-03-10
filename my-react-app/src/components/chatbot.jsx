import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import chatbotImg from "../assets/chatbot.png";
import "./styles/chatbot.css";

const BOT_NAME      = "VabGen Rx Bot";
const CONTACT_EMAIL = "vabgenrx@outlook.com";

const isLoggedIn = () => {
  try {
    const token = localStorage.getItem("token");
    const user  = localStorage.getItem("user");
    if (!token || !user) return false;
    const payload = JSON.parse(atob(token.split(".")[1]));
    const valid = payload.exp * 1000 > Date.now();
    if (!valid) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    }
    return valid;
  } catch {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    return false;
  }
};

const REPLIES = [
  {
    match: ["patient list", "my patients", "patients page", "view patients", "patient"],
    reply: "Here's a quick link to your Patient List:",
    path:  "/patients",
    label: "Go to Patient List",
    protected: true,
  },
  {
    match: ["dashboard", "home", "overview"],
    reply: "Here's a quick link to your Dashboard:",
    path:  "/dashboard",
    label: "Go to Dashboard",
    protected: true,
  },
  {
    match: ["settings", "profile", "password", "appearance", "change password"],
    reply: "Here's a quick link to Settings where you can update your profile and password:",
    path:  "/settings",
    label: "Go to Settings",
    protected: true,
  },
  {
    match: ["lab", "lab result", "lab results"],
    reply: "Lab results are available inside a patient's profile under the Lab Results tab. Open a patient to view them:",
    path:  "/patients",
    label: "Go to Patient List",
    protected: true,
  },
  {
    match: ["referral", "refer"],
    reply: "Referrals can be sent from the Referral tab inside a patient's profile. Open a patient from your list:",
    path:  "/patients",
    label: "Go to Patient List",
    protected: true,
  },
  {
    match: ["diagnosis", "prescription", "prescribe"],
    reply: "Diagnosis & prescriptions are available inside a patient's profile. Open a patient from your list:",
    path:  "/patients",
    label: "Go to Patient List",
    protected: true,
  },
  {
    match: ["drug", "interaction", "medication"],
    reply: "Drug interaction analysis runs automatically when you add medications inside a patient's profile:",
    path:  "/patients",
    label: "Go to Patient List",
    protected: true,
  },
  {
    match: ["hello", "hi", "hey", "good morning", "good afternoon", "good evening"],
    reply: "Hello, Doctor! Welcome to VabGen Rx Bot. I can help you navigate the platform. Try asking about patients, lab results, referrals, diagnosis, or settings.",
    path:  null,
    label: null,
    protected: false,
  },
  {
    match: ["help", "what can you do", "features", "assist"],
    reply: "I can help you quickly navigate VabGen Rx. Try asking: Show me patients, Go to dashboard, Lab results, Referrals, Settings, or Contact support.",
    path:  null,
    label: null,
    protected: false,
  },
  {
    match: ["support", "contact", "email", "team"],
    reply: `For technical or clinical support, email our team at ${CONTACT_EMAIL}. We respond within 24 hours on business days.`,
    path:  null,
    label: null,
    protected: false,
  },
  {
    match: ["bug", "error", "issue", "problem", "not working", "broken"],
    reply: `Sorry to hear that! Please describe the issue and email us at ${CONTACT_EMAIL} so our team can investigate.`,
    path:  null,
    label: null,
    protected: false,
  },
  {
    match: ["thank", "thanks", "great", "awesome"],
    reply: "You're welcome, Doctor! Is there anything else I can help you with?",
    path:  null,
    label: null,
    protected: false,
  },
  {
    match: ["bye", "goodbye", "see you"],
    reply: "Goodbye, Doctor! Take care and feel free to reach out anytime.",
    path:  null,
    label: null,
    protected: false,
  },
];

const FALLBACK = `I'm not sure about that. You can ask me things like show patients, go to dashboard, lab results, or contact support. For technical issues, email ${CONTACT_EMAIL}.`;

const LOGIN_BLOCKED = {
  text:  "🔒 Please login to access all the information.",
  path:  "/login",
  label: "Go to Login",
};

const getReply = (text) => {
  const lower = text.toLowerCase();
  for (const r of REPLIES) {
    if (r.match.some(k => lower.includes(k))) {
      if (r.protected && !isLoggedIn()) return LOGIN_BLOCKED;
      return { text: r.reply, path: r.path, label: r.label };
    }
  }
  return { text: FALLBACK, path: null, label: null };
};

const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);
const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const DragIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9"  cy="5"  r="1"/><circle cx="15" cy="5"  r="1"/>
    <circle cx="9"  cy="12" r="1"/><circle cx="15" cy="12" r="1"/>
    <circle cx="9"  cy="19" r="1"/><circle cx="15" cy="19" r="1"/>
  </svg>
);
const ArrowIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
);

const Chatbot = () => {
  const navigate = useNavigate();
  const [open,     setOpen]     = useState(false);
  const [input,    setInput]    = useState("");
  const [typing,   setTyping]   = useState(false);
  const [messages, setMessages] = useState([]);
  const [pos,        setPos]        = useState({ x: window.innerWidth - 90, y: window.innerHeight - 90 });
  const [dragging,   setDragging]   = useState(false);
  const [dragStart,  setDragStart]  = useState({ mx: 0, my: 0, px: 0, py: 0 });
  const [hasDragged, setHasDragged] = useState(false);

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  const WINDOW_W = 360;
  const WINDOW_H = 520;
  const FAB_SIZE = 54;

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, typing]);
  useEffect(() => {
    if (open) {
      const loggedIn = isLoggedIn();
      setMessages([{
        from:  "bot",
        text:  loggedIn
          ? "Hi Doctor! I'm VabGen Rx Bot. I can help you navigate the platform. Try asking about patients, lab results, referrals, or settings."
          : "🔒 Please login to access all the information.",
        path:  loggedIn ? null : "/login",
        label: loggedIn ? null : "Go to Login",
        time:  new Date(),
      }]);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const clampPos = useCallback((x, y) => ({
    x: Math.max(8, Math.min(x, window.innerWidth  - FAB_SIZE - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - FAB_SIZE - 8)),
  }), []);

  const onMouseDown = (e) => {
    e.preventDefault();
    setDragging(true); setHasDragged(false);
    setDragStart({ mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y });
  };
  const onTouchStart = (e) => {
    const t = e.touches[0];
    setDragging(true); setHasDragged(false);
    setDragStart({ mx: t.clientX, my: t.clientY, px: pos.x, py: pos.y });
  };

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - dragStart.mx;
      const dy = e.clientY - dragStart.my;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) setHasDragged(true);
      setPos(clampPos(dragStart.px + dx, dragStart.py + dy));
    };
    const onTouchMove = (e) => {
      if (!dragging) return;
      const t = e.touches[0];
      const dx = t.clientX - dragStart.mx;
      const dy = t.clientY - dragStart.my;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) setHasDragged(true);
      setPos(clampPos(dragStart.px + dx, dragStart.py + dy));
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup",   onUp);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend",  onUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup",   onUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend",  onUp);
    };
  }, [dragging, dragStart, clampPos]);

  const handleFabClick = () => { if (!hasDragged) setOpen(v => !v); };

  const getWindowPos = () => {
    const spaceBelow = window.innerHeight - pos.y - FAB_SIZE;
    const spaceAbove = pos.y;
    const spaceRight = window.innerWidth  - pos.x;

    const top  = spaceBelow >= WINDOW_H + 12 ? pos.y + FAB_SIZE + 10
               : spaceAbove >= WINDOW_H + 12 ? pos.y - WINDOW_H - 10
               : Math.max(8, Math.min(pos.y, window.innerHeight - WINDOW_H - 8));

    const left = spaceRight >= WINDOW_W + 12 ? pos.x
               : pos.x + FAB_SIZE >= WINDOW_W + 12 ? pos.x + FAB_SIZE - WINDOW_W
               : Math.max(8, window.innerWidth - WINDOW_W - 8);

    return { top, left };
  };

  const sendMessage = () => {
    const text = input.trim();
    if (!text) return;
    setMessages(prev => [...prev, { from: "user", text, path: null, label: null, time: new Date() }]);
    setInput("");

    setTyping(true);
    setTimeout(() => {
      const { text: replyText, path, label } = getReply(text);
      setTyping(false);
      setMessages(prev => [...prev, { from: "bot", text: replyText, path, label, time: new Date() }]);
    }, 800 + Math.random() * 500);
  };

  const handleKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  const fmt = (d) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const winPos = open ? getWindowPos() : {};

  return (
    <>
      <button
        className={`cb-fab${open ? " open" : ""}${dragging ? " dragging" : ""}`}
        style={{ left: pos.x, top: pos.y }}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onClick={handleFabClick}
        title="VabGen Rx Bot"
      >
        {open
          ? <CloseIcon />
          : <img src={chatbotImg} alt="Support" className="cb-fab-img" />
        }
        {!open && <span className="cb-fab-dot" />}
        <span className="cb-drag-hint"><DragIcon /></span>
      </button>

      {open && (
        <div className="cb-window" style={{ top: winPos.top, left: winPos.left }}>
          <div className="cb-header">
            <div className="cb-header-avatar">
              <img src={chatbotImg} alt="VabGen Rx Bot" className="cb-header-avatar-img" />
            </div>
            <div className="cb-header-info">
              <p className="cb-header-name">{BOT_NAME}</p>
              <p className="cb-header-status"><span className="cb-online-dot" /> Online</p>
            </div>
            <button className="cb-close-btn" onClick={() => setOpen(false)}><CloseIcon /></button>
          </div>

          <div className="cb-body">
            {messages.map((m, i) => (
              <div key={i} className={`cb-msg-row ${m.from}`}>
                {m.from === "bot" && (
                  <div className="cb-bot-avatar">
                    <img src={chatbotImg} alt="bot" className="cb-bot-avatar-img" />
                  </div>
                )}
                <div className="cb-bubble-wrap">
                  <div className={`cb-bubble ${m.from}`}>
                    {m.text}
                    {m.path && (
                      <button
                        className="cb-nav-btn"
                        onClick={() => { navigate(m.path); setOpen(false); }}
                      >
                        {m.label} <ArrowIcon />
                      </button>
                    )}
                  </div>
                  <span className="cb-time">{fmt(m.time)}</span>
                </div>
              </div>
            ))}
            {typing && (
              <div className="cb-msg-row bot">
                <div className="cb-bot-avatar">
                  <img src={chatbotImg} alt="bot" className="cb-bot-avatar-img" />
                </div>
                <div className="cb-bubble bot cb-typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="cb-footer">
            <div className="cb-support-bar">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6.06 6.06l.97-.88a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              <a href={`mailto:${CONTACT_EMAIL}`} className="cb-support-link">Contact Support Team</a>
            </div>
            <div className="cb-input-row">
              <input
                ref={inputRef}
                className="cb-input"
                placeholder="Type your message..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
              />
              <button className="cb-send-btn" onClick={sendMessage} disabled={!input.trim()}>
                <SendIcon />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Chatbot;