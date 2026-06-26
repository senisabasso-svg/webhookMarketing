const { generateReply } = require("./gemini");
const { sendWhatsAppMessage } = require("./whatsapp");
const { tryAcquire, markProcessed, release } = require("./messageDedup");
const { getHistory, appendTurn } = require("./conversationHistory");
const { UNAVAILABLE_REPLY } = require("../constants/fallbackMessages");
const logger = require("./logger");
const { extractWhatsAppEvents } = require("./whatsappParser");

const PLATFORM = "whatsapp";

async function processIncomingWhatsAppMessage(
  { from, text, messageId, contactName, raw },
  tenant
) {
  const dedupKey = `${tenant.companyId}:${messageId}`;

  if (!tryAcquire(dedupKey)) {
    logger.log({
      platform: PLATFORM,
      category: "message",
      event: "message.skipped_duplicate",
      userId: from,
      messageId,
      message: text,
      details: { companyId: tenant.companyId },
    });
    return;
  }

  try {
    logger.log({
      platform: PLATFORM,
      category: "message",
      event: "message.received",
      userId: from,
      messageId,
      message: text,
      details: {
        companyId: tenant.companyId,
        companyName: tenant.companyName,
        contactName,
        ...(raw ?? {}),
      },
    });

    const aiInput = {
      user_id: from,
      message: text,
      message_id: messageId,
      contact_name: contactName,
    };

    let history = [];
    try {
      history = await getHistory(tenant.companyId, "whatsapp", from);
    } catch (historyError) {
      logger.log({
        platform: PLATFORM,
        level: "warn",
        category: "ai",
        event: "history.load_error",
        userId: from,
        messageId,
        details: { error: historyError.message },
      });
    }

    logger.log({
      platform: PLATFORM,
      category: "ai",
      event: "ai.request",
      userId: from,
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
        platform: PLATFORM,
        level: "error",
        category: "ai",
        event: "ai.error",
        userId: from,
        messageId,
        details: { companyId: tenant.companyId, error: aiError.message },
      });
      reply = UNAVAILABLE_REPLY;
    }

    logger.log({
      platform: PLATFORM,
      category: "ai",
      event: "ai.response",
      userId: from,
      messageId,
      message: reply,
      details: { companyId: tenant.companyId },
    });

    const result = await sendWhatsAppMessage(from, reply, tenant);

    try {
      if (!aiFailed) {
        await appendTurn(tenant.companyId, "whatsapp", from, text, reply, messageId);
      }
    } catch (historyError) {
      logger.log({
        platform: PLATFORM,
        level: "warn",
        category: "ai",
        event: "history.save_error",
        userId: from,
        messageId,
        details: { error: historyError.message },
      });
    }

    markProcessed(dedupKey);

    logger.log({
      platform: PLATFORM,
      category: "meta",
      event: "meta.sent",
      userId: from,
      messageId,
      message: reply,
      details: { companyId: tenant.companyId, result },
    });

    return result;
  } catch (error) {
    release(dedupKey);

    logger.log({
      platform: PLATFORM,
      level: "error",
      category: "message",
      event: "message.error",
      userId: from,
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

async function handleWhatsAppEvent(payload, tenant) {
  logger.log({
    platform: PLATFORM,
    category: "webhook",
    event: "webhook.received",
    details: {
      companyId: tenant.companyId,
      companyName: tenant.companyName,
      object: payload?.object,
      entryCount: payload?.entry?.length ?? 0,
    },
  });

  const { events, invalidObject } = extractWhatsAppEvents(payload);

  if (invalidObject) {
    logger.log({
      platform: PLATFORM,
      level: "warn",
      category: "webhook",
      event: "webhook.invalid_object",
      details: { object: invalidObject, companyId: tenant.companyId },
    });
    return;
  }

  if (events.length === 0) {
    logger.log({
      platform: PLATFORM,
      level: "warn",
      category: "webhook",
      event: "webhook.no_processable_events",
      details: { companyId: tenant.companyId },
    });
    return;
  }

  for (const event of events) {
    if (event.action === "status") {
      logger.log({
        platform: PLATFORM,
        category: "message",
        event: "message.status_update",
        userId: event.recipientId,
        messageId: event.messageId,
        details: {
          companyId: tenant.companyId,
          status: event.status,
          timestamp: event.timestamp,
        },
      });
      continue;
    }

    if (event.action === "skip") {
      logger.log({
        platform: PLATFORM,
        category: "webhook",
        event: "message.skipped",
        userId: event.from,
        messageId: event.messageId,
        details: {
          companyId: tenant.companyId,
          reason: event.reason,
          type: event.type,
        },
      });
      continue;
    }

    if (!event.from || !event.messageId) continue;

    try {
      await processIncomingWhatsAppMessage(
        {
          from: event.from,
          text: event.text,
          messageId: event.messageId,
          contactName: event.contactName,
          raw: event.raw,
        },
        tenant
      );
    } catch {
      // El error ya quedó registrado en processIncomingWhatsAppMessage
    }
  }
}

module.exports = {
  handleWhatsAppEvent,
  processIncomingWhatsAppMessage,
};
