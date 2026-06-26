const { Pool } = require("pg");
const config = require("../config");

let pool = null;

function getPool() {
  if (!config.databaseUrl) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
    });
  }
  return pool;
}

function isDatabaseEnabled() {
  return Boolean(config.databaseUrl);
}

module.exports = { getPool, isDatabaseEnabled };
