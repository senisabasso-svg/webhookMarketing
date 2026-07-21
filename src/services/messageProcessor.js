const { generateReply } = require("./ai");
const { sendInstagramMessage } = require("./meta");
const { tryAcquire, markProcessed, release } = require("./messageDedup");
const { getHistory, appendTurn } = require("./conversationHistory");
const { UNAVAILABLE_REPLY } = require("../constants/fallbackMessages");
const logger = require("./logger");
const {
  extractMessagingEvents,
  logSkippedEvent,
} = require("./messageParser");

async function processIncomingMessage(
  { userId, text, messageId, raw },
  tenant
) {
  const dedupKey = `${tenant.companyId}:${messageId}`;

  if (!tryAcquire(dedupKey)) {
    logger.log({
      platform: "instagram",
      category: "message",
      event: "message.skipped_duplicate",
      userId,
      messageId,
      message: text,
      details: { companyId: tenant.companyId },
    });
    return;
  }

  try {
    logger.log({
      platform: "instagram",
      category: "message",
      event: "message.received",
      userId,
      messageId,
      message: text,
      details: { companyId: tenant.companyId, companyName: tenant.companyName, ...(raw ?? {}) },
    });

    const aiInput = {
      user_id: userId,
      message: text,
      message_id: messageId,
    };

    let history = [];
    try {
      history = await getHistory(tenant.companyId, "instagram", userId);
    } catch (historyError) {
      logger.log({
        platform: "instagram",
        level: "warn",
        category: "ai",
        event: "history.load_error",
        userId,
        messageId,
        details: { error: historyError.message },
      });
    }

    logger.log({
      platform: "instagram",
      category: "ai",
      event: "ai.request",
      userId,
      messageId,
      details: {
        companyId: tenant.companyId,
        historyTurns: history.length,
        ...aiInput,
      },
    });

    let reply;
    let aiFailed = false;
    try {
      ({ reply } = await generateReply(aiInput, tenant, history));
    } catch (aiError) {
      aiFailed = true;
      logger.log({
        platform: "instagram",
        level: "error",
        category: "ai",
        event: "ai.error",
        userId,
        messageId,
        details: { companyId: tenant.companyId, error: aiError.message },
      });
      reply = UNAVAILABLE_REPLY;
    }

    logger.log({
      platform: "instagram",
      category: "ai",
      event: "ai.response",
      userId,
      messageId,
      message: reply,
      details: { companyId: tenant.companyId },
    });

    const result = await sendInstagramMessage(userId, reply, tenant);

    try {
      if (!aiFailed) {
        await appendTurn(tenant.companyId, "instagram", userId, text, reply, messageId);
      }
    } catch (historyError) {
      logger.log({
        platform: "instagram",
        level: "warn",
        category: "ai",
        event: "history.save_error",
        userId,
        messageId,
        details: { error: historyError.message },
      });
    }

    markProcessed(dedupKey);

    logger.log({
      platform: "instagram",
      category: "meta",
      event: "meta.sent",
      userId,
      messageId,
      message: reply,
      details: { companyId: tenant.companyId, result },
    });

    return result;
  } catch (error) {
    release(dedupKey);

    logger.log({
      platform: "instagram",
      level: "error",
      category: "message",
      event: "message.error",
      userId,
      messageId,
      message: text,
      details: {
        companyId: tenant.companyId,
        error: error.message,
        metaError: error.metaError ?? null,
      },
    });

    throw error;
  }
}

async function handleWebhookPayload(payload, tenant) {
  const messaging = payload?.entry?.flatMap((e) => e.messaging ?? []) ?? [];

  logger.log({
    platform: "instagram",
    category: "webhook",
    event: "webhook.received",
    details: {
      companyId: tenant.companyId,
      companyName: tenant.companyName,
      object: payload?.object,
      entryCount: payload?.entry?.length ?? 0,
      messaging,
    },
  });

  const { events, invalidObject } = extractMessagingEvents(payload);

  if (events.length === 0) {
    logger.log({
      platform: "instagram",
      level: "warn",
      category: "webhook",
      event: "webhook.no_processable_events",
      details: { companyId: tenant.companyId },
    });
  }

  if (invalidObject) {
    logger.log({
      platform: "instagram",
      level: "warn",
      category: "webhook",
      event: "webhook.invalid_object",
      details: { object: invalidObject, companyId: tenant.companyId },
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
      await processIncomingMessage(
        {
          userId: event.userId,
          text: event.text,
          messageId: event.messageId,
          raw: event.raw,
        },
        tenant
      );
    } catch {
      // El error ya quedó registrado en processIncomingMessage
    }
  }
}

module.exports = {
  processIncomingMessage,
  handleWebhookPayload,
};
