import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  const [febrosTracking, setFebrosTracking] = useState(null);
  const [leaderLoading, setLeaderLoading] = useState(true);
  const [leaderSaving, setLeaderSaving] = useState(false);
  const [leaderPdfUploading, setLeaderPdfUploading] = useState(false);
  const [leaderMeta, setLeaderMeta] = useState({ publicBaseUrl: "", metaNote: "" });
  const [leaderForm, setLeaderForm] = useState({
    keyword: "",
    replyText: "",
    enabled: false,
    pdfOriginalName: "",
    pdfUrl: "",
  });

  const [form, setForm] = useState({
    name: "",
    integrations: { instagram: false, whatsapp: false },
    adminEmail: "",
    adminPassword: "",
  });

  async function loadLeaderConfig() {
    setLeaderLoading(true);
    try {
      const data = await api.getLeaderComment();
      setLeaderMeta({
        publicBaseUrl: data.publicBaseUrl || "",
        metaNote: data.metaNote || "",
      });
      if (data.leader) {
        setLeaderForm({
          keyword: data.leader.keyword || "",
          replyText: data.leader.replyText || "",
          enabled: Boolean(data.leader.enabled),
          pdfOriginalName: data.leader.pdfOriginalName || "",
          pdfUrl: data.leader.pdfUrl || "",
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLeaderLoading(false);
    }
  }

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
    loadLeaderConfig();
    api.getFebrosTracking().then(setFebrosTracking).catch(() => {});
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

  async function handleLeaderSave(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLeaderSaving(true);

    try {
      const data = await api.updateLeaderComment({
        keyword: leaderForm.keyword,
        replyText: leaderForm.replyText,
        enabled: leaderForm.enabled,
      });
      if (data.leader) {
        setLeaderForm((prev) => ({
          ...prev,
          keyword: data.leader.keyword,
          replyText: data.leader.replyText,
          enabled: data.leader.enabled,
          pdfOriginalName: data.leader.pdfOriginalName || prev.pdfOriginalName,
          pdfUrl: data.leader.pdfUrl || prev.pdfUrl,
        }));
      }
      setSuccess("Configuración de comentarios Febros guardada");
    } catch (err) {
      setError(err.message);
    } finally {
      setLeaderSaving(false);
    }
  }

  async function handleLeaderPdfChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setSuccess("");
    setLeaderPdfUploading(true);

    try {
      const data = await api.uploadLeaderPdf(file);
      if (data.leader) {
        setLeaderForm((prev) => ({
          ...prev,
          pdfOriginalName: data.leader.pdfOriginalName || "",
          pdfUrl: data.leader.pdfUrl || "",
        }));
      }
      setSuccess("PDF cargado correctamente");
    } catch (err) {
      setError(err.message);
    } finally {
      setLeaderPdfUploading(false);
      e.target.value = "";
    }
  }

  async function handleLeaderPdfRemove() {
    setError("");
    setSuccess("");
    setLeaderPdfUploading(true);

    try {
      await api.deleteLeaderPdf();
      setLeaderForm((prev) => ({
        ...prev,
        pdfOriginalName: "",
        pdfUrl: "",
      }));
      setSuccess("PDF eliminado");
    } catch (err) {
      setError(err.message);
    } finally {
      setLeaderPdfUploading(false);
    }
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
        <div className="header-actions">
          <Link className="btn btn-secondary" to="/superadmin/generacion-video">
            GENERACIÓN VIDEO
          </Link>
          <Link className="btn btn-secondary" to="/superadmin/chat-kimi">
            CHAT KIMI
          </Link>
          <Link
            className="btn btn-secondary"
            to="/superadmin/instagram-insights/legacy"
          >
            Insights Febros
          </Link>
          {febrosTracking?.url ? (
            <a
              className="btn btn-secondary"
              href={febrosTracking.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Acceso seguimiento clientes febros
            </a>
          ) : (
            <button
              type="button"
              className="btn btn-secondary"
              disabled
              title="Configurá FEBROS_CLIENT_TRACKING_URL en Railway"
            >
              Acceso seguimiento clientes febros
            </button>
          )}
          <button className="btn btn-secondary" onClick={onLogout}>
            Salir
          </button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <div className="card card--leader">
        <h2>EMPRESA LÍDER — FEBROS</h2>
        <p className="muted card-hint">
          Empresa configurada por variables de entorno (@febros.uy). Si alguien
          comenta en cualquier post con la palabra clave, recibe un DM con tu
          texto y el PDF cargado.
        </p>
        {leaderMeta.metaNote && (
          <p className="muted card-hint">{leaderMeta.metaNote}</p>
        )}

        {leaderLoading ? (
          <p className="muted">Cargando configuración...</p>
        ) : (
          <form onSubmit={handleLeaderSave}>
            <div className="checkbox-row">
              <input
                type="checkbox"
                id="leader-enabled"
                checked={leaderForm.enabled}
                onChange={(e) =>
                  setLeaderForm((prev) => ({
                    ...prev,
                    enabled: e.target.checked,
                  }))
                }
              />
              <label htmlFor="leader-enabled" style={{ margin: 0 }}>
                Automatización activa
              </label>
            </div>

            <label>Palabra clave en el comentario</label>
            <input
              value={leaderForm.keyword}
              onChange={(e) =>
                setLeaderForm((prev) => ({ ...prev, keyword: e.target.value }))
              }
              placeholder='Ej: INFO, CATALOGO, PDF'
              required
            />

            <label>Texto del mensaje privado (DM)</label>
            <textarea
              value={leaderForm.replyText}
              onChange={(e) =>
                setLeaderForm((prev) => ({ ...prev, replyText: e.target.value }))
              }
              placeholder="¡Hola! Gracias por comentar. Te comparto la info..."
              required
            />

            <label>PDF para enviar por DM</label>
            {leaderForm.pdfOriginalName ? (
              <div className="pdf-current">
                <span>{leaderForm.pdfOriginalName}</span>
                {leaderForm.pdfUrl && (
                  <a href={leaderForm.pdfUrl} target="_blank" rel="noreferrer">
                    Ver PDF
                  </a>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleLeaderPdfRemove}
                  disabled={leaderPdfUploading}
                >
                  Quitar PDF
                </button>
              </div>
            ) : (
              <p className="muted">Todavía no hay PDF cargado.</p>
            )}
            <input
              type="file"
              accept="application/pdf"
              onChange={handleLeaderPdfChange}
              disabled={leaderPdfUploading}
            />

            {leaderMeta.publicBaseUrl && (
              <p className="muted card-hint">
                URL pública base: {leaderMeta.publicBaseUrl}
              </p>
            )}

            <button className="btn" type="submit" disabled={leaderSaving}>
              {leaderSaving ? "Guardando..." : "Guardar configuración Febros"}
            </button>
          </form>
        )}
      </div>

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
                <th>Dashboard</th>
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
                  <td>
                    {(c.integrations || []).some((i) => i.type === "instagram") ? (
                      <Link
                        className="btn btn-secondary"
                        to={`/superadmin/instagram-insights/${c.id}`}
                      >
                        Insights IG
                      </Link>
                    ) : (
                      <span className="muted">—</span>
                    )}
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
