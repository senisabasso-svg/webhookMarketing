const defaultSystemPrompt = require("../prompts/benjamin");
const globalConfig = require("../config");

function isConfigured(value) {
  if (!value) return false;
  return !value.startsWith("PENDIENTE") && value !== "copiala_vos_desde_el_panel";
}

function parseModels(modelsStr, fallbackModel) {
  const primary = fallbackModel || globalConfig.geminiModel;
  if (modelsStr) {
    return modelsStr
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
  }
  return [...new Set([primary, ...globalConfig.geminiModels])];
}

function buildTenantConfig({ companyId, companyName, source, type, config = {} }) {
  const c = config;

  const geminiModel = c.geminiModel || globalConfig.geminiModel;
  const geminiModels = parseModels(c.geminiModels, geminiModel);

  const tenant = {
    companyId: companyId || "legacy",
    companyName: companyName || "Legacy",
    source: source || "env",
    integrationType: type,
    geminiApiKey: c.geminiApiKey || globalConfig.geminiApiKey,
    geminiModel,
    geminiModels,
    geminiSystemPrompt: c.geminiSystemPrompt || globalConfig.geminiSystemPrompt || defaultSystemPrompt,
    aiProvider: c.aiProvider || globalConfig.aiProvider || "gemini",
    nvidiaApiKey: c.nvidiaApiKey || globalConfig.nvidiaApiKey || "",
    nvidiaChatBaseUrl: c.nvidiaChatBaseUrl || globalConfig.nvidiaChatBaseUrl || "",
    nvidiaChatModel: c.nvidiaChatModel || globalConfig.nvidiaChatModel || "",
    verifyToken: c.verifyToken || globalConfig.verifyToken || "",
    whatsappVerifyToken:
      c.whatsappVerifyToken || c.verifyToken || globalConfig.whatsappVerifyToken || "",
    metaAccessToken: c.metaAccessToken || globalConfig.metaAccessToken || "",
    metaGraphVersion: c.metaGraphVersion || globalConfig.metaGraphVersion || "v23.0",
    metaAppSecret: c.metaAppSecret || c.igAppSecret || globalConfig.metaAppSecret || "",
    igAccountId: c.igAccountId || globalConfig.igAccountId || "",
    igAppId: c.igAppId || globalConfig.igAppId || "",
    igAppSecret: c.igAppSecret || globalConfig.igAppSecret || "",
    whatsappToken: c.whatsappToken || globalConfig.whatsappToken || "",
    whatsappPhoneNumberId: c.whatsappPhoneNumberId || globalConfig.whatsappPhoneNumberId || "",
    whatsappGraphVersion: c.whatsappGraphVersion || globalConfig.whatsappGraphVersion || "v21.0",
    metaApiHost: c.metaApiHost || globalConfig.metaApiHost || "instagram",
  };

  tenant.graphBaseUrl = function graphBaseUrl() {
    return this.metaApiHost === "instagram"
      ? "https://graph.instagram.com"
      : "https://graph.facebook.com";
  };

  tenant.isMetaTokenConfigured = function isMetaTokenConfigured() {
    return isConfigured(this.metaAccessToken);
  };

  tenant.isIgAccountConfigured = function isIgAccountConfigured() {
    return isConfigured(this.igAccountId);
  };

  tenant.isWhatsAppConfigured = function isWhatsAppConfigured() {
    return (
      isConfigured(this.whatsappToken) && isConfigured(this.whatsappPhoneNumberId)
    );
  };

  tenant.messagesEndpointId = function messagesEndpointId() {
    if (this.metaApiHost === "instagram") return "me";
    return this.isIgAccountConfigured() ? this.igAccountId : "me";
  };

  return tenant;
}

function getLegacyInstagramConfig() {
  return buildTenantConfig({
    companyId: "legacy",
    companyName: "Empresa (.env)",
    source: "env",
    type: "instagram",
    config: {
      geminiApiKey: globalConfig.geminiApiKey,
      geminiModel: globalConfig.geminiModel,
      geminiModels: globalConfig.geminiModels.join(","),
      geminiSystemPrompt: globalConfig.geminiSystemPrompt,
      aiProvider: globalConfig.aiProvider,
      nvidiaApiKey: globalConfig.nvidiaApiKey,
      nvidiaChatBaseUrl: globalConfig.nvidiaChatBaseUrl,
      nvidiaChatModel: globalConfig.nvidiaChatModel,
      verifyToken: globalConfig.verifyToken,
      metaAccessToken: globalConfig.metaAccessToken,
      metaGraphVersion: globalConfig.metaGraphVersion,
      metaApiHost: globalConfig.metaApiHost,
      igAccountId: globalConfig.igAccountId,
      igAppId: globalConfig.igAppId,
      igAppSecret: globalConfig.igAppSecret,
      metaAppSecret: globalConfig.metaAppSecret,
    },
  });
}

function getLegacyWhatsAppConfig() {
  return buildTenantConfig({
    companyId: "legacy",
    companyName: "Empresa (.env)",
    source: "env",
    type: "whatsapp",
    config: {
      geminiApiKey: globalConfig.geminiApiKey,
      geminiModel: globalConfig.geminiModel,
      geminiModels: globalConfig.geminiModels.join(","),
      geminiSystemPrompt: globalConfig.geminiSystemPrompt,
      aiProvider: globalConfig.aiProvider,
      nvidiaApiKey: globalConfig.nvidiaApiKey,
      nvidiaChatBaseUrl: globalConfig.nvidiaChatBaseUrl,
      nvidiaChatModel: globalConfig.nvidiaChatModel,
      whatsappVerifyToken: globalConfig.whatsappVerifyToken,
      whatsappToken: globalConfig.whatsappToken,
      whatsappPhoneNumberId: globalConfig.whatsappPhoneNumberId,
      whatsappGraphVersion: globalConfig.whatsappGraphVersion,
      metaAppSecret: globalConfig.metaAppSecret,
    },
  });
}

module.exports = {
  buildTenantConfig,
  getLegacyInstagramConfig,
  getLegacyWhatsAppConfig,
};
