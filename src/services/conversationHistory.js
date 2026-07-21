const { getPool, isDatabaseEnabled } = require("../db/pool");
const globalConfig = require("../config");

const memoryStore = new Map();

function conversationKey(companyId, platform, userId) {
  return `${companyId}:${platform}:${userId}`;
}

function getLimit() {
  return Number(process.env.CONVERSATION_HISTORY_LIMIT) || 20;
}

function getTtlMs() {
  const hours = Number(process.env.CONVERSATION_TTL_HOURS) || 24;
  return hours * 60 * 60 * 1000;
}

function pruneMemoryList(messages) {
  const cutoff = Date.now() - getTtlMs();
  const fresh = messages.filter((m) => m.createdAt > cutoff);
  return fresh.slice(-getLimit());
}

async function getHistory(companyId, platform, userId) {
  if (!companyId || !platform || !userId) return [];

  if (isDatabaseEnabled()) {
    const pool = getPool();
    const limit = getLimit();
    const { rows } = await pool.query(
      `SELECT role, content, created_at
       FROM conversation_messages
       WHERE company_id = $1 AND platform = $2 AND user_id = $3
         AND created_at > NOW() - ($4::text || ' hours')::interval
       ORDER BY created_at DESC
       LIMIT $5`,
      [String(companyId), platform, String(userId), String(getTtlMs() / 3600000), limit]
    );
    return rows.reverse().map((r) => ({
      role: r.role,
      content: r.content,
    }));
  }

  const key = conversationKey(companyId, platform, userId);
  const stored = memoryStore.get(key) || [];
  return pruneMemoryList(stored).map(({ role, content }) => ({ role, content }));
}

async function appendTurn(companyId, platform, userId, userText, assistantText, messageId) {
  if (!companyId || !platform || !userId || !userText) return;

  const now = Date.now();

  if (isDatabaseEnabled()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO conversation_messages
           (company_id, platform, user_id, role, content, message_id)
         VALUES ($1, $2, $3, 'user', $4, $5)`,
        [String(companyId), platform, String(userId), userText, messageId || null]
      );
      if (assistantText) {
        await client.query(
          `INSERT INTO conversation_messages
             (company_id, platform, user_id, role, content)
           VALUES ($1, $2, $3, 'assistant', $4)`,
          [String(companyId), platform, String(userId), assistantText]
        );
      }
      const limit = getLimit();
      await client.query(
        `DELETE FROM conversation_messages
         WHERE id IN (
           SELECT id FROM conversation_messages
           WHERE company_id = $1 AND platform = $2 AND user_id = $3
           ORDER BY created_at DESC
           OFFSET $4
         )`,
        [String(companyId), platform, String(userId), limit]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return;
  }

  const key = conversationKey(companyId, platform, userId);
  const list = memoryStore.get(key) || [];
  list.push({ role: "user", content: userText, createdAt: now });
  if (assistantText) {
    list.push({ role: "assistant", content: assistantText, createdAt: now });
  }
  memoryStore.set(key, pruneMemoryList(list));
}

function getInboxDays() {
  return Number(process.env.CONVERSATION_INBOX_DAYS) || 30;
}

function shortPreview(text, max = 90) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

async function listConversations(companyId, platform = "instagram", { limit = 50 } = {}) {
  if (!companyId || !platform) return [];

  if (isDatabaseEnabled()) {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT
         user_id,
         COUNT(*)::int AS message_count,
         MAX(created_at) AS last_at,
         (
           SELECT content FROM conversation_messages m2
           WHERE m2.company_id = m.company_id
             AND m2.platform = m.platform
             AND m2.user_id = m.user_id
           ORDER BY m2.created_at DESC
           LIMIT 1
         ) AS last_content,
         (
           SELECT role FROM conversation_messages m3
           WHERE m3.company_id = m.company_id
             AND m3.platform = m.platform
             AND m3.user_id = m.user_id
           ORDER BY m3.created_at DESC
           LIMIT 1
         ) AS last_role
       FROM conversation_messages m
       WHERE company_id = $1
         AND platform = $2
         AND created_at > NOW() - ($3::text || ' days')::interval
       GROUP BY company_id, platform, user_id
       ORDER BY last_at DESC
       LIMIT $4`,
      [String(companyId), platform, String(getInboxDays()), Math.min(200, Number(limit) || 50)]
    );

    return rows.map((r) => ({
      userId: r.user_id,
      messageCount: r.message_count,
      lastAt: r.last_at,
      lastRole: r.last_role,
      lastPreview: shortPreview(r.last_content),
    }));
  }

  const prefix = `${companyId}:${platform}:`;
  const items = [];
  const cutoff = Date.now() - getInboxDays() * 24 * 60 * 60 * 1000;

  for (const [key, messages] of memoryStore.entries()) {
    if (!key.startsWith(prefix)) continue;
    const userId = key.slice(prefix.length);
    const fresh = (messages || []).filter((m) => m.createdAt > cutoff);
    if (!fresh.length) continue;
    const last = fresh[fresh.length - 1];
    items.push({
      userId,
      messageCount: fresh.length,
      lastAt: new Date(last.createdAt).toISOString(),
      lastRole: last.role,
      lastPreview: shortPreview(last.content),
    });
  }

  return items
    .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt))
    .slice(0, Math.min(200, Number(limit) || 50));
}

async function getConversationThread(
  companyId,
  platform,
  userId,
  { limit = 100 } = {}
) {
  if (!companyId || !platform || !userId) return [];

  if (isDatabaseEnabled()) {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT role, content, message_id, created_at
       FROM conversation_messages
       WHERE company_id = $1 AND platform = $2 AND user_id = $3
         AND created_at > NOW() - ($4::text || ' days')::interval
       ORDER BY created_at ASC
       LIMIT $5`,
      [
        String(companyId),
        platform,
        String(userId),
        String(getInboxDays()),
        Math.min(300, Number(limit) || 100),
      ]
    );
    return rows.map((r) => ({
      role: r.role,
      content: r.content,
      messageId: r.message_id || null,
      createdAt: r.created_at,
    }));
  }

  const key = conversationKey(companyId, platform, userId);
  const cutoff = Date.now() - getInboxDays() * 24 * 60 * 60 * 1000;
  const stored = (memoryStore.get(key) || []).filter((m) => m.createdAt > cutoff);
  return stored.slice(-Math.min(300, Number(limit) || 100)).map((m) => ({
    role: m.role,
    content: m.content,
    messageId: null,
    createdAt: new Date(m.createdAt).toISOString(),
  }));
}

module.exports = {
  getHistory,
  appendTurn,
  listConversations,
  getConversationThread,
};
