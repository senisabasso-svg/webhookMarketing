const globalConfig = require("../config");

async function sendWhatsAppMessage(to, text, tenant = null) {
  const cfg = tenant || globalConfig;

  if (!cfg.isWhatsAppConfigured()) {
    throw new Error(
      "WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID no configurados para esta empresa"
    );
  }

  // Fuera de la ventana de 24 h Meta exige type: "template" con un template
  // pre-aprobado en lugar de texto libre. Ejemplo futuro:
  // { type: "template", template: { name: "hello_world", language: { code: "es" } } }

  const url = `https://graph.facebook.com/${cfg.whatsappGraphVersion}/${cfg.whatsappPhoneNumberId}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.whatsappToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(
      data?.error?.message || "Error al enviar mensaje a WhatsApp"
    );
    error.metaError = data?.error;
    throw error;
  }

  return data;
}

module.exports = { sendWhatsAppMessage };
