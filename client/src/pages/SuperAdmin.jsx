import { useEffect, useState } from "react";
import { api } from "../api";

const INTEGRATION_LABELS = {
  instagram: "Instagram IA",
  whatsapp: "WhatsApp IA",
};

export default function SuperAdmin({ user, onLogout }) {
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    name: "",
    integrations: { instagram: false, whatsapp: false },
    adminEmail: "",
    adminPassword: "",
  });

  async function loadCompanies() {
    setLoading(true);
    try {
      const data = await api.listCompanies();
      setCompanies(data.companies);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCompanies();
  }, []);

  function updateForm(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleIntegration(type) {
    setForm((prev) => ({
      ...prev,
      integrations: {
        ...prev.integrations,
        [type]: !prev.integrations[type],
      },
    }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setCreating(true);

    const integrations = Object.entries(form.integrations)
      .filter(([, enabled]) => enabled)
      .map(([type]) => type);

    try {
      await api.createCompany({
        name: form.name,
        integrations,
        admin: {
          email: form.adminEmail,
          password: form.adminPassword,
        },
      });

      setSuccess(`Empresa "${form.name}" creada correctamente`);
      setForm({
        name: "",
        integrations: { instagram: false, whatsapp: false },
        adminEmail: "",
        adminPassword: "",
      });
      await loadCompanies();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="layout">
      <header className="header">
        <div>
          <h1>Superadmin</h1>
          <p className="muted">{user.email}</p>
        </div>
        <button className="btn btn-secondary" onClick={onLogout}>
          Salir
        </button>
      </header>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <div className="card">
        <h2>Crear empresa</h2>
        <form onSubmit={handleCreate}>
          <label>Nombre de la empresa</label>
          <input
            value={form.name}
            onChange={(e) => updateForm("name", e.target.value)}
            placeholder="Ej: Acme Corp"
            required
          />

          <label>Integraciones</label>
          {Object.entries(INTEGRATION_LABELS).map(([type, label]) => (
            <div className="checkbox-row" key={type}>
              <input
                type="checkbox"
                id={`int-${type}`}
                checked={form.integrations[type]}
                onChange={() => toggleIntegration(type)}
              />
              <label htmlFor={`int-${type}`} style={{ margin: 0 }}>
                {label}
              </label>
            </div>
          ))}

          <div className="grid-2">
            <div>
              <label>Email admin de la empresa</label>
              <input
                type="email"
                value={form.adminEmail}
                onChange={(e) => updateForm("adminEmail", e.target.value)}
                required
              />
            </div>
            <div>
              <label>Contraseña admin</label>
              <input
                type="password"
                value={form.adminPassword}
                onChange={(e) => updateForm("adminPassword", e.target.value)}
                minLength={8}
                required
              />
            </div>
          </div>

          <button className="btn" type="submit" disabled={creating}>
            {creating ? "Creando..." : "Crear empresa"}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Empresas registradas</h2>
        {loading ? (
          <p className="muted">Cargando...</p>
        ) : companies.length === 0 ? (
          <p className="muted">No hay empresas todavía.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Integraciones</th>
                <th>ID emisor</th>
                <th>Creada</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>
                    {(c.integrations || []).map((i) => (
                      <span className="badge" key={i.type}>
                        {INTEGRATION_LABELS[i.type] || i.type}
                      </span>
                    ))}
                  </td>
                  <td className="muted">
                    {(c.integrations || [])
                      .filter((i) => i.emitter_id)
                      .map((i) => `${i.type}: ${i.emitter_id}`)
                      .join(" · ") || "—"}
                  </td>
                  <td className="muted">
                    {new Date(c.created_at).toLocaleDateString("es-UY")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="muted">
        Tu empresa actual (Febros) sigue funcionando desde las variables de entorno
        (.env). Las nuevas empresas se configuran desde su panel admin.
      </p>
    </div>
  );
}
