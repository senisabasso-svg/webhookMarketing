const { generateReply } = require("./gemini");
const { sendInstagramMessage } = require("./meta");
const { tryAcquire, markProcessed, release } = require("./messageDedup");
const logger = require("./logger");
const {
  extractMessagingEvents,
  logSkippedEvent,
} = require("./messageParser");

async function processIncomingMessage({ userId, text, messageId, raw }) {
  if (!(await tryAcquire(messageId))) {
    logger.log({
      category: "message",
      event: "message.skipped_duplicate",
      userId,
      messageId,
      message: text,
    });
    return;
  }

  try {
    logger.log({
      category: "message",
      event: "message.received",
      userId,
      messageId,
      message: text,
      details: raw ?? null,
    });

    const aiInput = {
      user_id: userId,
      message: text,
      message_id: messageId,
    };

    logger.log({
      category: "ai",
      event: "ai.request",
      userId,
      messageId,
      details: aiInput,
    });

    const { reply } = await generateReply(aiInput);

    logger.log({
      category: "ai",
      event: "ai.response",
      userId,
      messageId,
      message: reply,
    });

    const result = await sendInstagramMessage(userId, reply);

    await markProcessed(messageId);

    logger.log({
      category: "meta",
      event: "meta.sent",
      userId,
      messageId,
      message: reply,
      details: result,
    });

    return result;
  } catch (error) {
    await release(messageId);

    logger.log({
      level: "error",
      category: "message",
      event: "message.error",
      userId,
      messageId,
      message: text,
      details: {
        error: error.message,
        metaError: error.metaError ?? null,
      },
    });

    throw error;
  }
}

async function handleWebhookPayload(payload) {
  logger.log({
    category: "webhook",
    event: "webhook.received",
    details: payload,
  });

  const { events, invalidObject } = extractMessagingEvents(payload);

  if (invalidObject) {
    logger.log({
      level: "warn",
      category: "webhook",
      event: "webhook.invalid_object",
      details: { object: invalidObject },
    });
    return;
  }

  for (const event of events) {
    if (event.action === "skip") {
      logSkippedEvent(event);
      continue;
    }

    if (!event.userId || !event.messageId) continue;

    try {
      await processIncomingMessage({
        userId: event.userId,
        text: event.text,
        messageId: event.messageId,
        raw: event.raw,
      });
    } catch {
      // El error ya quedó registrado en processIncomingMessage
    }
  }
}

module.exports = {
  processIncomingMessage,
  handleWebhookPayload,
};
