import { useEffect, useRef, useState, useCallback } from "react";
import { apiFetch } from "../services/api";
import "./styles/voiceNotes.css";

/* ══════════════════════════════════════
   AUTH TOKEN HELPER
   Reads the JWT from wherever apiFetch stores it.
   Tries the most common localStorage key names.
   ══════════════════════════════════════ */
const getAuthToken = () => {
  const keys = ["token", "authToken", "jwt", "access_token", "userToken"];
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v) return v;
  }
  // fallback: parse any stored JSON user/auth object
  try {
    const raw = localStorage.getItem("user") || localStorage.getItem("auth");
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.token || parsed?.access_token || null;
    }
  } catch {}
  return null;
};

/* ── Upload FormData WITHOUT letting apiFetch touch Content-Type ── */
const uploadFormData = async (url, formData) => {
  const token = getAuthToken();
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(url, { method: "POST", headers, body: formData });
};

/* ══════════════════════════════════════
   ICONS
   ══════════════════════════════════════ */
const MicIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);
const StopIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="4" y="4" width="16" height="16" rx="2"/>
  </svg>
);
const PlayIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
);
const PauseIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
  </svg>
);
const TrashIcon = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);
const SaveIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
    <polyline points="17 21 17 13 7 13 7 21"/>
    <polyline points="7 3 7 8 15 8"/>
  </svg>
);
const DiscardIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const AlertIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

/* ══════════════════════════════════════
   WAVEFORM VISUALISER
   ══════════════════════════════════════ */
