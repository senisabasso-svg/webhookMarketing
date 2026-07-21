import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";

function MetricCard({ label, value }) {
  const display =
    value == null || Number.isNaN(value)
      ? "—"
      : typeof value === "number"
        ? value.toLocaleString("es-UY")
        : String(value);
  return (
    <div className="metric-card">
      <p className="muted">{label}</p>
      <strong>{display}</strong>
    </div>
  );
}

function MediaRow({ item }) {
  return (
    <tr>
      <td>
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt=""
            className="insights-thumb"
          />
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td>
        <div className="insights-caption">
          {(item.caption || "(sin caption)").slice(0, 80)}
        </div>
        <span className="badge">{item.productType || item.mediaType}</span>
      </td>
      <td>{item.views?.toLocaleString?.("es-UY") ?? "—"}</td>
      <td>{item.reach?.toLocaleString?.("es-UY") ?? "—"}</td>
      <td>{item.likeCount?.toLocaleString?.("es-UY") ?? "—"}</td>
      <td>{item.commentsCount?.toLocaleString?.("es-UY") ?? "—"}</td>
      <td>{item.shares?.toLocaleString?.("es-UY") ?? "—"}</td>
      <td>{item.saved?.toLocaleString?.("es-UY") ?? "—"}</td>
      <td>
        {item.permalink ? (
          <a href={item.permalink} target="_blank" rel="noreferrer">
            Abrir
          </a>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}

export default function InstagramInsights({ user, onLogout, mode = "company" }) {
  const { companyId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const backTo =
    mode === "superadmin" ? "/superadmin" : "/admin";

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

  useEffect(() => {
    load();
  }, [mode, companyId]);

  const summary = data?.summary;
  const profile = summary?.profile;

  return (
    <div className="layout layout--wide">
      <header className="header">
        <div>
          <h1>Dashboard Instagram</h1>
          <p className="muted">
            {data?.company?.name || user.companyName || user.email}
            {profile?.username ? ` · @${profile.username}` : ""}
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
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
            Revisá que la empresa tenga <code>metaAccessToken</code> +{" "}
            <code>igAccountId</code> y el permiso{" "}
            <code>instagram_business_manage_insights</code> (o{" "}
            <code>instagram_manage_insights</code>).
          </p>
        </div>
      )}

      {loading && <p className="muted">Cargando métricas desde Meta…</p>}

      {!loading && summary && (
        <>
          <div className="card">
            <div className="insights-profile">
              {profile?.picture && (
                <img src={profile.picture} alt="" className="insights-avatar" />
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
            <div className="metrics-grid">
              <MetricCard label="Seguidores" value={profile?.followers} />
              <MetricCard label="Siguiendo" value={profile?.following} />
              <MetricCard label="Publicaciones" value={profile?.mediaCount} />
              <MetricCard
                label="Vistas (cuenta, día)"
                value={summary.accountDay?.views}
              />
              <MetricCard
                label="Alcance (cuenta, día)"
                value={summary.accountDay?.reach}
              />
              <MetricCard
                label="Visitas al perfil (día)"
                value={summary.accountDay?.profile_views}
              />
              <MetricCard
                label="Cuentas engaged (día)"
                value={summary.accountDay?.accounts_engaged}
              />
              <MetricCard
                label="Interacciones (día)"
                value={summary.accountDay?.total_interactions}
              />
            </div>
          </div>

          <div className="card">
            <h2>Totales en últimos {summary.mediaCountFetched} posts/reels</h2>
            <div className="metrics-grid">
              <MetricCard label="Vistas" value={summary.totalsRecentMedia?.views} />
              <MetricCard label="Me gusta" value={summary.totalsRecentMedia?.likes} />
              <MetricCard
                label="Comentarios"
                value={summary.totalsRecentMedia?.comments}
              />
              <MetricCard
                label="Reenvíos / shares"
                value={summary.totalsRecentMedia?.shares}
              />
              <MetricCard label="Guardados" value={summary.totalsRecentMedia?.saves} />
            </div>
          </div>

          <div className="card">
            <h2>Reels más vistos</h2>
            {summary.topReels?.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Contenido</th>
                      <th>Vistas</th>
                      <th>Alcance</th>
                      <th>Likes</th>
                      <th>Comentarios</th>
                      <th>Shares</th>
                      <th>Saves</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.topReels.map((item) => (
                      <MediaRow key={item.id} item={item} />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">
                No hay reels con métrica de vistas (o falta permiso insights).
              </p>
            )}
          </div>

          <div className="card">
            <h2>Contenido reciente</h2>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Contenido</th>
                    <th>Vistas</th>
                    <th>Alcance</th>
                    <th>Likes</th>
                    <th>Comentarios</th>
                    <th>Shares</th>
                    <th>Saves</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(data.media || []).map((item) => (
                    <MediaRow key={item.id} item={item} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {data.permissionsHint && (
            <p className="muted">{data.permissionsHint}</p>
          )}
        </>
      )}
    </div>
  );
}
