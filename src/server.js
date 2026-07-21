const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const config = require("./config");
const webhookRouter = require("./routes/webhook");
const { parseWebhookBody } = require("./middleware/parseWebhookBody");
const { migrate } = require("./db/migrate");
const { isDatabaseEnabled } = require("./db/pool");
const integrationStore = require("./services/integrationStore");

const leaderCommentConfig = require("./services/leaderCommentConfig");
const nvidiaCosmos = require("./services/nvidiaCosmos");
const scheduledPosts = require("./services/scheduledPosts");
const {
  startScheduledPostsWorker,
} = require("./services/scheduledPostsWorker");

const authApi = require("./routes/api/auth");
const adminApi = require("./routes/api/admin");
const companyApi = require("./routes/api/company");

const app = express();

app.use(cookieParser());

app.use(
  "/webhook",
  express.raw({ type: "application/json" }),
  parseWebhookBody,
  webhookRouter
);

app.use(express.json({ limit: "2mb" }));
app.use("/api/auth", authApi);
app.use("/api/admin", adminApi);
app.use("/api/company", companyApi);

leaderCommentConfig.ensureUploadDir();
nvidiaCosmos.ensureUploadDir();
scheduledPosts.ensureUploadDir();
app.use(
  "/files/leader",
  express.static(leaderCommentConfig.getUploadDir(), {
    setHeaders(res) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Cache-Control", "public, max-age=300");
    },
  })
);
app.use(
  "/files/videos",
  express.static(nvidiaCosmos.getUploadDir(), {
    setHeaders(res) {
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Cache-Control", "public, max-age=300");
    },
  })
);
app.use(
  "/files/scheduled",
  express.static(scheduledPosts.getUploadDir(), {
    setHeaders(res, filePath) {
      if (/\.(mp4|mov|webm)$/i.test(filePath)) {
        res.setHeader("Content-Type", "video/mp4");
      }
      res.setHeader("Cache-Control", "public, max-age=300");
    },
  })
);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    meta: {
      database: isDatabaseEnabled(),
      verifyToken: Boolean(config.verifyToken),
      whatsappVerifyToken: Boolean(config.whatsappVerifyToken),
      accessToken: config.isMetaTokenConfigured(),
      igAccountId: config.isIgAccountConfigured(),
      whatsapp: config.isWhatsAppConfigured(),
      nvidia: config.isNvidiaConfigured(),
      signatureValidation: Boolean(config.metaAppSecret),
    },
  });
});

const clientDist = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientDist));

app.get("*", (req, res, next) => {
  if (
    req.path.startsWith("/webhook") ||
    req.path.startsWith("/api") ||
    req.path.startsWith("/files") ||
    req.path === "/health"
  ) {
    return next();
  }
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) res.status(404).json({ error: "Frontend no compilado" });
  });
});

app.use((err, _req, res, _next) => {
  console.error("[server] Error no controlado:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

async function start() {
  try {
    await migrate();
    if (isDatabaseEnabled()) {
      await integrationStore.refreshCache();
    }
  } catch (error) {
    console.error("[server] Error al iniciar DB:", error.message);
  }

  app.listen(config.port, () => {
    console.log(`Servidor escuchando en http://localhost:${config.port}`);
    console.log(`Webhook URL: http://localhost:${config.port}/webhook`);
    console.log(`Panel admin: http://localhost:${config.port}`);
    startScheduledPostsWorker();
  });
}

start();
