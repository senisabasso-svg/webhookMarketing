const {
  getConfig,
  matchesKeyword,
  getPdfPublicUrl,
} = require("./leaderCommentConfig");
const {
  sendInstagramPrivateReply,
  sendInstagramMessage,
  sendInstagramFileAttachment,
} = require("./meta");
const { tryAcquire, markProcessed, release } = require("./messageDedup");
const logger = require("./logger");
const { extractCommentEvents } = require("./commentParser");

async function processCommentEvent(event, tenant) {
  if (tenant.companyId !== "legacy") return;

  const leaderConfig = await getConfig();
  if (!leaderConfig?.enabled) return;
  if (!leaderConfig.keyword || !leaderConfig.replyText) return;
  if (!matchesKeyword(event.text, leaderConfig.keyword)) {
    logger.log({
      platform: "instagram",
      category: "comment",
      event: "comment.skipped_no_keyword",
      userId: event.userId,
      messageId: event.commentId,
      details: {
        keyword: leaderConfig.keyword,
        text: event.text,
      },
    });
    return;
  }

  const dedupKey = `comment:${tenant.companyId}:${event.commentId}`;
  if (!tryAcquire(dedupKey)) return;

  try {
    logger.log({
      platform: "instagram",
      category: "comment",
      event: "comment.matched",
      userId: event.userId,
      messageId: event.commentId,
      details: {
        keyword: leaderConfig.keyword,
        text: event.text,
        mediaId: event.mediaId,
        username: event.username,
      },
    });

    await sendInstagramPrivateReply(
      event.commentId,
      leaderConfig.replyText,
      tenant
    );

    logger.log({
      platform: "instagram",
      category: "comment",
      event: "comment.private_reply_sent",
      userId: event.userId,
      messageId: event.commentId,
      message: leaderConfig.replyText,
    });

    if (leaderConfig.pdfFilename && event.userId) {
      const pdfUrl = getPdfPublicUrl(leaderConfig.pdfFilename);
      try {
        await sendInstagramFileAttachment(event.userId, pdfUrl, tenant);
        logger.log({
          platform: "instagram",
          category: "comment",
          event: "comment.pdf_sent",
          userId: event.userId,
          messageId: event.commentId,
          details: { pdfUrl },
        });
      } catch (pdfError) {
        logger.log({
          platform: "instagram",
          level: "warn",
          category: "comment",
          event: "comment.pdf_fallback_link",
          userId: event.userId,
          messageId: event.commentId,
          details: { error: pdfError.message, pdfUrl },
        });
        await sendInstagramMessage(
          event.userId,
          `📄 Descargá el PDF acá: ${pdfUrl}`,
          tenant
        );
      }
    }

    markProcessed(dedupKey);
  } catch (error) {
    release(dedupKey);
    logger.log({
      platform: "instagram",
      level: "error",
      category: "comment",
      event: "comment.error",
      userId: event.userId,
      messageId: event.commentId,
      details: {
        error: error.message,
        metaError: error.metaError ?? null,
      },
    });
  }
}

async function handleCommentWebhook(payload, tenant) {
  const { events, invalidObject } = extractCommentEvents(payload);

  if (invalidObject) {
    logger.log({
      platform: "instagram",
      level: "warn",
      category: "comment",
      event: "comment.invalid_object",
      details: { object: invalidObject },
    });
    return;
  }

  if (events.length === 0) return;

  logger.log({
    platform: "instagram",
    category: "comment",
    event: "comment.webhook_received",
    details: {
      companyId: tenant.companyId,
      count: events.length,
    },
  });

  for (const event of events) {
    await processCommentEvent(event, tenant);
  }
}

module.exports = { handleCommentWebhook, processCommentEvent };
