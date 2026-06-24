const pool = require("../db/pool");

function formatConsole(entry) {
  const base = `[${entry.category}] ${entry.event}`;
  const ids = [entry.userId, entry.messageId].filter(Boolean).join(" | ");
  return ids ? `${base} (${ids})` : base;
}

async function writeLog(entry) {
  const {
    level = "info",
    category,
    event,
    userId = null,
    messageId = null,
    message = null,
    details = null,
  } = entry;

  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
    formatConsole(entry),
    details ?? message ?? ""
  );

  await pool.query(
    `INSERT INTO logs (level, category, event, user_id, message_id, message, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      level,
      category,
      event,
      userId,
      messageId,
      message,
      details ?? null,
    ]
  );
}

function log(entry) {
  writeLog(entry).catch((err) => {
    console.error("[logger] No se pudo guardar en Postgres:", err.message);
  });
}

module.exports = { log, writeLog };
