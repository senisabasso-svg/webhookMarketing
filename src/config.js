require("dotenv").config({ override: true });

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

function isConfigured(value) {
  if (!value) return false;
  return !value.startsWith("PENDIENTE") && value !== "copiala_vos_desde_el_panel";
}

const defaultSystemPrompt = require("./prompts/benjamin");

const DEFAULT_GEMINI_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-flash-latest",
];

function parseGeminiModels() {
  if (process.env.GEMINI_MODELS) {
    return process.env.GEMINI_MODELS.split(",")
      .map((m) => m.trim())
      .filter(Boolean);
  }

  const primary = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODELS[0];
  return [...new Set([primary, ...DEFAULT_GEMINI_MODELS])];
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL || "",
  databaseSsl: process.env.DATABASE_SSL === "true",
  jwtSecret: process.env.JWT_SECRET || "dev-secret-cambiar-en-produccion",
  superadminEmail: process.env.SUPERADMIN_EMAIL || "",
  superadminPassword: process.env.SUPERADMIN_PASSWORD || "",
  febrosClientTrackingUrl: process.env.FEBROS_CLIENT_TRACKING_URL || "",
  publicBaseUrl: (() => {
    if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
    }
    const port = Number(process.env.PORT) || 3000;
    return `http://localhost:${port}`;
  })(),
  geminiApiKey: required("GEMINI_API_KEY"),
  geminiModel: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODELS[0],
  geminiModels: parseGeminiModels(),
  geminiSystemPrompt: process.env.GEMINI_SYSTEM_PROMPT || defaultSystemPrompt,
  // gemini | kimi | auto (auto = Gemini y si falla, Kimi)
  aiProvider: (process.env.AI_PROVIDER || "gemini").toLowerCase(),

  verifyToken: process.env.VERIFY_TOKEN || "",
  whatsappVerifyToken:
    process.env.WHATSAPP_VERIFY_TOKEN || process.env.VERIFY_TOKEN || "",
  metaAccessToken: process.env.META_ACCESS_TOKEN || "",
  metaGraphVersion: process.env.META_GRAPH_VERSION || "v23.0",
  metaAppSecret: process.env.META_APP_SECRET || process.env.IG_APP_SECRET || "",
  igAccountId: process.env.IG_ACCOUNT_ID || "",
  igAppId: process.env.IG_APP_ID || "",
  igAppSecret: process.env.IG_APP_SECRET || "",
  whatsappToken: process.env.WHATSAPP_TOKEN || "",
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  whatsappGraphVersion: process.env.WHATSAPP_GRAPH_VERSION || "v21.0",
  // facebook = Page token | instagram = Instagram Business Login token
  metaApiHost: process.env.META_API_HOST || "facebook",

  nvidiaApiKey: process.env.NVIDIA_API_KEY || "",
  // GenAI video: https://ai.api.nvidia.com (NO integrate.api.nvidia.com)
  nvidiaBaseUrl: (
    process.env.NVIDIA_BASE_URL || "https://ai.api.nvidia.com"
  ).replace(/\/$/, ""),
  nvidiaVideoModel:
    process.env.NVIDIA_VIDEO_MODEL || "stabilityai/stable-video-diffusion",
  nvidiaVideoModelPath:
    process.env.NVIDIA_VIDEO_MODEL_PATH ||
    "/v1/genai/stabilityai/stable-video-diffusion",
  // UUID opcional si usás NVCF pexec directo
  nvidiaNvcfFunctionId: process.env.NVIDIA_NVCF_FUNCTION_ID || "",
  // Chat Kimi vía NVIDIA (integrate)
  nvidiaChatBaseUrl: (
    process.env.NVIDIA_CHAT_BASE_URL || "https://integrate.api.nvidia.com"
  ).replace(/\/$/, ""),
  nvidiaChatModel:
    process.env.NVIDIA_CHAT_MODEL ||
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",

  graphBaseUrl() {
    return this.metaApiHost === "instagram"
      ? "https://graph.instagram.com"
      : "https://graph.facebook.com";
  },

  isMetaTokenConfigured() {
    return isConfigured(this.metaAccessToken);
  },
  isIgAccountConfigured() {
    return isConfigured(this.igAccountId);
  },
  isWhatsAppConfigured() {
    return (
      isConfigured(this.whatsappToken) &&
      isConfigured(this.whatsappPhoneNumberId)
    );
  },
  isNvidiaConfigured() {
    return isConfigured(this.nvidiaApiKey);
  },
  messagesEndpointId() {
    if (this.metaApiHost === "instagram") return "me";
    return this.isIgAccountConfigured() ? this.igAccountId : "me";
  },
};
