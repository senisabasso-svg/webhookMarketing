import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

const LOCAL_HISTORY_KEY = "febros_svd_history";

function loadLocalHistory() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLocalHistory(items) {
  localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(items.slice(0, 12)));
}

export default function VideoGeneration({ user, onLogout }) {
  const [meta, setMeta] = useState(null);
  const [cfgScale, setCfgScale] = useState(1.8);
  const [seed, setSeed] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const progressTimer = useRef(null);

  async function refreshHistory() {
    try {
      const data = await api.getVideoHistory();
      setHistory(data.history || []);
    } catch {
      setHistory(loadLocalHistory());
    }
  }

  useEffect(() => {
    api
      .getVideoGenerationMeta()
      .then(setMeta)
      .catch((err) => setError(err.message));
    refreshHistory();
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

  useEffect(() => {
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, []);

  function startProgress() {
    setProgress(8);
    if (progressTimer.current) clearInterval(progressTimer.current);
    progressTimer.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 92) return p;
        return p + Math.max(1, Math.round((92 - p) * 0.04));
      });
    }, 1200);
  }

  function stopProgress(ok) {
    if (progressTimer.current) clearInterval(progressTimer.current);
    setProgress(ok ? 100 : 0);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setResult(null);

    if (!imageFile) {
      setError("Subí una imagen JPG/PNG. Este modelo es image → video.");
      return;
    }
    if (imageFile.size > 190 * 1024) {
      setError("La imagen debe pesar menos de ~190KB (requisito de NVIDIA).");
      return;
    }
    if (cfgScale < 1.01 || cfgScale > 9) {
      setError("cfg_scale debe estar entre 1.01 y 9.");
      return;
    }

    setLoading(true);
    startProgress();
    try {
      const data = await api.generateVideo({
        cfgScale,
        seed: seed === "" ? undefined : seed,
        imageFile,
      });
      setResult(data);
      stopProgress(true);

      const localItem = {
        ...data,
        createdAt: new Date().toISOString(),
      };
      const nextLocal = [localItem, ...loadLocalHistory()].slice(0, 12);
      saveLocalHistory(nextLocal);
      await refreshHistory();
    } catch (err) {
      stopProgress(false);
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
          <p className="muted">{user.email} · Stable Video Diffusion</p>
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
        <h2>Stable Video Diffusion — Image → Video</h2>
        <p className="muted card-hint">
          {meta?.note ||
            "Subí una imagen y generá un MP4 corto animado con NVIDIA NIM."}
        </p>
        {meta?.invokeUrl && (
          <p className="muted card-hint">
            Endpoint: <code>{meta.invokeUrl}</code>
          </p>
        )}
        <p className="muted card-hint">
          API cloud fija ~{meta?.limits?.fixedFrames || 25} frames a{" "}
          {meta?.limits?.fixedResolution || "1024x576"} (no configurable).
        </p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="image">Imagen (obligatoria)</label>
          <input
            id="image"
            type="file"
            accept="image/png,image/jpeg,image/jpg"
            disabled={loading}
            onChange={(e) => setImageFile(e.target.files?.[0] || null)}
          />
          <p className="muted card-hint">Máx. ~190KB · JPG/PNG</p>
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
              <label htmlFor="cfg">Fidelidad / cfg_scale (1.01–9)</label>
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
              <p className="muted card-hint">
                Más alto = se parece más a la imagen original.
              </p>
            </div>
            <div>
              <label htmlFor="seed">Seed (reproducibilidad)</label>
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

          <div className="grid-2">
            <div>
              <label>Frames (fijo API)</label>
              <input
                type="text"
                value={`${meta?.limits?.fixedFrames || 25} (no editable)`}
                disabled
              />
            </div>
            <div>
              <label>Resolución (fija API)</label>
              <input
                type="text"
                value={`${meta?.limits?.fixedResolution || "1024x576"} (no editable)`}
                disabled
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
            <div className="progress-wrap">
              <div className="progress-bar" style={{ width: `${progress}%` }} />
              <p className="muted card-hint">
                Generando… {progress}% · puede tardar 1–3 min. No cierres la
                pestaña.
              </p>
            </div>
          )}
        </form>
      </div>

      {result?.videoUrl && (
        <div className="card">
          <h2>Video generado</h2>
          <p className="muted card-hint">
            {result.model}
            {result.seed != null ? ` · seed ${result.seed}` : ""}
            {result.cfgScale != null ? ` · cfg ${result.cfgScale}` : ""}
          </p>
          <video
            className="generated-video"
            src={result.videoUrl}
            controls
            playsInline
            autoPlay
          />
          <div className="header-actions" style={{ marginTop: "1rem" }}>
            <a
              className="btn btn-secondary"
              href={result.videoUrl}
              download={result.filename || "svd-video.mp4"}
            >
              Descargar MP4
            </a>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Historial reciente</h2>
        {history.length === 0 ? (
          <p className="muted">Todavía no hay generaciones guardadas.</p>
        ) : (
          <div className="video-history">
            {history.map((item) => (
              <div key={item.filename || item.videoUrl} className="video-history-item">
                <video src={item.videoUrl} muted playsInline preload="metadata" />
                <div>
                  <p className="muted">
                    {item.createdAt
                      ? new Date(item.createdAt).toLocaleString()
                      : "—"}
                  </p>
                  <p className="muted">
                    {item.model || "SVD"}
                    {item.seed != null ? ` · seed ${item.seed}` : ""}
                  </p>
                  <div className="header-actions">
                    <a className="btn btn-secondary" href={item.videoUrl} target="_blank" rel="noreferrer">
                      Ver
                    </a>
                    <a
                      className="btn btn-secondary"
                      href={item.videoUrl}
                      download={item.filename || "video.mp4"}
                    >
                      Descargar
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
