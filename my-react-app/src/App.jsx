import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Login from "./pages/auth/login";
import Dashboard from "./pages/dashboard";
import Settings from "./pages/settings";
import Patients from "./pages/patients";          // ← add this

const App = () => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem("theme") || "light";
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  const handleUserUpdate = (updatedUser) => setUser(updatedUser);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login onLogin={setUser} />} />
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
        {/* ── Patients ── */}
        <Route
          path="/patients"
          element={
            user
              ? <Patients user={user} />
              : <Navigate to="/login" replace />
          }
        />
      </Routes>
    </BrowserRouter>
  );
};

export default App;