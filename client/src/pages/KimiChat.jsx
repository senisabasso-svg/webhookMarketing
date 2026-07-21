import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function KimiChat({ user, onLogout }) {
  const [meta, setMeta] = useState(null);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getAiChatMeta()
      .then(setMeta)
      .catch((err) => setError(err.message));
  }, []);

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
      const data = await api.sendAiChat({
        message: text,
        history,
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
          <h1>CHAT NVIDIA</h1>
          <p className="muted">
            {user.email} ·{" "}
            {meta?.model || "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"}
          </p>
        </div>
        <div className="header-actions">
          <Link className="btn btn-secondary" to="/superadmin">
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
        <h2>Prueba Nemotron Omni (chat multimodal)</h2>
        <p className="muted card-hint">
          Endpoint: {meta?.baseUrl || "https://integrate.api.nvidia.com"}
          /v1/chat/completions — analiza texto/imagen/video;{" "}
          <strong>no genera MP4</strong>.
        </p>
        <p className="muted card-hint">
          Para Instagram/WhatsApp: <code>AI_PROVIDER=nvidia</code> (o{" "}
          <code>auto</code>) en Railway. Actual:{" "}
          <code>{meta?.aiProviderEnv || "gemini"}</code>
        </p>

        <div className="chat-thread">
          {history.length === 0 && (
            <p className="muted">Escribí un mensaje para probar el modelo.</p>
          )}
          {history.map((turn, idx) => (
            <div
              key={`${turn.role}-${idx}`}
              className={`chat-bubble chat-bubble--${turn.role}`}
            >
              <strong>{turn.role === "user" ? "Vos" : "Nemotron"}</strong>
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
            placeholder="Hola, ¿quién sos?"
            disabled={loading || (meta && !meta.configured)}
          />
          <button
            type="submit"
            className="btn"
            disabled={loading || !message.trim() || (meta && !meta.configured)}
          >
            {loading ? "Pensando..." : "Enviar"}
          </button>
          {history.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginLeft: "0.5rem" }}
              disabled={loading}
              onClick={() => setHistory([])}
            >
              Limpiar chat
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
