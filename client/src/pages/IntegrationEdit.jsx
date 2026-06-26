import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";

const TYPE_LABELS = {
  instagram: "Instagram IA",
  whatsapp: "WhatsApp IA",
};

export default function IntegrationEdit({ user, onLogout }) {
  const { type } = useParams();
  const [fields, setFields] = useState([]);
  const [config, setConfig] = useState({});
  const [emitterId, setEmitterId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError("");
    api
      .getIntegration(type)
      .then((data) => {
        setFields(data.fields || []);
        setConfig(data.config || {});
        setEmitterId(data.emitterId || "");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [type]);

  function updateField(key, value) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    try {
      const result = await api.updateIntegration(type, config);
      setEmitterId(result.emitterId || "");
      setSuccess("Configuración guardada correctamente");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="layout">
      <header className="header">
        <div>
          <h1>{TYPE_LABELS[type] || type}</h1>
          <p className="muted">
            {user.companyName} · {user.email}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link className="btn btn-secondary" to="/admin">
            Volver
          </Link>
          <button className="btn btn-secondary" onClick={onLogout}>
            Salir
          </button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      {emitterId && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            ID emisor activo: <strong>{emitterId}</strong>
          </p>
        </div>
      )}

      <div className="card">
        {loading ? (
          <p className="muted">Cargando campos...</p>
        ) : (
          <form onSubmit={handleSave}>
            {fields.map((field) => (
              <div key={field.key}>
                <label>
                  {field.label}
                  {field.required ? " *" : ""}
                </label>
                {field.type === "textarea" ? (
                  <textarea
                    value={config[field.key] || ""}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    required={field.required}
                  />
                ) : (
                  <input
                    type={field.type === "password" ? "password" : "text"}
                    value={config[field.key] || ""}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    required={field.required}
                    placeholder={field.default || ""}
                  />
                )}
              </div>
            ))}

            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Guardando..." : "Guardar configuración"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
