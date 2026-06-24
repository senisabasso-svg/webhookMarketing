const { generateReply } = require("./gemini");
const { sendInstagramMessage } = require("./meta");
const { tryAcquire, markProcessed, release } = require("./messageDedup");
const logger = require("./logger");
const {
  extractMessagingEvents,
  logSkippedEvent,
} = require("./messageParser");

async function processIncomingMessage({ userId, text, messageId, raw }) {
  if (!tryAcquire(messageId)) {
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

    let reply;
    try {
      ({ reply } = await generateReply(aiInput));
    } catch (aiError) {
      logger.log({
        level: "error",
        category: "ai",
        event: "ai.error",
        userId,
        messageId,
        details: { error: aiError.message },
      });
      reply =
        "Recibimos tu mensaje. En este momento el asistente no está disponible, te respondemos en breve.";
    }

    logger.log({
      category: "ai",
      event: "ai.response",
      userId,
      messageId,
      message: reply,
    });

    const result = await sendInstagramMessage(userId, reply);

    markProcessed(messageId);

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
    release(messageId);

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
  const messaging = payload?.entry?.flatMap((e) => e.messaging ?? []) ?? [];

  logger.log({
    category: "webhook",
    event: "webhook.received",
    details: {
      object: payload?.object,
      entryCount: payload?.entry?.length ?? 0,
      messaging,
    },
  });

  const { events, invalidObject } = extractMessagingEvents(payload);

  if (events.length === 0) {
    logger.log({
      level: "warn",
      category: "webhook",
      event: "webhook.no_processable_events",
      details: payload,
    });
  }

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
