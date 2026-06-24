const config = require("../config");

async function sendInstagramMessage(recipientId, text) {
  if (!config.isMetaTokenConfigured()) {
    throw new Error(
      "META_ACCESS_TOKEN no configurado. Conectá tu cuenta de Instagram en Meta y pegá el token en .env"
    );
  }

  const endpointId = config.messagesEndpointId();
  const url = new URL(
    `${config.graphBaseUrl()}/${config.metaGraphVersion}/${endpointId}/messages`
  );
  url.searchParams.set("access_token", config.metaAccessToken);

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
