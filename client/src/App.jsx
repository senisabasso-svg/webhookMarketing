import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { api } from "./api";
import Login from "./pages/Login";
import SuperAdmin from "./pages/SuperAdmin";
import VideoGeneration from "./pages/VideoGeneration";
import KimiChat from "./pages/KimiChat";
import InstagramInsights from "./pages/InstagramInsights";
import CompanyDashboard from "./pages/CompanyDashboard";
import IntegrationEdit from "./pages/IntegrationEdit";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .me()
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const handleLogin = (loggedUser) => {
    setUser(loggedUser);
    if (loggedUser.role === "superadmin") {
      navigate("/superadmin");
    } else {
      navigate("/admin");
    }
  };

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    setUser(null);
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="layout">
        <p className="muted">Cargando...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? (
            <Navigate to={user.role === "superadmin" ? "/superadmin" : "/admin"} />
          ) : (
            <Login onLogin={handleLogin} />
          )
        }
      />
      <Route
        path="/superadmin"
        element={
          user?.role === "superadmin" ? (
            <SuperAdmin user={user} onLogout={handleLogout} />
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      <Route
        path="/superadmin/generacion-video"
        element={
          user?.role === "superadmin" ? (
            <VideoGeneration user={user} onLogout={handleLogout} />
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      <Route
        path="/superadmin/chat-kimi"
        element={
          user?.role === "superadmin" ? (
            <KimiChat user={user} onLogout={handleLogout} />
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      <Route
        path="/superadmin/instagram-insights/:companyId"
        element={
          user?.role === "superadmin" ? (
            <InstagramInsights
              user={user}
              onLogout={handleLogout}
              mode="superadmin"
            />
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      <Route
        path="/admin"
        element={
          user?.role === "company_admin" ? (
            <CompanyDashboard user={user} onLogout={handleLogout} />
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      <Route
        path="/admin/instagram-insights"
        element={
          user?.role === "company_admin" ? (
            <InstagramInsights
              user={user}
              onLogout={handleLogout}
              mode="company"
            />
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      <Route
        path="/admin/integrations/:type"
        element={
          user?.role === "company_admin" ? (
            <IntegrationEdit user={user} onLogout={handleLogout} />
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
}

export default App;
