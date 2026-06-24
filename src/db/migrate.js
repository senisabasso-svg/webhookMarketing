const pool = require("./pool");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS logs (
  id          BIGSERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level       TEXT NOT NULL DEFAULT 'info',
  category    TEXT NOT NULL,
  event       TEXT NOT NULL,
  user_id     TEXT,
  message_id  TEXT,
  message     TEXT,
  details     JSONB
);

CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs (user_id);
CREATE INDEX IF NOT EXISTS idx_logs_message_id ON logs (message_id);
CREATE INDEX IF NOT EXISTS idx_logs_event ON logs (event);

CREATE TABLE IF NOT EXISTS processed_messages (
  message_id  TEXT PRIMARY KEY,
  status      TEXT NOT NULL DEFAULT 'processing',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processed_messages_created_at
  ON processed_messages (created_at);
`;

async function migrate() {
  await pool.query(SCHEMA);
  console.log("[db] Migraciones aplicadas");
}

async function checkConnection() {
  const result = await pool.query("SELECT NOW() AS now");
  return result.rows[0];
}

module.exports = { migrate, checkConnection };
