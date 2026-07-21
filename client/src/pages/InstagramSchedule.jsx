import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";

function toLocalInputValue(date = new Date(Date.now() + 60 * 60 * 1000)) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    return toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000));
  }
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

function mediaTypeLabel(type, count = 1) {
  if (type === "REELS") return "Reel";
  if (type === "CAROUSEL" || count > 1) return `Carrusel (${count})`;
  return "Imagen";
}

function editable(status) {
  return status === "pending" || status === "failed";
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
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [existingMediaUrls, setExistingMediaUrls] = useState([]);

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
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [files]);

  const accept = useMemo(
    () =>
      mediaType === "REELS"
        ? "video/mp4,video/quicktime,video/*"
        : "image/jpeg,image/png,image/webp,image/*",
    [mediaType]
  );

  function resetForm() {
    setEditingId(null);
    setMediaType("IMAGE");
    setCaption("");
    setScheduledAt(toLocalInputValue());
    setFiles([]);
    setExistingMediaUrls([]);
  }

  function startEdit(post) {
    setError("");
    setSuccess("");
    setEditingId(post.id);
    setMediaType(post.mediaType === "REELS" ? "REELS" : "IMAGE");
    setCaption(post.caption || "");
    setScheduledAt(toLocalInputValue(post.scheduledAt));
    setFiles([]);
    setExistingMediaUrls(post.mediaUrls || (post.mediaUrl ? [post.mediaUrl] : []));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onPickFiles(list) {
    const picked = Array.from(list || []);
    if (mediaType === "REELS") {
      setFiles(picked.slice(0, 1));
      return;
    }
    setFiles(picked.slice(0, 10));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!editingId && !files.length) {
      setError(
        mediaType === "REELS"
          ? "Subí un video."
          : "Subí al menos una imagen (hasta 10 para carrusel)."
      );
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
        mediaFiles: files,
      };

      if (editingId) {
        if (mode === "superadmin") {
          if (companyId === "legacy") {
            await api.updateLegacyScheduledPost(editingId, payload);
          } else {
            await api.updateAdminScheduledPost(companyId, editingId, payload);
          }
        } else {
          await api.updateCompanyScheduledPost(editingId, payload);
        }
        setSuccess("Post actualizado. Queda pendiente con los nuevos datos.");
      } else {
        if (mode === "superadmin") {
          if (companyId === "legacy") {
            await api.createLegacyScheduledPost(payload);
          } else {
            await api.createAdminScheduledPost(companyId, payload);
          }
        } else {
          await api.createCompanyScheduledPost(payload);
        }
        const kind =
          mediaType === "REELS"
            ? "Reel"
            : files.length > 1
              ? `carrusel de ${files.length} fotos`
              : "imagen";
        setSuccess(
          `Post programado (${kind}). Se publicará automáticamente a la hora indicada.`
        );
      }
      resetForm();
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
      if (editingId === id) resetForm();
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
          En <strong>Imagen / Carrusel</strong> podés elegir 1–10 fotos. Los
          posts <strong>pendientes</strong> o <strong>fallidos</strong> se
          pueden editar (caption, fecha/hora y media opcional).
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
            <h2>{editingId ? "Editar post" : "Programar nuevo"}</h2>
            {editingId && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={resetForm}
                disabled={saving}
              >
                Cancelar edición
              </button>
            )}
          </div>

          <label htmlFor="mediaType">Tipo</label>
          <select
            id="mediaType"
            value={mediaType}
            onChange={(e) => {
              setMediaType(e.target.value);
              setFiles([]);
            }}
            disabled={saving}
          >
            <option value="IMAGE">Imagen / Carrusel (feed)</option>
            <option value="REELS">Video / Reel</option>
          </select>

          <label htmlFor="media">
            {mediaType === "REELS"
              ? editingId
                ? "Video nuevo (opcional)"
                : "Video (MP4/MOV, máx 50MB)"
              : editingId
                ? "Fotos nuevas (opcional, 1–10)"
                : "Fotos (1–10 · JPG/PNG · máx 8MB c/u)"}
          </label>
          <input
            id="media"
            type="file"
            accept={accept}
            multiple={mediaType === "IMAGE"}
            disabled={saving}
            onChange={(e) => onPickFiles(e.target.files)}
          />
          {editingId && !files.length && (
            <p className="muted card-hint">
              Si no subís archivos nuevos, se mantienen los actuales.
            </p>
          )}
          {mediaType === "IMAGE" && files.length > 0 && (
            <p className="muted card-hint">
              {files.length === 1
                ? "1 foto → post simple"
                : `${files.length} fotos → carrusel`}
            </p>
          )}

          {mediaType === "IMAGE" && previews.length > 0 && (
            <div className="schedule-preview-grid">
              {previews.map((src, i) => (
                <img key={src} src={src} alt="" title={files[i]?.name} />
              ))}
            </div>
          )}
          {mediaType === "IMAGE" &&
            !previews.length &&
            existingMediaUrls.length > 0 && (
              <div className="schedule-preview-grid">
                {existingMediaUrls.map((src) => (
                  <img key={src} src={src} alt="" />
                ))}
              </div>
            )}
          {mediaType === "REELS" && previews[0] && (
            <video src={previews[0]} className="schedule-preview" controls muted />
          )}
          {mediaType === "REELS" && !previews[0] && existingMediaUrls[0] && (
            <video
              src={existingMediaUrls[0]}
              className="schedule-preview"
              controls
              muted
            />
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
            {saving
              ? "Guardando…"
              : editingId
                ? "Guardar cambios"
                : "Programar publicación"}
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
                <div
                  key={p.id}
                  className={`schedule-item status-${p.status}${
                    editingId === p.id ? " is-editing" : ""
                  }`}
                >
                  <div className="schedule-item__top">
                    <strong>
                      {mediaTypeLabel(p.mediaType, p.mediaCount || 1)}
                    </strong>
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
                  {editable(p.status) && (
                    <div className="header-actions" style={{ marginTop: "0.5rem" }}>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => startEdit(p)}
                        disabled={saving}
                      >
                        Editar
                      </button>
                      {p.status === "pending" && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => handleCancel(p.id)}
                          disabled={saving}
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
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
