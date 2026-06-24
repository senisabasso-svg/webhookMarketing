const express = require("express");
const config = require("./config");
const webhookRouter = require("./routes/webhook");

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    meta: {
      verifyToken: Boolean(config.verifyToken),
      accessToken: config.isMetaTokenConfigured(),
      igAccountId: config.isIgAccountConfigured(),
    },
  });
});

app.use("/webhook", webhookRouter);

app.use((err, _req, res, _next) => {
  console.error("[server] Error no controlado:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

app.listen(config.port, () => {
  console.log(`Servidor escuchando en http://localhost:${config.port}`);
  console.log(`Webhook URL: http://localhost:${config.port}/webhook`);
});
