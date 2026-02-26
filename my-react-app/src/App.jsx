import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Login from "./pages/auth/login";
import Dashboard from "./pages/dashboard";
import Settings from "./pages/settings";
import Patients from "./pages/patients";
import PatientDetails from "./pages/patientDetails";

const App = () => {
  // ── Persist user in localStorage so page refresh doesn't log out ──
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem("user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Save user to localStorage whenever it changes
  useEffect(() => {
    if (user) localStorage.setItem("user", JSON.stringify(user));
    else localStorage.removeItem("user");
  }, [user]);

  // Apply saved theme on load
  useEffect(() => {
    const saved = localStorage.getItem("theme") || "light";
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  const handleLogin = (loggedInUser) => setUser(loggedInUser);
  const handleUserUpdate = (updatedUser) => setUser(updatedUser);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login onLogin={handleLogin} />} />
        <Route
          path="/dashboard"
          element={user ? <Dashboard user={user} /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/settings"
          element={
            user
              ? <Settings user={user} onUserUpdate={handleUserUpdate} />
              : <Navigate to="/login" replace />
          }
        />
        {/* ── Patients list ── */}
        <Route
          path="/patients"
          element={
            user
              ? <Patients user={user} />
              : <Navigate to="/login" replace />
          }
        />
        {/* ── Patient detail ── */}
        <Route
          path="/patients/:id"
          element={
            user
              ? <PatientDetails user={user} />
              : <Navigate to="/login" replace />
          }
        />
      </Routes>
    </BrowserRouter>
  );
};

export default App;