const globalConfig = require("../config");

async function sendInstagramMessage(recipientId, text, tenant = null) {
  const cfg = tenant || globalConfig;

  if (!cfg.isMetaTokenConfigured()) {
    throw new Error(
      "META_ACCESS_TOKEN no configurado para esta empresa"
    );
  }

  const endpointId = cfg.messagesEndpointId();
  const url = new URL(
    `${cfg.graphBaseUrl()}/${cfg.metaGraphVersion}/${endpointId}/messages`
  );
  url.searchParams.set("access_token", cfg.metaAccessToken);

  const body = {
    recipient: { id: recipientId },
    message: { text },
  };

  const response = await fetch(url, {
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

module.exports = { sendInstagramMessage };
