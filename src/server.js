const express = require("express");
const config = require("./config");
const webhookRouter = require("./routes/webhook");
const logsRouter = require("./routes/logs");
const { migrate, checkConnection } = require("./db/migrate");

const app = express();

app.use(express.json());

app.get("/health", async (_req, res) => {
  try {
    const db = await checkConnection();
    res.json({ status: "ok", db: { connected: true, time: db.now } });
  } catch (error) {
    res.status(503).json({
      status: "degraded",
      db: { connected: false, error: error.message },
    });
  }
});

app.use("/webhook", webhookRouter);
app.use("/logs", logsRouter);

app.use((err, _req, res, _next) => {
  console.error("[server] Error no controlado:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

async function start() {
  await migrate();

  app.listen(config.port, () => {
    console.log(`Servidor escuchando en http://localhost:${config.port}`);
    console.log(`Webhook URL: http://localhost:${config.port}/webhook`);
  });
}

start().catch((error) => {
  console.error("[server] No se pudo iniciar:", error);
  process.exit(1);
});
