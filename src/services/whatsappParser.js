const TYPE_LABELS = {
  text: null,
  image: "El usuario envió una imagen",
  audio: "El usuario envió un audio",
  video: "El usuario envió un video",
  document: "El usuario envió un documento",
  sticker: "El usuario envió un sticker",
  location: "El usuario envió una ubicación",
  contacts: "El usuario envió un contacto",
  interactive: "El usuario respondió a un mensaje interactivo",
  button: "El usuario presionó un botón",
  reaction: "El usuario reaccionó a un mensaje",
  unknown: "El usuario envió un mensaje no soportado",
};

function buildWhatsAppMessageText(message) {
  if (message.type === "text") {
    return message.text?.body?.trim() || "";
  }

  if (message.type === "interactive") {
    const interactive = message.interactive;
    if (interactive?.button_reply?.title) {
      return interactive.button_reply.title;
    }
    if (interactive?.list_reply?.title) {
      return interactive.list_reply.title;
    }
    return TYPE_LABELS.interactive;
  }

  if (message.type === "button") {
    return message.button?.text || message.button?.payload || TYPE_LABELS.button;
  }

  return TYPE_LABELS[message.type] || TYPE_LABELS.unknown;
}

function parseWhatsAppMessage(message, contactsByWaId) {
  const from = message.from;
  const messageId = message.id;
  const contactName = contactsByWaId[from] ?? null;
  const text = buildWhatsAppMessageText(message);

  const base = {
    from,
    messageId,
    timestamp: message.timestamp,
    type: message.type,
    contactName,
  };

  if (!from || !messageId) {
    return { ...base, action: "skip", reason: "missing_ids" };
  }

  if (!text) {
    return { ...base, action: "skip", reason: "no_content" };
  }

  return {
    ...base,
    action: "process",
    text,
    raw: {
      type: message.type,
      text: message.text ?? null,
      image: message.image ?? null,
      audio: message.audio ?? null,
      interactive: message.interactive ?? null,
    },
  };
}

function extractWhatsAppEvents(payload) {
  if (payload?.object !== "whatsapp_business_account") {
    return { events: [], invalidObject: payload?.object ?? null };
  }

  if (!Array.isArray(payload.entry)) {
    return { events: [], invalidObject: null };
  }

  const events = [];

  for (const entry of payload.entry) {
    if (!Array.isArray(entry.changes)) continue;

    for (const change of entry.changes) {
      const value = change.value;
      if (!value) continue;

      const contactsByWaId = {};
      for (const contact of value.contacts ?? []) {
        if (contact.wa_id) {
          contactsByWaId[contact.wa_id] = contact.profile?.name ?? null;
        }
      }

      for (const status of value.statuses ?? []) {
        events.push({
          action: "status",
          messageId: status.id,
          recipientId: status.recipient_id,
          status: status.status,
          timestamp: status.timestamp,
        });
      }

      for (const message of value.messages ?? []) {
        events.push(parseWhatsAppMessage(message, contactsByWaId));
      }
    }
  }

  return { events, invalidObject: null };
}

module.exports = { extractWhatsAppEvents, buildWhatsAppMessageText };
