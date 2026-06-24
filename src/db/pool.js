const { Pool } = require("pg");
const config = require("../config");

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.dbSsl,
});

pool.on("error", (err) => {
  console.error("[db] Error inesperado en el pool:", err);
});

module.exports = pool;
