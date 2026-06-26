import { useEffect, useRef, useState } from "react";
import { api } from "../api";

export default function Login({ onLogin }) {
  const videoRef = useRef(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    video.loop = true;
    video.playsInline = true;

    const play = () => {
      video.play().catch(() => {});
    };

    play();
    video.addEventListener("ended", play);
    return () => video.removeEventListener("ended", play);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await api.login(email, password);
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="card login-card">
        <video
          ref={videoRef}
          className="login-video"
          src="/assets/login-video.mp4"
          autoPlay
          muted
          loop
          playsInline
          aria-label="Febros Software Development"
        />
        <h2 className="login-title">webhooks febros - 2026 -</h2>
        <p className="login-subtitle">Panel de administración</p>
        <p className="login-trademark">
          Marca registrada oficialmente por Febros Software Development,
          Uruguay. <strong>febros s.a.</strong>
        </p>

        {error && <div className="error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />

          <label>Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
