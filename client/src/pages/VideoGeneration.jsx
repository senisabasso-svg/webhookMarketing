import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function VideoGeneration({ user, onLogout }) {
  const [meta, setMeta] = useState(null);
  const [provider, setProvider] = useState("svd");
  const [prompt, setPrompt] = useState("");
  const [cfgScale, setCfgScale] = useState(1.8);
  const [seed, setSeed] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    api
      .getVideoGenerationMeta()
      .then((data) => {
        setMeta(data);
        if (data.defaultProvider) setProvider(data.defaultProvider);
      })
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

  const selected = meta?.providers?.find((p) => p.id === provider);
  const needsImage = selected?.requiresImage ?? true;
  const needsPrompt = selected?.supportsPrompt ?? false;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setResult(null);

    if (needsImage && !imageFile) {
      setError("Subí una imagen. Este modelo es image → video.");
      return;
    }
    if (needsPrompt && !prompt.trim()) {
      setError("Escribí un prompt.");
      return;
    }
    if (imageFile && imageFile.size > 190 * 1024) {
      setError("La imagen debe pesar menos de ~190KB (requisito de NVIDIA).");
      return;
    }

    setLoading(true);
    try {
      const data = await api.generateVideo({
        provider,
        prompt: prompt.trim(),
        cfgScale,
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
          <p className="muted">{user.email} · NVIDIA (gratis)</p>
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
        <h2>NVIDIA — video gratis</h2>
        <p className="muted card-hint">
          Cosmos 3 Nano todavía no tiene API cloud pública. Por defecto usamos{" "}
          <strong>Stable Video Diffusion</strong> (image → video), también gratis
          en NVIDIA.
        </p>
        <p className="muted card-hint">
          Si te dice que el modelo no está habilitado para tu cuenta, abrí{" "}
          <a
            href="https://build.nvidia.com/stabilityai/stable-video-diffusion"
            target="_blank"
            rel="noopener noreferrer"
          >
            esta página
          </a>
          , aceptá términos / Get API Key, y reintentá.
        </p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="provider">Modelo</label>
          <select
            id="provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            disabled={loading}
          >
            {(meta?.providers || [{ id: "svd", label: "Stable Video Diffusion" }]).map(
              (p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              )
            )}
          </select>

          <label htmlFor="image">
            Imagen {needsImage ? "(obligatoria)" : "(opcional)"}
          </label>
          <input
            id="image"
            type="file"
            accept="image/png,image/jpeg,image/jpg"
            disabled={loading}
            onChange={(e) => setImageFile(e.target.files?.[0] || null)}
          />
          <p className="muted card-hint">Máx. ~190KB · jpg/png</p>
          {imagePreview && (
            <div className="video-preview-wrap">
              <img
                src={imagePreview}
                alt="Vista previa"
                className="video-source-preview"
              />
            </div>
          )}

          {needsPrompt && (
            <>
              <label htmlFor="prompt">Prompt</label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe el video..."
                disabled={loading}
              />
            </>
          )}

          {!needsPrompt && (
            <p className="muted card-hint">
              SVD anima la imagen que subís (no usa prompt de texto).
            </p>
          )}

          <div className="grid-2">
            <div>
              <label htmlFor="cfg">cfg_scale (1.01–9)</label>
              <input
                id="cfg"
                type="number"
                min={1.01}
                max={9}
                step={0.1}
                value={cfgScale}
                onChange={(e) => setCfgScale(Number(e.target.value))}
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="seed">Seed (opcional)</label>
              <input
                id="seed"
                type="number"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="0 = random"
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
              Puede demorar 1–3 minutos. No cierres la pestaña.
            </p>
          )}
        </form>
      </div>

      {result?.videoUrl && (
        <div className="card">
          <h2>Video generado</h2>
          <p className="muted card-hint">
            {result.model}
            {result.seed != null ? ` · seed ${result.seed}` : ""}
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
              download={result.filename || "nvidia-video.mp4"}
            >
              Descargar MP4
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
