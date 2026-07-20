const fs = require("fs");
const path = require("path");
const config = require("../config");

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads", "videos");
const GENERATION_TIMEOUT_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 2500;

const PROVIDERS = {
  svd: {
    id: "svd",
    label: "Stable Video Diffusion (image → video)",
    endpoint: "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-video-diffusion",
    requiresImage: true,
    supportsPrompt: false,
  },
  cosmos3: {
    id: "cosmos3",
    label: "Cosmos 3 Nano (aún no disponible en cloud)",
    endpoint: null,
    requiresImage: false,
    supportsPrompt: true,
  },
};

function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function getUploadDir() {
  return UPLOAD_DIR;
}

function bufferToDataUri(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function listProviders() {
  return Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    label: p.label,
    requiresImage: p.requiresImage,
    supportsPrompt: p.supportsPrompt,
  }));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function invokeNvidia(url, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

  try {
    let response = await nvidiaFetch(url, {
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
      if (
        response.status === 404 &&
        String(data?.detail || "").includes("Not found for account")
      ) {
        const err = new Error(
          "Tu cuenta NVIDIA no tiene habilitado Stable Video Diffusion. " +
            "Entrá a https://build.nvidia.com/stabilityai/stable-video-diffusion , " +
            "aceptá los términos y generá/vinculá la API key a ese modelo. " +
            "Después reiniciá y volvé a probar."
        );
        err.status = 404;
        err.nvidiaError = data;
        throw err;
      }

      if (response.status === 404) {
        const err = new Error(
          "Endpoint NVIDIA no disponible (404). El modelo cloud puede no estar publicado para cuentas free."
        );
        err.status = 404;
        err.nvidiaError = data;
        throw err;
      }

      const message =
        data?.detail ||
        data?.error?.message ||
        data?.message ||
        data?.title ||
        (typeof data?.error === "string" ? data.error : null) ||
        `Error NVIDIA ${response.status}`;
      const err = new Error(message);
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

function saveVideoFromBase64(videoB64) {
  ensureUploadDir();
  const filename = `nvidia-${Date.now()}.mp4`;
  const filePath = path.join(UPLOAD_DIR, filename);
  const cleanB64 = String(videoB64).replace(/^data:video\/\w+;base64,/, "");
  fs.writeFileSync(filePath, Buffer.from(cleanB64, "base64"));
  return {
    filename,
    videoUrl: `/files/videos/${encodeURIComponent(filename)}`,
  };
}

async function generateWithSvd({ imageDataUri, seed = null, cfgScale = 1.8 }) {
  if (!imageDataUri) {
    throw new Error("Stable Video Diffusion requiere una imagen");
  }

  const payload = {
    image: imageDataUri,
    cfg_scale: Math.min(9, Math.max(1.01, Number(cfgScale) || 1.8)),
    seed:
      seed !== null && seed !== undefined && String(seed).trim() !== ""
        ? Number(seed)
        : 0,
  };

  const data = await invokeNvidia(PROVIDERS.svd.endpoint, payload);
  const videoB64 = data.video || data.b64_video || data?.data?.[0]?.b64_json;
  if (!videoB64) {
    throw new Error("NVIDIA no devolvió el campo video en la respuesta");
  }

  if (data.finish_reason && data.finish_reason !== "SUCCESS") {
    throw new Error(`NVIDIA finalizó con: ${data.finish_reason}`);
  }

  const saved = saveVideoFromBase64(videoB64);
  return {
    ...saved,
    model: "stabilityai/stable-video-diffusion",
    provider: "svd",
    seed: data.seed ?? payload.seed,
  };
}

async function generateWithCosmos3() {
  throw new Error(
    "Cosmos 3 Nano todavía no tiene endpoint cloud público (404). " +
      "Usá Stable Video Diffusion o esperá a que NVIDIA lo habilite."
  );
}

async function generateVideo(options = {}) {
  if (!config.isNvidiaConfigured()) {
    throw new Error("NVIDIA_API_KEY no configurada en el .env");
  }

  const provider = options.provider || "svd";

  if (provider === "cosmos3") {
    return generateWithCosmos3(options);
  }

  return generateWithSvd(options);
}

module.exports = {
  generateVideo,
  ensureUploadDir,
  getUploadDir,
  bufferToDataUri,
  listProviders,
  PROVIDERS,
};
