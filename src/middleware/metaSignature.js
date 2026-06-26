const crypto = require("crypto");
const config = require("../config");
const integrationStore = require("../services/integrationStore");
const logger = require("../services/logger");

function verifyWithSecret(rawBody, signatureHeader, secret) {
  if (!secret) return false;

  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const received = signatureHeader.slice("sha256=".length);

  let receivedBuffer;
  try {
    receivedBuffer = Buffer.from(received, "hex");
  } catch {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, "hex");
  if (expectedBuffer.length !== receivedBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

async function verifyMetaSignature(rawBody, signatureHeader) {
  const secrets = new Set();

  if (config.metaAppSecret) secrets.add(config.metaAppSecret);
  if (config.igAppSecret) secrets.add(config.igAppSecret);

  try {
    const dbSecrets = await integrationStore.getAllAppSecrets();
    for (const s of dbSecrets) secrets.add(s);
  } catch {
    // DB no disponible — solo secrets de .env
  }

  if (secrets.size === 0) {
    return { valid: true, skipped: true };
  }

  for (const secret of secrets) {
    if (verifyWithSecret(rawBody, signatureHeader, secret)) {
      return { valid: true, skipped: false };
    }
  }

  return { valid: false, skipped: false, reason: "signature_mismatch" };
}

function validateMetaSignature(req, res, next) {
  if (req.method !== "POST") return next();

  const rawBody = req.rawBody;
  if (!Buffer.isBuffer(rawBody)) {
    logger.log({
      level: "error",
      category: "webhook",
      event: "signature.missing_raw_body",
    });
    return res.sendStatus(400);
  }

  verifyMetaSignature(rawBody, req.get("X-Hub-Signature-256"))
    .then((result) => {
      if (result.skipped) {
        logger.log({
          level: "warn",
          category: "webhook",
          event: "signature.skipped",
          details: { reason: "META_APP_SECRET not configured" },
        });
        return next();
      }

      if (!result.valid) {
        logger.log({
          level: "warn",
          category: "webhook",
          event: "signature.invalid",
          details: { reason: result.reason },
        });
        return res.sendStatus(403);
      }

      next();
    })
    .catch((error) => {
      logger.log({
        level: "error",
        category: "webhook",
        event: "signature.error",
        details: { error: error.message },
      });
      res.sendStatus(500);
    });
}

module.exports = { validateMetaSignature, verifyMetaSignature };
