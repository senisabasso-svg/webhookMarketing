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
  geminiApiKey: required("GEMINI_API_KEY"),
  geminiModel: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODELS[0],
  geminiModels: parseGeminiModels(),
  geminiSystemPrompt: process.env.GEMINI_SYSTEM_PROMPT || defaultSystemPrompt,

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
  messagesEndpointId() {
    if (this.metaApiHost === "instagram") return "me";
    return this.isIgAccountConfigured() ? this.igAccountId : "me";
  },
};
