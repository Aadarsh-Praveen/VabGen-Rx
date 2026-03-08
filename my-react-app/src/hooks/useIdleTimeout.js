// src/hooks/useIdleTimeout.js
import { useEffect, useRef, useCallback } from 'react';

const IDLE_TIMEOUT  = 15 * 60 * 1000; // 15 minutes
const WARN_BEFORE   =  1 * 60 * 1000; // warn 1 minute before logout

export const useIdleTimeout = ({ onWarn, onLogout }) => {
  const logoutTimer = useRef(null);
  const warnTimer   = useRef(null);

  const resetTimers = useCallback(() => {
    clearTimeout(logoutTimer.current);
    clearTimeout(warnTimer.current);

    // Show warning at 14 minutes
    warnTimer.current = setTimeout(() => {
      onWarn();
    }, IDLE_TIMEOUT - WARN_BEFORE);

    // Auto logout at 15 minutes
    logoutTimer.current = setTimeout(() => {
      onLogout();
    }, IDLE_TIMEOUT);
  }, [onWarn, onLogout]);

  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll', 'click'];

    // Reset on any user activity
    events.forEach(e => window.addEventListener(e, resetTimers));
    resetTimers(); // start timers on mount

    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimers));
      clearTimeout(logoutTimer.current);
      clearTimeout(warnTimer.current);
    };
  }, [resetTimers]);
};