const pool = require("../db/pool");

const inFlight = new Set();

async function tryAcquire(messageId) {
  if (!messageId) return false;
  if (inFlight.has(messageId)) return false;

  const result = await pool.query(
    `INSERT INTO processed_messages (message_id, status)
     VALUES ($1, 'processing')
     ON CONFLICT (message_id) DO NOTHING
     RETURNING message_id`,
    [messageId]
  );

  if (result.rowCount === 0) return false;

  inFlight.add(messageId);
  return true;
}

async function markProcessed(messageId) {
  if (!messageId) return;
  inFlight.delete(messageId);
  await pool.query(
    `UPDATE processed_messages SET status = 'completed' WHERE message_id = $1`,
    [messageId]
  );
}

async function release(messageId) {
  if (!messageId) return;
  inFlight.delete(messageId);
  await pool.query(
    `DELETE FROM processed_messages
     WHERE message_id = $1 AND status = 'processing'`,
    [messageId]
  );
}

module.exports = { tryAcquire, markProcessed, release };
