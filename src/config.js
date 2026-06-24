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

module.exports = {
  port: Number(process.env.PORT) || 3000,
  geminiApiKey: required("GEMINI_API_KEY"),
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
  geminiModels: (
    process.env.GEMINI_MODELS ||
    process.env.GEMINI_MODEL ||
    "gemini-2.5-flash-lite,gemini-2.5-flash,gemini-flash-latest"
  )
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean),
  geminiSystemPrompt: process.env.GEMINI_SYSTEM_PROMPT || defaultSystemPrompt,

  verifyToken: process.env.VERIFY_TOKEN || "",
  metaAccessToken: process.env.META_ACCESS_TOKEN || "",
  metaGraphVersion: process.env.META_GRAPH_VERSION || "v23.0",
  igAccountId: process.env.IG_ACCOUNT_ID || "",
  igAppId: process.env.IG_APP_ID || "",
  igAppSecret: process.env.IG_APP_SECRET || "",
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
  messagesEndpointId() {
    if (this.metaApiHost === "instagram") return "me";
    return this.isIgAccountConfigured() ? this.igAccountId : "me";
  },
};
