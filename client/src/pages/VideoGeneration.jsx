import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function VideoGeneration({ user, onLogout }) {
  const [meta, setMeta] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [resolution, setResolution] = useState("720_16_9");
  const [numOutputFrames, setNumOutputFrames] = useState(120);
  const [seed, setSeed] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    api
      .getVideoGenerationMeta()
      .then(setMeta)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview("");
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setResult(null);

    if (!prompt.trim()) {
      setError("Escribí un prompt para generar el video.");
      return;
    }

    setLoading(true);
    try {
      const data = await api.generateVideo({
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim(),
        resolution,
        numOutputFrames,
        seed: seed === "" ? undefined : seed,
        imageFile,
      });
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="layout">
      <header className="header">
        <div>
          <h1>GENERACIÓN VIDEO</h1>
          <p className="muted">{user.email} · NVIDIA Cosmos</p>
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
          Falta <code>NVIDIA_API_KEY</code> en el .env. Agregala y reiniciá el
          servidor local.
        </div>
      )}

      <div className="card">
        <h2>NVIDIA Cosmos 3 Nano</h2>
        <p className="muted card-hint">
          Prompt obligatorio. Imagen opcional (image-to-video). La generación
          puede tardar varios minutos.
        </p>
        {meta && (
          <p className="muted card-hint">
            Modelo: {meta.model} · Endpoint: {meta.baseUrl}/v1/images/generations
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <label htmlFor="prompt">Prompt</label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A robot moves through a clean industrial warehouse."
            required
            disabled={loading}
          />

          <label htmlFor="image">Imagen (opcional)</label>
          <input
            id="image"
            type="file"
            accept="image/*"
            disabled={loading}
            onChange={(e) => setImageFile(e.target.files?.[0] || null)}
          />
          {imagePreview && (
            <div className="video-preview-wrap">
              <img
                src={imagePreview}
                alt="Vista previa"
                className="video-source-preview"
              />
            </div>
          )}

          <div className="grid-2">
            <div>
              <label htmlFor="resolution">Resolución</label>
              <select
                id="resolution"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                disabled={loading}
              >
                <option value="720_16_9">720p 16:9</option>
                <option value="1080_16_9">1080p 16:9</option>
              </select>
            </div>
            <div>
              <label htmlFor="frames">Frames (1–189)</label>
              <input
                id="frames"
                type="number"
                min={1}
                max={189}
                value={numOutputFrames}
                onChange={(e) => setNumOutputFrames(Number(e.target.value))}
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid-2">
            <div>
              <label htmlFor="seed">Seed (opcional)</label>
              <input
                id="seed"
                type="number"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="42"
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="negative">Negative prompt (opcional)</label>
              <input
                id="negative"
                type="text"
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="blurry, low quality..."
                disabled={loading}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn"
            disabled={loading || (meta && !meta.configured)}
          >
            {loading ? "Generando video..." : "Generar video"}
          </button>
          {loading && (
            <p className="muted card-hint" style={{ marginTop: "0.75rem" }}>
              Esperá… Cosmos puede demorar varios minutos. No cierres esta
              pestaña.
            </p>
          )}
        </form>
      </div>

      {result?.videoUrl && (
        <div className="card">
          <h2>Video generado</h2>
          <p className="muted card-hint">
            {result.resolution} · {result.numOutputFrames} frames · {result.model}
          </p>
          <video
            className="generated-video"
            src={result.videoUrl}
            controls
            playsInline
          />
          <div className="header-actions" style={{ marginTop: "1rem" }}>
            <a
              className="btn btn-secondary"
              href={result.videoUrl}
              download={result.filename || "cosmos-video.mp4"}
            >
              Descargar MP4
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
