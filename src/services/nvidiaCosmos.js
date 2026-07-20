const fs = require("fs");
const path = require("path");
const config = require("../config");

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads", "videos");
const GENERATION_TIMEOUT_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 2500;
const HISTORY_LIMIT = 20;

function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function getUploadDir() {
  return UPLOAD_DIR;
}

function bufferToDataUri(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getInvokeUrl() {
  // Preferí function ID NVCF si está configurado
  if (config.nvidiaNvcfFunctionId) {
    return `https://api.nvcf.nvidia.com/v2/nvcf/pexec/functions/${config.nvidiaNvcfFunctionId}`;
  }
  // Endpoint GenAI oficial de SVD (image→video)
  const modelPath =
    config.nvidiaVideoModelPath ||
    "/v1/genai/stabilityai/stable-video-diffusion";
  return `${config.nvidiaBaseUrl}${modelPath}`;
}

async function nvidiaFetch(url, { method = "POST", body = null, signal } = {}) {
  const headers = {
    Authorization: `Bearer ${config.nvidiaApiKey}`,
    Accept: "application/json",
  };
  if (body != null) headers["Content-Type"] = "application/json";

  return fetch(url, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
    signal,
  });
}

async function pollNvcf(requestId, signal) {
  const statusUrl = `https://api.nvcf.nvidia.com/v2/nvcf/pexec/status/${requestId}`;
  const started = Date.now();

  while (Date.now() - started < GENERATION_TIMEOUT_MS) {
    if (signal?.aborted) throw new Error("Generación cancelada");

    const res = await nvidiaFetch(statusUrl, { method: "GET", signal });
    if (res.status === 202) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { message: text.slice(0, 300) };
    }

    if (!res.ok) {
      const err = new Error(
        data?.detail || data?.title || data?.message || `Error NVIDIA ${res.status}`
      );
      err.status = res.status;
      err.nvidiaError = data;
      throw err;
    }

    return data;
  }

  throw new Error("La generación de video tardó demasiado (timeout 10 min)");
}

function mapNvidiaError(response, data) {
  if (
    response.status === 404 &&
    String(data?.detail || "").includes("Not found for account")
  ) {
    return new Error(
      "Tu cuenta NVIDIA no tiene habilitado Stable Video Diffusion. " +
        "Entrá a https://build.nvidia.com/stabilityai/stable-video-diffusion , " +
        "aceptá los términos y asociá la API key. Después redeploy en Railway."
    );
  }

  if (response.status === 404) {
    return new Error(
      "Endpoint NVIDIA no disponible (404). " +
        "Usá NVIDIA_BASE_URL=https://ai.api.nvidia.com " +
        "o configurá NVIDIA_NVCF_FUNCTION_ID con el UUID del modelo."
    );
  }

  return new Error(
    data?.detail ||
      data?.error?.message ||
      data?.message ||
      data?.title ||
      (typeof data?.error === "string" ? data.error : null) ||
      `Error NVIDIA ${response.status}`
  );
}

async function invokeNvidia(payload) {
  const url = getInvokeUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

  try {
    const response = await nvidiaFetch(url, {
      method: "POST",
      body: payload,
      signal: controller.signal,
    });

    if (response.status === 202) {
      const reqId = response.headers.get("nvcf-reqid");
      if (!reqId) {
        throw new Error("NVIDIA devolvió 202 sin NVCF-REQID");
      }
      return pollNvcf(reqId, controller.signal);
    }

    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { message: text.slice(0, 300) };
    }

    if (!response.ok) {
      const err = mapNvidiaError(response, data);
      err.status = response.status;
      err.nvidiaError = data;
      throw err;
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("La generación de video tardó demasiado (timeout 10 min)");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function saveVideoFromBase64(videoB64, meta = {}) {
  ensureUploadDir();
  const filename = `svd-${Date.now()}.mp4`;
  const filePath = path.join(UPLOAD_DIR, filename);
  const cleanB64 = String(videoB64).replace(/^data:video\/\w+;base64,/, "");
  fs.writeFileSync(filePath, Buffer.from(cleanB64, "base64"));

  const metaPath = path.join(UPLOAD_DIR, `${filename}.json`);
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        filename,
        createdAt: new Date().toISOString(),
        model: meta.model || config.nvidiaVideoModel,
        seed: meta.seed ?? null,
        cfgScale: meta.cfgScale ?? null,
      },
      null,
      2
    )
  );

  return {
    filename,
    videoUrl: `/files/videos/${encodeURIComponent(filename)}`,
  };
}

