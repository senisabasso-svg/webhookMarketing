import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function KimiChat({ user, onLogout, mode = "superadmin" }) {
  const [meta, setMeta] = useState(null);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [companyId, setCompanyId] = useState(
    mode === "company" ? user.companyId || "" : "legacy"
  );
  const [contextInfo, setContextInfo] = useState(null);

  const backTo = mode === "superadmin" ? "/superadmin" : "/admin";

  useEffect(() => {
    const load =
      mode === "company" ? api.getCompanyAiChatMeta() : api.getAiChatMeta();
    load
      .then((data) => {
        setMeta(data);
        if (mode === "company" && data.companyId) {
          setCompanyId(data.companyId);
        }
      })
      .catch((err) => setError(err.message));
  }, [mode]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const text = message.trim();
    if (!text) return;

    setLoading(true);
    setMessage("");
    const nextHistory = [...history, { role: "user", content: text }];
    setHistory(nextHistory);

    try {
      const payload = {
        message: text,
        history,
        refreshContext: history.length === 0,
      };
      const data =
        mode === "company"
          ? await api.sendCompanyAiChat(payload)
          : await api.sendAiChat({ ...payload, companyId });

      setContextInfo({
        companyName: data.companyName,
        username: data.username,
        contextFetchedAt: data.contextFetchedAt,
        insightsError: data.insightsError,
      });
      setHistory((prev) => [
        ...prev,
        { role: "assistant", content: data.reply, model: data.model },
      ]);
    } catch (err) {
      setError(err.message);
      setHistory((prev) => prev.slice(0, -1));
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="layout">
      <header className="header">
        <div>
          <h1>CHAT GROWTH</h1>
          <p className="muted">
            {user.email} ·{" "}
            {meta?.model || "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"}
          </p>
        </div>
        <div className="header-actions">
          <Link className="btn btn-secondary" to={backTo}>
            Volver
          </Link>
          <button type="button" className="btn btn-secondary" onClick={onLogout}>
            Salir
          </button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      {meta && !meta.configured && (
        <div className="error">
          Falta <code>NVIDIA_API_KEY</code> en Railway / .env.
        </div>
      )}

      <div className="card">
        <h2>Plan de crecimiento con datos reales de Instagram</h2>
        <p className="muted card-hint">
          Antes de responder, el sistema carga métricas de la empresa
          (seguidores, reels más vistos, likes, shares, etc.) y se las pasa al
          modelo.
        </p>

        {mode === "superadmin" && (
          <>
            <label htmlFor="company">Empresa</label>
            <select
              id="company"
              value={companyId}
              disabled={loading}
              onChange={(e) => {
                setCompanyId(e.target.value);
                setHistory([]);
                setContextInfo(null);
              }}
            >
              {(meta?.companies || [{ id: "legacy", name: "Febros (.env)" }]).map(
                (c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                )
              )}
            </select>
          </>
        )}

        {mode === "company" && (
          <p className="muted card-hint">
            Empresa: <strong>{meta?.companyName || user.companyName || "tu empresa"}</strong>
          </p>
        )}

        {contextInfo && (
          <p className="muted card-hint">
            Contexto: {contextInfo.companyName}
            {contextInfo.username ? ` · @${contextInfo.username}` : ""}
            {contextInfo.contextFetchedAt
              ? ` · métricas ${new Date(contextInfo.contextFetchedAt).toLocaleString("es-UY")}`
              : ""}
            {contextInfo.insightsError
              ? ` · aviso: ${contextInfo.insightsError}`
              : ""}
          </p>
        )}

        <div className="chat-thread">
          {history.length === 0 && (
            <p className="muted">
              Probá: “¿Cuál fue el reel más visto?” o “Armame un plan de
              crecimiento de 30 días”.
            </p>
          )}
          {history.map((turn, idx) => (
            <div
              key={`${turn.role}-${idx}`}
              className={`chat-bubble chat-bubble--${turn.role}`}
            >
              <strong>{turn.role === "user" ? "Vos" : "Growth AI"}</strong>
              <p>{turn.content}</p>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <label htmlFor="msg">Mensaje</label>
          <textarea
            id="msg"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Armame un plan de crecimiento basado en mis métricas"
            disabled={loading || (meta && !meta.configured)}
          />
          <button
            type="submit"
            className="btn"
            disabled={loading || !message.trim() || (meta && !meta.configured)}
          >
            {loading ? "Cargando métricas + pensando..." : "Enviar"}
          </button>
          {history.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginLeft: "0.5rem" }}
              disabled={loading}
              onClick={() => {
                setHistory([]);
                setContextInfo(null);
              }}
            >
              Limpiar chat
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
