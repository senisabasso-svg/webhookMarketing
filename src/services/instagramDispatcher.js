const { handleWebhookPayload } = require("./messageProcessor");
const { handleCommentWebhook } = require("./commentProcessor");
const { extractCommentEvents } = require("./commentParser");

function hasMessaging(payload) {
  return (payload?.entry ?? []).some(
    (entry) => Array.isArray(entry.messaging) && entry.messaging.length > 0
  );
}

function hasComments(payload) {
  return extractCommentEvents(payload).events.length > 0;
}

async function handleInstagramWebhook(payload, tenant) {
  if (hasComments(payload)) {
    await handleCommentWebhook(payload, tenant);
  }

  if (hasMessaging(payload)) {
    await handleWebhookPayload(payload, tenant);
  }
}

module.exports = { handleInstagramWebhook };
