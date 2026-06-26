const globalConfig = require("../config");

async function metaPost(url, body, tenant = null) {
  const cfg = tenant || globalConfig;

  if (!cfg.isMetaTokenConfigured()) {
    throw new Error("META_ACCESS_TOKEN no configurado para esta empresa");
  }

  const requestUrl = new URL(url);
  requestUrl.searchParams.set("access_token", cfg.metaAccessToken);

  const response = await fetch(requestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(
      data?.error?.message || "Error al enviar mensaje a Meta"
    );
    error.metaError = data?.error;
    throw error;
  }

  return data;
}

async function sendInstagramMessage(recipientId, text, tenant = null) {
  const cfg = tenant || globalConfig;
  const endpointId = cfg.messagesEndpointId();
  const url = `${cfg.graphBaseUrl()}/${cfg.metaGraphVersion}/${endpointId}/messages`;

  return metaPost(
    url,
    {
      recipient: { id: recipientId },
      message: { text },
    },
    tenant
  );
}

async function sendInstagramPrivateReply(commentId, text, tenant = null) {
  const cfg = tenant || globalConfig;
  const endpointId = cfg.messagesEndpointId();
  const url = `${cfg.graphBaseUrl()}/${cfg.metaGraphVersion}/${endpointId}/messages`;

  return metaPost(
    url,
    {
      recipient: { comment_id: String(commentId) },
      message: { text },
    },
    tenant
  );
}

async function sendInstagramFileAttachment(recipientId, fileUrl, tenant = null) {
  const cfg = tenant || globalConfig;
  const endpointId = cfg.messagesEndpointId();
  const url = `${cfg.graphBaseUrl()}/${cfg.metaGraphVersion}/${endpointId}/messages`;

  return metaPost(
    url,
    {
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: "file",
          payload: {
            url: fileUrl,
            is_reusable: true,
          },
        },
      },
    },
    tenant
  );
}

module.exports = {
  sendInstagramMessage,
  sendInstagramPrivateReply,
  sendInstagramFileAttachment,
};
