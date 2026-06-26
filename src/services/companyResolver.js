const globalConfig = require("../config");
const integrationStore = require("./integrationStore");
const {
  getLegacyInstagramConfig,
  getLegacyWhatsAppConfig,
} = require("./tenantConfig");

function extractInstagramEmitterId(payload) {
  const entryId = payload?.entry?.[0]?.id;
  return entryId ? String(entryId) : null;
}

function extractWhatsAppEmitterId(payload) {
  for (const entry of payload?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (phoneNumberId) return String(phoneNumberId);
    }
  }
  return null;
}

function legacyInstagramMatches(emitterId) {
  if (!globalConfig.isMetaTokenConfigured()) return false;
  if (!emitterId) return true;
  if (!globalConfig.igAccountId) return true;
  return String(globalConfig.igAccountId) === emitterId;
}

function legacyWhatsAppMatches(emitterId) {
  if (!globalConfig.isWhatsAppConfigured()) return false;
  if (!emitterId) return true;
  if (!globalConfig.whatsappPhoneNumberId) return true;
  return String(globalConfig.whatsappPhoneNumberId) === emitterId;
}

async function resolveInstagramTenant(payload) {
  const emitterId = extractInstagramEmitterId(payload);

  const dbTenant = await integrationStore.findByEmitter("instagram", emitterId);
  if (dbTenant) return dbTenant;

  if (legacyInstagramMatches(emitterId)) {
    return getLegacyInstagramConfig();
  }

  return null;
}

async function resolveWhatsAppTenant(payload) {
  const emitterId = extractWhatsAppEmitterId(payload);

  const dbTenant = await integrationStore.findByEmitter("whatsapp", emitterId);
  if (dbTenant) return dbTenant;

  if (legacyWhatsAppMatches(emitterId)) {
    return getLegacyWhatsAppConfig();
  }

  return null;
}

module.exports = {
  extractInstagramEmitterId,
  extractWhatsAppEmitterId,
  resolveInstagramTenant,
  resolveWhatsAppTenant,
};
