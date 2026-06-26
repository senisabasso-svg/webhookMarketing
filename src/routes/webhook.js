const express = require("express");
const config = require("../config");
const { handleInstagramWebhook } = require("../services/instagramDispatcher");
const { handleWhatsAppEvent } = require("../services/whatsappProcessor");
const {
  resolveInstagramTenant,
  resolveWhatsAppTenant,
} = require("../services/companyResolver");
const integrationStore = require("../services/integrationStore");
const { validateMetaSignature } = require("../middleware/metaSignature");
const logger = require("../services/logger");

const router = express.Router();

async function isValidVerifyToken(token) {
  const tokens = new Set(
    [config.verifyToken, config.whatsappVerifyToken].filter(Boolean)
  );

  try {
    const dbTokens = await integrationStore.getAllVerifyTokens();
    for (const t of dbTokens) tokens.add(t);
  } catch {
    // DB no disponible
  }

  return tokens.has(token);
}

router.get("/", async (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && (await isValidVerifyToken(token))) {
    logger.log({
      category: "webhook",
      event: "webhook.verify_success",
      details: { mode },
    });
    return res.status(200).type("text/plain").send(challenge);
  }

  logger.log({
    level: "warn",
    category: "webhook",
    event: "webhook.verify_failed",
    details: { mode, tokenProvided: Boolean(token) },
  });
  return res.sendStatus(403);
});

router.post("/", validateMetaSignature, (req, res) => {
  res.sendStatus(200);

  const object = req.body?.object;

  if (object === "instagram") {
    resolveInstagramTenant(req.body)
      .then((tenant) => {
        if (!tenant) {
          logger.log({
            platform: "instagram",
            level: "warn",
            category: "webhook",
            event: "webhook.unknown_tenant",
          });
          return;
        }
        return handleInstagramWebhook(req.body, tenant);
      })
      .catch((error) => {
        logger.log({
          platform: "instagram",
          level: "error",
          category: "webhook",
          event: "webhook.process_error",
          details: { error: error.message },
        });
      });
    return;
  }

  if (object === "whatsapp_business_account") {
    resolveWhatsAppTenant(req.body)
      .then((tenant) => {
        if (!tenant) {
          logger.log({
            platform: "whatsapp",
            level: "warn",
            category: "webhook",
            event: "webhook.unknown_tenant",
          });
          return;
        }
        return handleWhatsAppEvent(req.body, tenant);
      })
      .catch((error) => {
        logger.log({
          platform: "whatsapp",
          level: "error",
          category: "webhook",
          event: "webhook.process_error",
          details: { error: error.message },
        });
      });
    return;
  }

  logger.log({
    level: "warn",
    category: "webhook",
    event: "webhook.unknown_object",
    details: { object: object ?? null },
  });
});

module.exports = router;
