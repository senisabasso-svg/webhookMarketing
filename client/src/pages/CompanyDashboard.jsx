import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

const INTEGRATION_LABELS = {
  instagram: "Instagram IA",
  whatsapp: "WhatsApp IA",
};

export default function CompanyDashboard({ user, onLogout }) {
  const [company, setCompany] = useState(null);
  const [integrations, setIntegrations] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getCompany()
      .then((data) => {
        setCompany(data.company);
        setIntegrations(data.integrations || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="layout">
      <header className="header">
        <div>
          <h1>{company?.name || user.companyName || "Mi empresa"}</h1>
          <p className="muted">Admin · {user.email}</p>
        </div>
        <button className="btn btn-secondary" onClick={onLogout}>
          Salir
        </button>
      </header>

      {error && <div className="error">{error}</div>}

      <div className="card">
        <h2>Integraciones</h2>
        {loading ? (
          <p className="muted">Cargando...</p>
        ) : integrations.length === 0 ? (
          <p className="muted">No hay integraciones habilitadas.</p>
        ) : (
          <div className="integration-links">
            {integrations.some((i) => i.type === "instagram") && (
              <>
                <Link className="btn" to="/admin/instagram-insights">
                  Dashboard Instagram
                </Link>
                <Link className="btn" to="/admin/chat-growth">
                  Chat plan de crecimiento
                </Link>
              </>
            )}
            {integrations.map((i) => (
              <Link
                key={i.type}
                className="btn btn-secondary"
                to={`/admin/integrations/${i.type}`}
              >
                Editar campos IA — {INTEGRATION_LABELS[i.type] || i.type}
              </Link>
            ))}
          </div>
        )}

        {integrations.some((i) => i.emitter_id) && (
          <p className="muted" style={{ marginTop: "1.25rem" }}>
            ID emisor registrado:{" "}
            {integrations
              .filter((i) => i.emitter_id)
              .map((i) => `${i.type} → ${i.emitter_id}`)
              .join(" · ")}
          </p>
        )}
      </div>

      <div className="card">
        <h2>Webhook</h2>
        <p className="muted">
          Todas las empresas usan el mismo endpoint:{" "}
          <code>/webhook</code>. Meta identifica tu empresa por el{" "}
          <strong>IG Account ID</strong> (Instagram) o{" "}
          <strong>Phone Number ID</strong> (WhatsApp) que configures abajo.
        </p>
      </div>
    </div>
  );
}
