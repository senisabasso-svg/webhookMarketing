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

module.exports = { getHistory, appendTurn };
