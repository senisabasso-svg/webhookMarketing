const express = require("express");
const config = require("../config");
const { handleWebhookPayload } = require("../services/messageProcessor");
const logger = require("../services/logger");

const router = express.Router();

router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === config.verifyToken) {
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

router.post("/", (req, res) => {
  res.sendStatus(200);

  handleWebhookPayload(req.body).catch((error) => {
    logger.log({
      level: "error",
      category: "webhook",
      event: "webhook.process_error",
      details: { error: error.message },
    });
  });
});

module.exports = router;
