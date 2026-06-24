const config = require("../config");

async function sendInstagramMessage(recipientId, text) {
  const url = new URL(
    `https://graph.facebook.com/${config.metaGraphVersion}/me/messages`
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
