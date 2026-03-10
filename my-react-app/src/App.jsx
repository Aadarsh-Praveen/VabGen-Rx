import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { logout, updateUser } from "./store/authSlice";
import Login               from "./pages/auth/login";
import Dashboard           from "./pages/dashboard";
import Settings            from "./pages/settings";
import Patients            from "./pages/patients";
import PatientDetails      from "./pages/patientDetails";
import PrivacyPolicy       from "./pages/PrivacyPolicy";
import SessionTimeoutModal from "./components/sessionTimeoutModal";
import Chatbot             from "./components/chatbot";

const Protected = ({ children }) => {
  const token = useSelector(s => s.auth.token);
  if (!token) return <Navigate to="/login" replace />;
  return children;
};

const App = () => {
  const dispatch = useDispatch();
  const user     = useSelector(s => s.auth.user);
  const token    = useSelector(s => s.auth.token);

  useEffect(() => {
    const saved = localStorage.getItem("theme") || "light";
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  const handleLogout     = () => dispatch(logout());
  const handleUserUpdate = (updated) => dispatch(updateUser(updated));

  return (
    <BrowserRouter>
      {token && <SessionTimeoutModal onLogout={handleLogout} />}
      {token && <Chatbot />}

      <Routes>
        <Route path="/"        element={<Navigate to="/login" replace />} />
        <Route path="/login"   element={<Login />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />

        <Route path="/dashboard" element={
          <Protected><Dashboard user={user} onLogout={handleLogout} /></Protected>
        } />
        <Route path="/settings" element={
          <Protected><Settings user={user} onUserUpdate={handleUserUpdate} onLogout={handleLogout} /></Protected>
        } />
        <Route path="/patients" element={
          <Protected><Patients user={user} onLogout={handleLogout} /></Protected>
        } />
        <Route path="/patients/:id" element={
          <Protected><PatientDetails user={user} onLogout={handleLogout} /></Protected>
        } />
      </Routes>
    </BrowserRouter>
  );
};

export default App;