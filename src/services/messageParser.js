const logger = require("./logger");

const ATTACHMENT_LABELS = {
  image: "El usuario envió una imagen",
  video: "El usuario envió un video",
  audio: "El usuario envió un audio",
  file: "El usuario envió un archivo",
  share: "El usuario compartió una publicación",
  story_mention: "El usuario te mencionó en una historia",
  reel: "El usuario envió un reel",
  fallback: "El usuario envió un adjunto",
};

function describeAttachment(attachment) {
  const label =
    ATTACHMENT_LABELS[attachment.type] || ATTACHMENT_LABELS.fallback;
  const url = attachment.payload?.url;
  return url ? `[${label}: ${url}]` : `[${label}]`;
}

function describeReplyTo(replyTo) {
  if (replyTo.story) {
    return "[Respondiendo a una historia]";
  }
  if (replyTo.mid) {
    return `[Respondiendo al mensaje ${replyTo.mid}]`;
  }
  return "[Respondiendo a un mensaje anterior]";
}

function describeReferral(referral) {
  const parts = ["[Referral"];
  if (referral.ref) parts.push(`ref: ${referral.ref}`);
  if (referral.source) parts.push(`source: ${referral.source}`);
  if (referral.type) parts.push(`type: ${referral.type}`);
  parts.push("]");
  return parts.join(" ");
}

function buildMessageText(message) {
  const segments = [];

  if (message.reply_to) {
    segments.push(describeReplyTo(message.reply_to));
  }

  if (message.referral) {
    segments.push(describeReferral(message.referral));
  }

  if (message.quick_reply?.payload) {
    segments.push(message.quick_reply.payload);
  } else if (message.text) {
    segments.push(message.text);
  }

  if (Array.isArray(message.attachments)) {
    for (const attachment of message.attachments) {
      segments.push(describeAttachment(attachment));
    }
  }

  return segments.join("\n").trim();
}

function normalizeMessagingItem(item) {
  if (item.message) {
    return {
      userId: item.sender?.id,
      recipientId: item.recipient?.id,
      messageId: item.message.mid,
      timestamp: item.timestamp,
      message: item.message,
      source: "message",
    };
  }

  if (item.message_edit) {
    return {
      userId: item.sender?.id,
      recipientId: item.recipient?.id,
      messageId: item.message_edit.mid,
      timestamp: item.timestamp,
      message: {
        mid: item.message_edit.mid,
        text: item.message_edit.text,
        num_edit: item.message_edit.num_edit,
      },
      source: "message_edit",
    };
  }

  return null;
}

function parseMessagingItem(item) {
  const normalized = normalizeMessagingItem(item);

  if (!normalized) {
    logger.log({
      level: "warn",
      category: "webhook",
      event: "message.unhandled_event",
      details: { keys: Object.keys(item) },
    });
    return null;
  }

  const { userId, recipientId, messageId, message, source } = normalized;

  const base = {
    userId,
    recipientId,
    messageId,
    timestamp: item.timestamp,
    source,
  };

  if (message.is_echo) {
    return { ...base, action: "skip", reason: "echo" };
  }

  if (message.is_deleted) {
    return { ...base, action: "skip", reason: "deleted" };
  }

  if (message.is_unsupported) {
    return { ...base, action: "skip", reason: "unsupported" };
  }

  const text = buildMessageText(message);

  if (!text) {
    return {
      ...base,
      action: "skip",
      reason: source === "message_edit" ? "edit_without_text" : "no_content",
      details: {
        source,
        hasAttachments: Boolean(message.attachments?.length),
        hasQuickReply: Boolean(message.quick_reply),
        hasSender: Boolean(userId),
        num_edit: message.num_edit ?? null,
      },
    };
  }

  if (!userId || !messageId) {
    return {
      ...base,
      action: "skip",
      reason: "missing_ids",
      details: { source, hasSender: Boolean(userId), hasMessageId: Boolean(messageId) },
    };
  }

  return {
    ...base,
    action: "process",
    text,
    raw: {
      source,
      text: message.text ?? null,
      attachments: message.attachments ?? null,
      quick_reply: message.quick_reply ?? null,
      reply_to: message.reply_to ?? null,
      referral: message.referral ?? null,
      num_edit: message.num_edit ?? null,
    },
  };
}

function extractMessagingEvents(payload) {
  if (payload?.object !== "instagram") {
    return { events: [], invalidObject: payload?.object ?? null };
  }

  if (!Array.isArray(payload.entry)) {
    return { events: [], invalidObject: null };
  }

  const events = [];

  for (const entry of payload.entry) {
    if (!Array.isArray(entry.messaging)) continue;

    for (const item of entry.messaging) {
      const parsed = parseMessagingItem(item);
      if (parsed) events.push(parsed);
    }
  }

  return { events, invalidObject: null };
}

function logSkippedEvent(event) {
  const eventMap = {
    echo: "message.skipped_echo",
    deleted: "message.skipped_deleted",
    unsupported: "message.skipped_unsupported",
    no_content: "message.skipped_no_content",
    edit_without_text: "message.skipped_edit_without_text",
    missing_ids: "message.skipped_missing_ids",
  };

  logger.log({
    category: "webhook",
    event: eventMap[event.reason] || "message.skipped",
    userId: event.userId,
    messageId: event.messageId,
    details: { reason: event.reason, source: event.source, ...event.details },
  });
}

module.exports = {
  extractMessagingEvents,
  logSkippedEvent,
  parseMessagingItem,
  buildMessageText,
};
