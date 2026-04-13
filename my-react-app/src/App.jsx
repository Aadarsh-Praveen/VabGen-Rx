import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import OfflinePage  from "./pages/OfflinePage";
import OfflineAdmin from "./pages/OfflineAdmin";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"        element={<Navigate to="/offline" replace />} />
        <Route path="/offline" element={<OfflinePage />} />
        <Route path="/admin"   element={<OfflineAdmin />} />
        <Route path="*"        element={<Navigate to="/offline" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
