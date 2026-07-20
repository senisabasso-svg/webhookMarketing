const fs = require("fs");
const path = require("path");
const config = require("../config");

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads", "videos");
const GENERATION_TIMEOUT_MS = 10 * 60 * 1000;

function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function getUploadDir() {
  return UPLOAD_DIR;
}

function bufferToDataUri(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function generateVideo({
  prompt,
  imageDataUri = null,
  resolution = "720_16_9",
  numOutputFrames = 120,
  seed = null,
  negativePrompt = "",
} = {}) {
  if (!config.isNvidiaConfigured()) {
    throw new Error("NVIDIA_API_KEY no configurada en el .env");
  }

  const trimmedPrompt = String(prompt || "").trim();
  if (!trimmedPrompt) {
    throw new Error("El prompt es requerido");
  }

  const frames = Math.min(
    189,
    Math.max(1, Number(numOutputFrames) || 120)
  );
  const allowedResolutions = new Set(["720_16_9", "1080_16_9"]);
  const res = allowedResolutions.has(resolution) ? resolution : "720_16_9";

  const payload = {
    model: config.nvidiaVideoModel,
    prompt: trimmedPrompt,
    resolution: res,
    num_output_frames: frames,
  };

  if (seed !== null && seed !== undefined && String(seed).trim() !== "") {
    payload.seed = Number(seed);
  }

  if (imageDataUri) {
    payload.image = imageDataUri;
  }

  if (negativePrompt?.trim()) {
    payload.negative_prompt = negativePrompt.trim();
  }

  const url = `${config.nvidiaBaseUrl}/v1/images/generations`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.nvidiaApiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        "La generación de video tardó demasiado (timeout 10 min)"
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.detail ||
      data?.error?.message ||
      data?.message ||
      (typeof data?.error === "string" ? data.error : null) ||
      `Error NVIDIA ${response.status}`;
    const err = new Error(message);
    err.nvidiaError = data;
    err.status = response.status;
    throw err;
  }

  const videoB64 = data.b64_video || data.video || data?.data?.[0]?.b64_json;
  if (!videoB64) {
    throw new Error(
      "NVIDIA no devolvió b64_video. Revisá el modelo o la respuesta del endpoint."
    );
  }

  ensureUploadDir();
  const filename = `cosmos-${Date.now()}.mp4`;
  const filePath = path.join(UPLOAD_DIR, filename);
  const cleanB64 = String(videoB64).replace(/^data:video\/\w+;base64,/, "");
  fs.writeFileSync(filePath, Buffer.from(cleanB64, "base64"));

  return {
    filename,
    videoUrl: `/files/videos/${encodeURIComponent(filename)}`,
    resolution: res,
    numOutputFrames: frames,
    model: config.nvidiaVideoModel,
  };
}

module.exports = {
  generateVideo,
  ensureUploadDir,
  getUploadDir,
  bufferToDataUri,
};
