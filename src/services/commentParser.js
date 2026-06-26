function extractCommentEvents(payload) {
  if (payload?.object !== "instagram") {
    return { events: [], invalidObject: payload?.object ?? null };
  }

  if (!Array.isArray(payload.entry)) {
    return { events: [], invalidObject: null };
  }

  const events = [];

  for (const entry of payload.entry) {
    const igAccountId = entry.id ? String(entry.id) : null;

    if (!Array.isArray(entry.changes)) continue;

    for (const change of entry.changes) {
      if (change.field !== "comments") continue;

      const value = change.value;
      if (!value) continue;

      const commentId = value.id ? String(value.id) : null;
      const text = value.text || "";
      const mediaId = value.media?.id ? String(value.media.id) : null;
      const userId = value.from?.id ? String(value.from.id) : null;
      const username = value.from?.username || null;

      if (!commentId) continue;

      events.push({
        commentId,
        text,
        mediaId,
        userId,
        username,
        igAccountId,
        raw: value,
      });
    }
  }

  return { events, invalidObject: null };
}

module.exports = { extractCommentEvents };
