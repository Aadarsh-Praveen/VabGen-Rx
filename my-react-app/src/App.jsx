import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Login from "./pages/auth/login";
import Dashboard from "./pages/dashboard";
import Settings from "./pages/settings";
import Patients from "./pages/patients";
import PatientDetails from "./pages/patientDetails";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import SessionTimeoutModal from "./components/sessionTimeoutModal"; // ← ADD

const App = () => {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem("user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token && user) setUser(null);
  }, []);

  useEffect(() => {
    if (user) localStorage.setItem("user", JSON.stringify(user));
    else {
      localStorage.removeItem("user");
      localStorage.removeItem("token");
    }
  }, [user]);

  useEffect(() => {
    const saved = localStorage.getItem("theme") || "light";
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  const handleLogin     = (loggedInUser) => setUser(loggedInUser);
  const handleUserUpdate = (updatedUser) => setUser(updatedUser);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  return (
    <BrowserRouter>
      {/* ── Session timeout modal — only active when logged in ── */}
      {user && <SessionTimeoutModal onLogout={handleLogout} />}

      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login"   element={<Login onLogin={handleLogin} />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />

        <Route
          path="/dashboard"
          element={user ? <Dashboard user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/settings"
          element={
            user
              ? <Settings user={user} onUserUpdate={handleUserUpdate} onLogout={handleLogout} />
              : <Navigate to="/login" replace />
          }
        />
        <Route
          path="/patients"
          element={
            user
              ? <Patients user={user} onLogout={handleLogout} />
              : <Navigate to="/login" replace />
          }
        />
        <Route
          path="/patients/:id"
          element={
            user
              ? <PatientDetails user={user} onLogout={handleLogout} />
              : <Navigate to="/login" replace />
          }
        />
      </Routes>
    </BrowserRouter>
  );
};

export default App;