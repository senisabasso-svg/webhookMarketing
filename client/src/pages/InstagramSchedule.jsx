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

function MediaLightbox({ urls, index, onClose, onIndexChange }) {
  if (!urls?.length || index == null) return null;
  const current = urls[index];
  const total = urls.length;

  function prev(e) {
    e?.stopPropagation?.();
    onIndexChange((index - 1 + total) % total);
  }
  function next(e) {
    e?.stopPropagation?.();
    onIndexChange((index + 1) % total);
  }

  return (
    <div
      className="media-lightbox"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
        if (e.key === "ArrowLeft") prev(e);
        if (e.key === "ArrowRight") next(e);
      }}
    >
      <div className="media-lightbox__backdrop" />
      <div
        className="media-lightbox__panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="media-lightbox__top">
          <span className="muted">
            {index + 1} / {total}
          </span>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <img src={current} alt="" className="media-lightbox__img" />
        {total > 1 && (
          <div className="media-lightbox__nav">
            <button type="button" className="btn btn-secondary" onClick={prev}>
              Anterior
            </button>
            <button type="button" className="btn btn-secondary" onClick={next}>
              Siguiente
            </button>
          </div>
        )}
        {total > 1 && (
          <div className="media-lightbox__thumbs">
            {urls.map((src, i) => (
              <button
                key={src}
                type="button"
                className={`media-lightbox__thumb ${i === index ? "is-active" : ""}`}
                onClick={() => onIndexChange(i)}
              >
                <img src={src} alt="" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
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
  const [lightbox, setLightbox] = useState({ urls: [], index: null });

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
    // Preferir /files/scheduled/... (mismo origen del panel)
    let urls = [];
    if (post.previewUrls?.length) urls = post.previewUrls;
    else if (post.previewUrl) urls = [post.previewUrl];
    else if (post.mediaUrls?.length) urls = post.mediaUrls;
    else if (post.mediaUrl) urls = [post.mediaUrl];
    setExistingMediaUrls(urls);
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

  function openLightbox(urls, index = 0) {
    const list = (urls || []).filter(Boolean);
    if (!list.length) return;
    setLightbox({ urls: list, index: Math.max(0, Math.min(index, list.length - 1)) });
  }

  function closeLightbox() {
    setLightbox({ urls: [], index: null });
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
          En <strong>Imagen / Carrusel</strong> podés elegir 1–10 fotos. Las
          imágenes se guardan en la base hasta publicarse. Posts{" "}
          <strong>pendientes</strong>/<strong>fallidos</strong>: editar o
          eliminar.
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
                <button
                  key={src}
                  type="button"
                  className="schedule-thumb-btn"
                  title="Ver en grande"
                  onClick={() => openLightbox(previews, i)}
                >
                  <img src={src} alt="" />
                </button>
              ))}
            </div>
          )}
          {mediaType === "IMAGE" &&
            !previews.length &&
            existingMediaUrls.length > 0 && (
              <div className="schedule-preview-grid">
                {existingMediaUrls.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    className="schedule-thumb-btn"
                    title="Ver en grande"
                    onClick={() => openLightbox(existingMediaUrls, i)}
                  >
                    <img src={src} alt="" />
                  </button>
                ))}
              </div>
            )}
          {mediaType === "IMAGE" &&
            (previews.length > 0 || existingMediaUrls.length > 0) && (
              <p className="muted card-hint">
                Clic en una foto para verla en grande y recorrer el carrusel.
              </p>
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
                  {(p.previewUrls?.length > 0 || p.previewUrl) &&
                    p.mediaType !== "REELS" && (
                      <div className="schedule-preview-grid schedule-preview-grid--mini">
                        {(p.previewUrls || [p.previewUrl]).map((src, i) => (
                          <button
                            key={src}
                            type="button"
                            className="schedule-thumb-btn"
                            title="Ver en grande"
                            onClick={() =>
                              openLightbox(p.previewUrls || [p.previewUrl], i)
                            }
                          >
                            <img src={src} alt="" />
                          </button>
                        ))}
                      </div>
                    )}
                  {p.mediaType === "REELS" && (p.previewUrl || p.previewUrls?.[0]) && (
                    <video
                      src={p.previewUrl || p.previewUrls[0]}
                      className="schedule-preview schedule-preview--mini"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  )}
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
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          if (
                            window.confirm(
                              "¿Eliminar este post programado? Se borran también las fotos guardadas."
                            )
                          ) {
                            handleCancel(p.id);
                          }
                        }}
                        disabled={saving}
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <MediaLightbox
        urls={lightbox.urls}
        index={lightbox.index}
        onClose={closeLightbox}
        onIndexChange={(i) => setLightbox((prev) => ({ ...prev, index: i }))}
      />
    </div>
  );
}
