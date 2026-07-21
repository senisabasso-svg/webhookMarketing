import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";

function toLocalInputValue(date = new Date(Date.now() + 60 * 60 * 1000)) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function statusLabel(status) {
  const map = {
    pending: "Pendiente",
    processing: "Publicando…",
    published: "Publicado",
    failed: "Falló",
    cancelled: "Cancelado",
  };
  return map[status] || status;
}

export default function InstagramSchedule({ user, onLogout, mode = "company" }) {
  const { companyId } = useParams();
  const [posts, setPosts] = useState([]);
  const [publicBaseUrl, setPublicBaseUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mediaType, setMediaType] = useState("IMAGE");
  const [caption, setCaption] = useState("");
  const [scheduledAt, setScheduledAt] = useState(toLocalInputValue());
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");

  const backTo =
    mode === "superadmin"
      ? `/superadmin/instagram-insights/${companyId || "legacy"}`
      : "/admin/instagram-insights";

  const resolvedId = mode === "superadmin" ? companyId || "legacy" : null;

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data =
        mode === "superadmin"
          ? companyId === "legacy"
            ? await api.getLegacyScheduledPosts()
            : await api.getAdminScheduledPosts(companyId)
          : await api.getCompanyScheduledPosts();
      setPosts(data.posts || []);
      setPublicBaseUrl(data.publicBaseUrl || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [mode, companyId]);

  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const accept = useMemo(
    () =>
      mediaType === "REELS"
        ? "video/mp4,video/quicktime,video/*"
        : "image/jpeg,image/png,image/webp,image/*",
    [mediaType]
  );

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!file) {
      setError("Subí una imagen o un video.");
      return;
    }
    if (!scheduledAt) {
      setError("Elegí fecha y hora.");
      return;
    }

    const iso = new Date(scheduledAt).toISOString();
    setSaving(true);
    try {
      const payload = {
        mediaType,
        caption,
        scheduledAt: iso,
        mediaFile: file,
      };
      if (mode === "superadmin") {
        if (companyId === "legacy") {
          await api.createLegacyScheduledPost(payload);
        } else {
          await api.createAdminScheduledPost(companyId, payload);
        }
      } else {
        await api.createCompanyScheduledPost(payload);
      }
      setSuccess("Post programado. Se publicará automáticamente a la hora indicada.");
      setCaption("");
      setFile(null);
      setScheduledAt(toLocalInputValue());
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(id) {
    setError("");
    try {
      if (mode === "superadmin") {
        if (companyId === "legacy") {
          await api.cancelLegacyScheduledPost(id);
        } else {
          await api.cancelAdminScheduledPost(companyId, id);
        }
      } else {
        await api.cancelCompanyScheduledPost(id);
      }
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="dash">
      <header className="dash-top">
        <div className="dash-top__brand">
          <span className="dash-eyebrow">INSTAGRAM · SCHEDULER</span>
          <h1>Posts programados</h1>
          <p>
            {user.companyName || user.email}
            {resolvedId ? ` · ${resolvedId}` : ""}
          </p>
        </div>
        <div className="dash-top__actions">
          <button type="button" className="btn btn-secondary" onClick={load}>
            Actualizar
          </button>
          <Link className="btn btn-secondary" to={backTo}>
            Volver al dashboard
          </Link>
          <button type="button" className="btn btn-secondary" onClick={onLogout}>
            Salir
          </button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <div className="dash-panel" style={{ marginBottom: "1rem" }}>
        <p className="muted card-hint">
          Subí imagen (feed) o video (Reel), poné caption y fecha/hora. El
          servidor publica solo vía Meta Content Publishing. Necesitás{" "}
          <code>PUBLIC_BASE_URL</code> HTTPS (Railway) y permiso{" "}
          <code>instagram_content_publish</code>.
        </p>
        {publicBaseUrl && (
          <p className="muted card-hint">
            Base pública: <code>{publicBaseUrl}</code>
          </p>
        )}
      </div>

      <div className="dash-grid" style={{ gridTemplateColumns: "1fr 1.1fr" }}>
        <form className="dash-panel" onSubmit={handleSubmit}>
          <div className="dash-panel__head">
            <h2>Programar nuevo</h2>
          </div>

          <label htmlFor="mediaType">Tipo</label>
          <select
            id="mediaType"
            value={mediaType}
            onChange={(e) => {
              setMediaType(e.target.value);
              setFile(null);
            }}
            disabled={saving}
          >
            <option value="IMAGE">Imagen (feed)</option>
            <option value="REELS">Video / Reel</option>
          </select>

          <label htmlFor="media">
            {mediaType === "REELS" ? "Video (MP4/MOV, máx 50MB)" : "Imagen (JPG/PNG, máx 8MB)"}
          </label>
          <input
            id="media"
            type="file"
            accept={accept}
            disabled={saving}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />

          {preview && mediaType === "IMAGE" && (
            <img src={preview} alt="" className="schedule-preview" />
          )}
          {preview && mediaType === "REELS" && (
            <video src={preview} className="schedule-preview" controls muted />
          )}

          <label htmlFor="caption">Descripción / caption</label>
          <textarea
            id="caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Texto del post + hashtags"
            disabled={saving}
          />

          <label htmlFor="when">Fecha y hora</label>
          <input
            id="when"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            disabled={saving}
          />

          <button type="submit" className="btn" disabled={saving}>
            {saving ? "Guardando…" : "Programar publicación"}
          </button>
        </form>

        <div className="dash-panel">
          <div className="dash-panel__head">
            <h2>Cola</h2>
            <span className="muted">{posts.length} posts</span>
          </div>
          {loading ? (
            <p className="muted">Cargando…</p>
          ) : posts.length === 0 ? (
            <p className="muted">No hay posts programados todavía.</p>
          ) : (
            <div className="schedule-list">
              {posts.map((p) => (
                <div key={p.id} className={`schedule-item status-${p.status}`}>
                  <div className="schedule-item__top">
                    <strong>{p.mediaType === "REELS" ? "Reel" : "Imagen"}</strong>
                    <span className={`badge badge-${p.status}`}>
                      {statusLabel(p.status)}
                    </span>
                  </div>
                  <p className="schedule-item__caption">
                    {(p.caption || "(sin caption)").slice(0, 120)}
                  </p>
                  <p className="muted">
                    {p.scheduledAt
                      ? new Date(p.scheduledAt).toLocaleString("es-UY")
                      : "—"}
                  </p>
                  {p.permalink && (
                    <a href={p.permalink} target="_blank" rel="noreferrer">
                      Ver en Instagram
                    </a>
                  )}
                  {p.errorMessage && (
                    <p className="error" style={{ marginTop: "0.5rem" }}>
                      {p.errorMessage}
                    </p>
                  )}
                  {p.status === "pending" && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ marginTop: "0.5rem" }}
                      onClick={() => handleCancel(p.id)}
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