function listHistory(limit = HISTORY_LIMIT) {
  ensureUploadDir();
  const files = fs
    .readdirSync(UPLOAD_DIR)
    .filter((f) => f.endsWith(".mp4"))
    .map((filename) => {
      const full = path.join(UPLOAD_DIR, filename);
      const stat = fs.statSync(full);
      let meta = {};
      const metaFile = path.join(UPLOAD_DIR, `${filename}.json`);
      if (fs.existsSync(metaFile)) {
        try {
          meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
        } catch {
          meta = {};
        }
      }
      return {
        filename,
        videoUrl: `/files/videos/${encodeURIComponent(filename)}`,
        createdAt: meta.createdAt || stat.mtime.toISOString(),
        model: meta.model || config.nvidiaVideoModel,
        seed: meta.seed ?? null,
        cfgScale: meta.cfgScale ?? null,
        sizeBytes: stat.size,
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);

  return files;
}

async function generateVideo({
  imageDataUri,
  seed = null,
  cfgScale = 1.8,
} = {}) {
  if (!config.isNvidiaConfigured()) {
    throw new Error("NVIDIA_API_KEY no configurada en el .env / Railway");
  }
  if (!imageDataUri) {
    throw new Error("Stable Video Diffusion requiere una imagen (JPG/PNG)");
  }

  const payload = {
    image: imageDataUri,
    // API NVIDIA: cfg_scale entre >1 y 9
    cfg_scale: Math.min(9, Math.max(1.01, Number(cfgScale) || 1.8)),
    seed:
      seed !== null && seed !== undefined && String(seed).trim() !== ""
        ? Number(seed)
        : 0,
    // Único valor soportado por el NIM hosted
    motion_bucket_id: 127,
  };

  const data = await invokeNvidia(payload);
  const videoB64 = data.video || data.b64_video || data?.data?.[0]?.b64_json;
  if (!videoB64) {
    throw new Error("NVIDIA no devolvió el campo video en la respuesta");
  }

  if (data.finish_reason && data.finish_reason !== "SUCCESS") {
    throw new Error(`NVIDIA finalizó con: ${data.finish_reason}`);
  }

  const saved = saveVideoFromBase64(videoB64, {
    model: config.nvidiaVideoModel,
    seed: data.seed ?? payload.seed,
    cfgScale: payload.cfg_scale,
  });

  return {
    ...saved,
    model: config.nvidiaVideoModel,
    provider: "svd",
    seed: data.seed ?? payload.seed,
    cfgScale: payload.cfg_scale,
    invokeUrl: getInvokeUrl(),
  };
}

function getMeta() {
  return {
    configured: config.isNvidiaConfigured(),
    model: config.nvidiaVideoModel,
    invokeUrl: config.isNvidiaConfigured() ? getInvokeUrl() : null,
    baseUrl: config.nvidiaBaseUrl,
    hasFunctionId: Boolean(config.nvidiaNvcfFunctionId),
    limits: {
      maxImageBytes: 190 * 1024,
      cfgScale: { min: 1.01, max: 9, default: 1.8 },
      // La API cloud de NVIDIA fija estos valores (no son configurables)
      fixedFrames: 25,
      fixedResolution: "1024x576",
      motionBucketId: 127,
    },
    note:
      "Image→video. La API cloud de NVIDIA fija ~25 frames a 1024x576. " +
      "cfg_scale controla fidelidad a la imagen; seed reproduce el resultado.",
  };
}

module.exports = {
  generateVideo,
  ensureUploadDir,
  getUploadDir,
  bufferToDataUri,
  listHistory,
  getMeta,
  getInvokeUrl,
};
