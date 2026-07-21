import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";

function fmt(value) {
  if (value == null || Number.isNaN(value)) return "—";
  if (typeof value === "number") return value.toLocaleString("es-UY");
  return String(value);
}

function KpiCard({ label, value, hint }) {
  return (
    <div className="dash-kpi">
      <p className="dash-kpi__label">{label}</p>
      <strong className="dash-kpi__value">{fmt(value)}</strong>
      {hint ? <span className="dash-kpi__hint">{hint}</span> : null}
    </div>
  );
}

function BarRow({ label, value, max, color }) {
  const pct = max > 0 ? Math.max(4, Math.round((Number(value) / max) * 100)) : 0;
  return (
    <div className="dash-bar-row">
      <div className="dash-bar-row__meta">
        <span>{label}</span>
        <strong>{fmt(value)}</strong>
      </div>
      <div className="dash-bar-track">
        <div
          className="dash-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function PostCard({ item }) {
  return (
    <a
      className="dash-post"
      href={item.permalink || "#"}
      target={item.permalink ? "_blank" : undefined}
      rel="noreferrer"
    >
      {item.thumbnailUrl ? (
        <img src={item.thumbnailUrl} alt="" />
      ) : (
        <div className="dash-post__placeholder" />
      )}
      <div className="dash-post__body">
        <p>{(item.caption || "(sin caption)").slice(0, 70)}</p>
        <span className="badge">{item.productType || item.mediaType}</span>
        <div className="dash-post__stats">
          <span>{fmt(item.views)} vistas</span>
          <span>{fmt(item.likeCount)} likes</span>
          <span>{fmt(item.shares)} shares</span>
        </div>
      </div>
    </a>
  );
}

export default function InstagramInsights({ user, onLogout, mode = "company" }) {
  const { companyId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inboxOpen, setInboxOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [thread, setThread] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);

  const backTo = mode === "superadmin" ? "/superadmin" : "/admin";
  const resolvedCompanyId =
    mode === "superadmin" ? companyId || "legacy" : null;

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result =
        mode === "superadmin"
          ? companyId === "legacy"
            ? await api.getLegacyInstagramInsights()
            : await api.getAdminCompanyInstagramInsights(companyId)
          : await api.getCompanyInstagramInsights();
      setData(result);
    } catch (err) {
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadConversations() {
    setInboxLoading(true);
    setInboxError("");
    try {
      const result =
        mode === "superadmin"
          ? companyId === "legacy"
            ? await api.getLegacyInstagramConversations()
            : await api.getAdminCompanyInstagramConversations(companyId)
          : await api.getCompanyInstagramConversations();
      setConversations(result.conversations || []);
    } catch (err) {
      setInboxError(err.message);
      setConversations([]);
    } finally {
      setInboxLoading(false);
    }
  }

  async function openThread(userId) {
    setSelectedUserId(userId);
    setThreadLoading(true);
    try {
      const result =
        mode === "superadmin"
          ? companyId === "legacy"
            ? await api.getLegacyInstagramConversation(userId)
            : await api.getAdminCompanyInstagramConversation(companyId, userId)
          : await api.getCompanyInstagramConversation(userId);
      setThread(result.messages || []);
    } catch (err) {
      setInboxError(err.message);
      setThread([]);
    } finally {
      setThreadLoading(false);
    }
  }

  async function openInbox() {
    setInboxOpen(true);
    setSelectedUserId(null);
    setThread([]);
    await loadConversations();
  }

  useEffect(() => {
    load();
  }, [mode, companyId]);

  const summary = data?.summary;
  const profile = summary?.profile;
  const day = summary?.accountDay || {};
  const totals = summary?.totalsRecentMedia || {};
  const topReels = summary?.topReels || [];
  const media = data?.media || [];

  const maxReelViews = useMemo(
    () => Math.max(1, ...topReels.map((r) => Number(r.views) || 0)),
    [topReels]
  );

  const engagementBars = useMemo(() => {
    const items = [
      { label: "Likes", value: totals.likes || 0, color: "#60a5fa" },
      { label: "Comentarios", value: totals.comments || 0, color: "#34d399" },
      { label: "Shares", value: totals.shares || 0, color: "#fbbf24" },
      { label: "Guardados", value: totals.saves || 0, color: "#f472b6" },
    ];
    const max = Math.max(1, ...items.map((i) => i.value));
    return { items, max };
  }, [totals]);

  return (
    <div className="dash">
      <header className="dash-top">
        <div className="dash-top__brand">
          <span className="dash-eyebrow">SOCIAL · INSTAGRAM</span>
          <h1>Overview</h1>
          <p>
            {data?.company?.name || user.companyName || "Empresa"}
            {profile?.username ? ` · @${profile.username}` : ""}
            {resolvedCompanyId ? ` · ${resolvedCompanyId}` : ""}
          </p>
        </div>
        <div className="dash-top__actions">
          <Link
            className="btn"
            to={
              mode === "superadmin"
                ? `/superadmin/instagram-schedule/${companyId || "legacy"}`
                : "/admin/instagram-schedule"
            }
          >
            Posts programados
          </Link>
          <button type="button" className="btn btn-secondary" onClick={openInbox}>
            Conversaciones chatbot
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={load}
            disabled={loading}
          >
            Actualizar
          </button>
          <Link className="btn btn-secondary" to={backTo}>
            Volver
          </Link>
          <button type="button" className="btn btn-secondary" onClick={onLogout}>
            Salir
          </button>
        </div>
      </header>

      {error && (
        <div className="error">
          {error}
          <p className="muted" style={{ marginTop: "0.5rem" }}>
            Revisá <code>metaAccessToken</code>, <code>igAccountId</code> y
            permisos de insights.
          </p>
        </div>
      )}

      {loading && <p className="muted">Cargando dashboard…</p>}

      {!loading && summary && (
        <>
          <section className="dash-hero">
            <div className="dash-profile-card">
              {profile?.picture ? (
                <img src={profile.picture} alt="" className="dash-avatar" />
              ) : (
                <div className="dash-avatar dash-avatar--empty" />
              )}
              <div>
                <h2>@{profile?.username || "cuenta"}</h2>
                <p className="muted">
                  {profile?.name || ""} · actualizado{" "}
                  {data.fetchedAt
                    ? new Date(data.fetchedAt).toLocaleString("es-UY")
                    : "—"}
                </p>
              </div>
            </div>
            <div className="dash-kpi-grid">
              <KpiCard label="Seguidores" value={profile?.followers} hint="cuenta" />
              <KpiCard label="Vistas hoy" value={day.views} hint="día" />
              <KpiCard label="Alcance hoy" value={day.reach} hint="día" />
              <KpiCard
                label="Engaged"
                value={day.accounts_engaged}
                hint="cuentas"
              />
              <KpiCard
                label="Visitas perfil"
                value={day.profile_views}
                hint="día"
              />
              <KpiCard
                label="Interacciones"
                value={day.total_interactions}
                hint="día"
              />
            </div>
          </section>

          <section className="dash-grid">
            <div className="dash-panel dash-panel--wide">
              <div className="dash-panel__head">
                <h2>Reels más vistos</h2>
                <span className="muted">Top por vistas</span>
              </div>
              {topReels.length ? (
                <div className="dash-bars">
                  {topReels.map((item) => (
                    <BarRow
                      key={item.id}
                      label={(item.caption || "Reel").slice(0, 42)}
                      value={item.views}
                      max={maxReelViews}
                      color="#3b82f6"
                    />
                  ))}
                </div>
              ) : (
                <p className="muted">Sin reels con métrica de vistas.</p>
              )}
            </div>

            <div className="dash-panel">
              <div className="dash-panel__head">
                <h2>Engagement reciente</h2>
                <span className="muted">
                  Últimos {summary.mediaCountFetched} posts
                </span>
              </div>
              <div className="dash-mini-kpis">
                <div>
                  <span>Vistas</span>
                  <strong>{fmt(totals.views)}</strong>
                </div>
                <div>
                  <span>Likes</span>
                  <strong>{fmt(totals.likes)}</strong>
                </div>
                <div>
                  <span>Shares</span>
                  <strong>{fmt(totals.shares)}</strong>
                </div>
              </div>
              <div className="dash-bars">
                {engagementBars.items.map((item) => (
                  <BarRow
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    max={engagementBars.max}
                    color={item.color}
                  />
                ))}
              </div>
            </div>

            <div className="dash-panel">
              <div className="dash-panel__head">
                <h2>Cuenta</h2>
                <span className="muted">perfil</span>
              </div>
              <div className="dash-stat-list">
                <div>
                  <span>Siguiendo</span>
                  <strong>{fmt(profile?.following)}</strong>
                </div>
                <div>
                  <span>Publicaciones</span>
                  <strong>{fmt(profile?.mediaCount)}</strong>
                </div>
                <div>
                  <span>Comentarios (recientes)</span>
                  <strong>{fmt(totals.comments)}</strong>
                </div>
                <div>
                  <span>Guardados (recientes)</span>
                  <strong>{fmt(totals.saves)}</strong>
                </div>
              </div>
              <button type="button" className="btn" onClick={openInbox}>
                Ver quién habló con el chatbot
              </button>
            </div>
          </section>

          <section className="dash-panel">
            <div className="dash-panel__head">
              <h2>Últimos posts / reels</h2>
              <span className="muted">contenido reciente</span>
            </div>
            <div className="dash-posts">
              {media.slice(0, 8).map((item) => (
                <PostCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        </>
      )}

      {inboxOpen && (
        <div className="dash-modal" role="dialog" aria-modal="true">
          <div className="dash-modal__backdrop" onClick={() => setInboxOpen(false)} />
          <div className="dash-modal__panel">
            <div className="dash-modal__head">
              <div>
                <h2>Conversaciones Instagram</h2>
                <p className="muted">
                  Usuarios que hablaron con el chatbot (últimos 30 días)
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setInboxOpen(false)}
              >
                Cerrar
              </button>
            </div>

            {inboxError && <div className="error">{inboxError}</div>}

            <div className="dash-inbox">
              <aside className="dash-inbox__list">
                {inboxLoading && <p className="muted">Cargando…</p>}
                {!inboxLoading && conversations.length === 0 && (
                  <p className="muted">
                    Todavía no hay conversaciones guardadas. Aparecen cuando
                    alguien escribe al Instagram y el bot responde (requiere
                    DATABASE_URL en Railway).
                  </p>
                )}
                {conversations.map((c) => (
                  <button
                    key={c.userId}
                    type="button"
                    className={`dash-inbox__item ${
                      selectedUserId === c.userId ? "is-active" : ""
                    }`}
                    onClick={() => openThread(c.userId)}
                  >
                    <strong>IG {c.userId.slice(-8)}</strong>
                    <span className="muted">{c.lastPreview || "—"}</span>
                    <span className="muted">
                      {c.lastAt
                        ? new Date(c.lastAt).toLocaleString("es-UY")
                        : "—"}{" "}
                      · {c.messageCount} msgs
                    </span>
                  </button>
                ))}
              </aside>

              <div className="dash-inbox__thread">
                {!selectedUserId && (
                  <p className="muted">Elegí una conversación a la izquierda.</p>
                )}
                {selectedUserId && (
                  <>
                    <p className="dash-inbox__thread-title">
                      Chat con <code>{selectedUserId}</code>
                    </p>
                    {threadLoading ? (
                      <p className="muted">Cargando mensajes…</p>
                    ) : (
                      <div className="dash-thread">
                        {thread.map((m, idx) => (
                          <div
                            key={`${m.createdAt}-${idx}`}
                            className={`dash-bubble dash-bubble--${m.role}`}
                          >
                            <strong>
                              {m.role === "user" ? "Usuario" : "Chatbot"}
                            </strong>
                            <p>{m.content}</p>
                            <span className="muted">
                              {m.createdAt
                                ? new Date(m.createdAt).toLocaleString("es-UY")
                                : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
