const INSTAGRAM_FIELDS = [
  { key: "verifyToken", label: "Verify Token (webhook)", type: "password", required: true },
  { key: "metaAccessToken", label: "Meta Access Token", type: "password", required: true },
  { key: "metaGraphVersion", label: "Graph API Version", type: "text", default: "v25.0" },
  { key: "metaApiHost", label: "API Host (instagram | facebook)", type: "text", default: "instagram" },
  { key: "igAccountId", label: "IG Account ID (id emisor)", type: "text", required: true },
  { key: "igAppId", label: "App ID", type: "text" },
  { key: "igAppSecret", label: "App Secret", type: "password" },
  { key: "metaAppSecret", label: "Meta App Secret (firma webhook)", type: "password" },
  { key: "geminiApiKey", label: "Gemini API Key", type: "password", required: true },
  { key: "geminiModel", label: "Modelo Gemini", type: "text", default: "gemini-2.5-flash-lite" },
  { key: "geminiModels", label: "Modelos fallback (coma)", type: "text", default: "gemini-2.5-flash-lite,gemini-2.5-flash,gemini-flash-latest" },
  { key: "geminiSystemPrompt", label: "System Prompt IA", type: "textarea" },
];

const WHATSAPP_FIELDS = [
  { key: "whatsappVerifyToken", label: "Verify Token (webhook)", type: "password" },
  { key: "whatsappToken", label: "WhatsApp Access Token", type: "password", required: true },
  { key: "whatsappPhoneNumberId", label: "Phone Number ID (id emisor)", type: "text", required: true },
  { key: "whatsappGraphVersion", label: "Graph API Version", type: "text", default: "v21.0" },
  { key: "metaAppSecret", label: "Meta App Secret (firma webhook)", type: "password" },
  { key: "geminiApiKey", label: "Gemini API Key", type: "password", required: true },
  { key: "geminiModel", label: "Modelo Gemini", type: "text", default: "gemini-2.5-flash-lite" },
  { key: "geminiModels", label: "Modelos fallback (coma)", type: "text", default: "gemini-2.5-flash-lite,gemini-2.5-flash,gemini-flash-latest" },
  { key: "geminiSystemPrompt", label: "System Prompt IA", type: "textarea" },
];

const INTEGRATION_TYPES = {
  instagram: { label: "Instagram IA", fields: INSTAGRAM_FIELDS },
  whatsapp: { label: "WhatsApp IA", fields: WHATSAPP_FIELDS },
};

const EMITTER_FIELD = {
  instagram: "igAccountId",
  whatsapp: "whatsappPhoneNumberId",
};

function getFieldsForType(type) {
  return INTEGRATION_TYPES[type]?.fields ?? [];
}

function getEmitterFromConfig(type, config) {
  const field = EMITTER_FIELD[type];
  return field && config?.[field] ? String(config[field]) : null;
}

module.exports = {
  INSTAGRAM_FIELDS,
  WHATSAPP_FIELDS,
  INTEGRATION_TYPES,
  EMITTER_FIELD,
  getFieldsForType,
  getEmitterFromConfig,
};