const LiveWaveform = ({ analyserRef, isRecording }) => {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);

  useEffect(() => {
    if (!isRecording || !analyserRef.current) return;
    const canvas   = canvasRef.current;
    const ctx      = canvas.getContext("2d");
    const analyser = analyserRef.current;
    const bufLen   = analyser.frequencyBinCount;
    const dataArr  = new Uint8Array(bufLen);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArr);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const bars   = 40;
      const barW   = canvas.width / bars - 2;
      const step   = Math.floor(bufLen / bars);
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      const col1   = isDark ? "#60a5fa" : "#3b82f6";
      const col2   = isDark ? "#818cf8" : "#6366f1";

      for (let i = 0; i < bars; i++) {
        const val  = dataArr[i * step] / 255;
        const barH = Math.max(3, val * canvas.height * 0.85);
        const x    = i * (barW + 2);
        const y    = (canvas.height - barH) / 2;
        const frac = i / bars;

        const lerp = (a, b, t) => Math.round(parseInt(a, 16) + (parseInt(b, 16) - parseInt(a, 16)) * t);
        const r = lerp(col1.slice(1, 3), col2.slice(1, 3), frac);
        const g = lerp(col1.slice(3, 5), col2.slice(3, 5), frac);
        const b = lerp(col1.slice(5, 7), col2.slice(5, 7), frac);

        const grad = ctx.createLinearGradient(x, y, x, y + barH);
        grad.addColorStop(0,   `rgba(${r},${g},${b},0.5)`);
        grad.addColorStop(0.5, `rgba(${r},${g},${b},1)`);
        grad.addColorStop(1,   `rgba(${r},${g},${b},0.5)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, barW / 2);
        ctx.fill();
      }
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [isRecording, analyserRef]);

  return <canvas ref={canvasRef} className="vn-waveform-canvas" width={320} height={60} />;
};

/* ══════════════════════════════════════
   AUDIO PLAYER
   FIX: accepts `knownDuration` (seconds) as fallback for when
        MediaRecorder blobs report Infinity or NaN for duration.
   ══════════════════════════════════════ */
const AudioPlayer = ({ url, knownDuration = null }) => {
  const audioRef  = useRef(null);
  const [playing,  setPlaying]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(knownDuration ?? 0);
  const [current,  setCurrent]  = useState(0);

  /* FIX: resolve Infinity / NaN from MediaRecorder blobs.
     We seek to a huge timestamp; the browser clamps it to the real end,
     which updates duration to the actual value. */
  const resolveDuration = (audio) => {
    if (!isFinite(audio.duration) || isNaN(audio.duration)) {
      // If we already know it from the recording timer, use that
      if (knownDuration && knownDuration > 0) {
        setDuration(knownDuration);
        return;
      }
      // Otherwise use the seek trick
      audio.currentTime = 1e101;
      const onUpdate = () => {
        audio.removeEventListener("timeupdate", onUpdate);
        if (isFinite(audio.duration)) setDuration(audio.duration);
        else if (knownDuration)        setDuration(knownDuration);
        audio.currentTime = 0;
      };
      audio.addEventListener("timeupdate", onUpdate);
    } else {
      setDuration(audio.duration);
    }
  };

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else         { a.play().then(() => setPlaying(true)).catch(() => {}); }
  };

  const seek = (e) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    a.currentTime = pct * duration;
  };

  const fmt = (s) => {
    if (!isFinite(s) || isNaN(s) || s < 0) return "00:00";
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  };

  return (
    <div className="vn-player">
      <audio
        ref={audioRef}
        src={url}
        onLoadedMetadata={() => resolveDuration(audioRef.current)}
        onTimeUpdate={() => {
          const a = audioRef.current;
          if (!a) return;
          const cur = a.currentTime;
          setCurrent(cur);
          if (duration > 0) setProgress((cur / duration) * 100);
        }}
        onEnded={() => { setPlaying(false); setProgress(0); setCurrent(0); if (audioRef.current) audioRef.current.currentTime = 0; }}
      />
      <button className="vn-player-btn" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div className="vn-player-track" onClick={seek} role="slider" aria-label="Seek">
        <div className="vn-player-fill"  style={{ width: `${progress}%` }} />
        <div className="vn-player-thumb" style={{ left:  `${progress}%` }} />
      </div>
      <span className="vn-player-time">{fmt(current)} / {fmt(duration)}</span>
    </div>
  );
};

/* ══════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════ */
const VoiceNotesSection = ({ patientNo, isOutpatient, user }) => {
  const [recordings,   setRecordings]   = useState([]);
  const [loadingList,  setLoadingList]  = useState(true);
  const [recState,     setRecState]     = useState("idle");  // idle | recording | preview
  const [audioBlob,    setAudioBlob]    = useState(null);
  const [previewUrl,   setPreviewUrl]   = useState(null);
  const [timer,        setTimer]        = useState(0);
  const [saving,       setSaving]       = useState(false);
  const [saveMsg,      setSaveMsg]      = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);    // { id, step: 1|2 }
  const [deletingId,   setDeletingId]   = useState(null);
  const [micError,     setMicError]     = useState(null);

  const mediaRecRef = useRef(null);
  const chunksRef   = useRef([]);
  const timerRef    = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);
  const streamRef   = useRef(null);
  // keep a ref to timer so onstop closure sees latest value
  const timerValRef = useRef(0);

  const patientType = isOutpatient ? "OP" : "IP";

  /* ── fetch saved recordings ── */
  const fetchRecordings = useCallback(async () => {
    setLoadingList(true);
    try {
      const res  = await apiFetch(`/api/voice-notes/${encodeURIComponent(patientNo)}?type=${patientType}`);
      const data = await res.json();
      if (res.ok) setRecordings(data.notes || []);
    } catch {}
    finally { setLoadingList(false); }
  }, [patientNo, patientType]);

  useEffect(() => { fetchRecordings(); }, [fetchRecordings]);

  /* ── cleanup on unmount ── */
  useEffect(() => () => {
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (audioCtxRef.current?.state !== "closed") audioCtxRef.current?.close();
  }, []);

  /* ── start recording ── */
  const startRecording = async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      audioCtxRef.current = new AudioContext();
      const source   = audioCtxRef.current.createMediaStreamSource(stream);
      const analyser = audioCtxRef.current.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        setAudioBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        // preserve timer value in state for AudioPlayer knownDuration
        setTimer(timerValRef.current);
        setRecState("preview");
        clearInterval(timerRef.current);
        stream.getTracks().forEach(t => t.stop());
        if (audioCtxRef.current?.state !== "closed") audioCtxRef.current.close();
      };

      timerValRef.current = 0;
      setTimer(0);
      mr.start(100);
      mediaRecRef.current = mr;
      setRecState("recording");
      timerRef.current = setInterval(() => {
        timerValRef.current += 1;
        setTimer(timerValRef.current);
      }, 1000);
    } catch {
      setMicError("Microphone access denied. Please allow mic access in your browser and try again.");
    }
  };

  /* ── stop recording ── */
  const stopRecording = () => {
    mediaRecRef.current?.stop();
    clearInterval(timerRef.current);
  };

  /* ── discard preview ── */
  const discardRecording = () => {
    URL.revokeObjectURL(previewUrl);
    setAudioBlob(null);
    setPreviewUrl(null);
    setTimer(0);
    timerValRef.current = 0;
    setRecState("idle");
  };

  /* ── save recording ──────────────────────────────────────────────────────
     FIX: Use raw fetch (not apiFetch) so the browser sets its own
     multipart/form-data Content-Type + boundary automatically.
     apiFetch adds "Content-Type: application/json" which corrupts
     the multipart payload and causes the 500 / parse error.
  ── */
  const saveRecording = async () => {
    if (!audioBlob) return;
    setSaving(true); setSaveMsg(null);
    try {
      const ext  = audioBlob.type.includes("ogg") ? "ogg" : "webm";
      const form = new FormData();
      form.append("audio",       audioBlob, `voice-note-${Date.now()}.${ext}`);
      form.append("patientNo",   patientNo);
      form.append("patientType", patientType);
      form.append("duration",    String(timerValRef.current));
      form.append("recordedBy",  user?.name || "");

      // ✅ uploadFormData uses raw fetch — NO Content-Type header set manually
      const res  = await uploadFormData("/api/voice-notes", form);
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setSaveMsg("success");
        URL.revokeObjectURL(previewUrl);
        setAudioBlob(null);
        setPreviewUrl(null);
        setTimer(0);
        timerValRef.current = 0;
        setRecState("idle");
        await fetchRecordings();
      } else {
        console.error("Voice note save failed:", data.message || res.status);
        setSaveMsg("error");
      }
    } catch (err) {
      console.error("Voice note save exception:", err);
      setSaveMsg("error");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 4000);
    }
  };

  /* ── delete with double confirm ── */
  const handleDeleteClick = (id) => {
    if (deleteTarget?.id === id && deleteTarget.step === 1) {
      setDeleteTarget({ id, step: 2 });
      executeDelete(id);
    } else {
      setDeleteTarget({ id, step: 1 });
      setTimeout(() => setDeleteTarget(dt => dt?.id === id ? null : dt), 4000);
    }
  };

  const cancelDelete = () => setDeleteTarget(null);

  const executeDelete = async (id) => {
    setDeletingId(id);
    try {
      const res = await apiFetch(`/api/voice-notes/${id}`, { method: "DELETE" });
      if (res.ok) setRecordings(prev => prev.filter(r => r.ID !== id));
    } catch (err) { console.error(err); }
    finally { setDeletingId(null); setDeleteTarget(null); }
  };

  /* ── formatters ── */
  const fmtTimer = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString("en-US", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }) : "—";

  const fmtDuration = (s) => {
    if (s == null || isNaN(s) || s < 0) return "—";
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return m > 0 ? `${m}m ${r}s` : `${r}s`;
  };

  /* ── render ── */
  return (
    <div className="vn-section">
      {/* header */}
      <div className="vn-header">
        <div className="vn-header-left">
          <span className="vn-header-icon"><MicIcon size={15} /></span>
          <h4 className="vn-title">Clinical Voice Notes</h4>
        </div>
        <span className="vn-count">{recordings.length} note{recordings.length !== 1 ? "s" : ""}</span>
      </div>

      {/* recorder */}
      <div className="vn-recorder">
        {recState === "idle" && (
          <div className="vn-idle">
            {micError && <p className="vn-mic-error"><AlertIcon /> {micError}</p>}
            <button className="vn-record-btn" onClick={startRecording}>
              <span className="vn-record-dot" />
              <MicIcon size={16} />
              Start Recording
            </button>
            <p className="vn-hint">Record a voice note for this patient visit</p>
          </div>
        )}

        {recState === "recording" && (
          <div className="vn-recording">
            <div className="vn-rec-indicator">
              <span className="vn-rec-dot pulsing" />
              <span className="vn-rec-label">Recording</span>
              <span className="vn-rec-timer">{fmtTimer(timer)}</span>
            </div>
            <LiveWaveform analyserRef={analyserRef} isRecording={true} />
            <button className="vn-stop-btn" onClick={stopRecording}>
              <StopIcon size={14} /> Stop Recording
            </button>
          </div>
        )}

        {recState === "preview" && (
          <div className="vn-preview">
            <div className="vn-preview-header">
              <span className="vn-preview-label">Preview recording</span>
              <span className="vn-preview-duration">{fmtTimer(timer)}</span>
            </div>

            {/* FIX: pass timer as knownDuration so player shows real time, not Infinity */}
            <AudioPlayer url={previewUrl} knownDuration={timer} />

            <div className="vn-preview-actions">
              <button className="vn-discard-btn" onClick={discardRecording} disabled={saving}>
                <DiscardIcon size={13} /> Discard
              </button>
              <button className="vn-save-btn" onClick={saveRecording} disabled={saving}>
                <SaveIcon size={13} />
                {saving ? "Saving…" : "Save Note"}
              </button>
            </div>
            {saveMsg === "error" && (
              <p className="vn-save-msg vn-save-err">
                <AlertIcon /> Failed to save. Check console for details and try again.
              </p>
            )}
          </div>
        )}
      </div>

      {/* success toast */}
      {saveMsg === "success" && (
        <div className="vn-toast">✓ Voice note saved successfully</div>
      )}

      {/* saved recordings list */}
      <div className="vn-list">
        {loadingList ? (
          <div className="vn-state">
            <div className="vn-spinner" />
            <span>Loading voice notes…</span>
          </div>
        ) : recordings.length === 0 ? (
          <div className="vn-empty">
            <MicIcon size={22} />
            <p>No voice notes recorded yet for this patient.</p>
          </div>
        ) : (
          recordings.map((note) => {
            const isPending  = deleteTarget?.id === note.ID && deleteTarget.step === 1;
            const isDeleting = deletingId === note.ID;
            return (
              <div key={note.ID} className={`vn-card ${isDeleting ? "vn-card--deleting" : ""}`}>
                <div className="vn-card-top">
                  <div className="vn-card-meta">
                    <span className="vn-card-date">{fmtDate(note.Created_At)}</span>
                    {note.Recorded_By && (
                      <span className="vn-card-by">by {note.Recorded_By}</span>
                    )}
                    {note.Duration_Seconds != null && (
                      <span className="vn-card-dur">{fmtDuration(note.Duration_Seconds)}</span>
                    )}
                  </div>
                  <div className="vn-card-actions">
                    {isPending ? (
                      <div className="vn-confirm-row">
                        <span className="vn-confirm-label"><AlertIcon /> Confirm delete?</span>
                        <button className="vn-confirm-yes" onClick={() => handleDeleteClick(note.ID)} disabled={isDeleting}>
                          Yes, delete
                        </button>
                        <button className="vn-confirm-no" onClick={cancelDelete}>Cancel</button>
                      </div>
                    ) : (
                      <button
                        className="vn-delete-btn"
                        onClick={() => handleDeleteClick(note.ID)}
                        disabled={isDeleting}
                        title="Delete voice note"
                      >
                        {isDeleting ? <span className="vn-del-spinner" /> : <TrashIcon size={13} />}
                        {isDeleting ? "Deleting…" : "Delete"}
                      </button>
                    )}
                  </div>
                </div>
                {/* pass saved duration for proper playback time display */}
                <AudioPlayer url={note.Blob_URL} knownDuration={note.Duration_Seconds} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default VoiceNotesSection;