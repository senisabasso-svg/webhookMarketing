const pool = require("../db/pool");

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseLimit(raw) {
  const limit = Number(raw) || DEFAULT_LIMIT;
  return Math.min(Math.max(1, limit), MAX_LIMIT);
}

function parseOffset(raw) {
  const offset = Number(raw) || 0;
  return Math.max(0, offset);
}

function buildFilters(query) {
  const conditions = [];
  const values = [];
  let index = 1;

  const filters = {
    user_id: query.user_id,
    message_id: query.message_id,
    event: query.event,
    category: query.category,
    level: query.level,
  };

  for (const [column, value] of Object.entries(filters)) {
    if (value) {
      conditions.push(`${column} = $${index++}`);
      values.push(value);
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, values };
}

async function fetchLogs(query) {
  const limit = parseLimit(query.limit);
  const offset = parseOffset(query.offset);
  const { where, values } = buildFilters(query);

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM logs ${where}`,
    values
  );

  const dataResult = await pool.query(
    `SELECT id, created_at, level, category, event, user_id, message_id, message, details
     FROM logs
     ${where}
     ORDER BY created_at DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );

  return {
    total: countResult.rows[0].total,
    limit,
    offset,
    logs: dataResult.rows,
  };
}

module.exports = { fetchLogs };
