const express = require("express");
const { requireAuth } = require("../../services/auth");
const config = require("../../config");
const integrationStore = require("../../services/integrationStore");
const { INTEGRATION_TYPES } = require("../../constants/integrationFields");
const leaderCommentConfig = require("../../services/leaderCommentConfig");
const { uploadLeaderPdf } = require("../../middleware/uploadLeaderPdf");
const { uploadVideoImage } = require("../../middleware/uploadVideoImage");
const nvidiaCosmos = require("../../services/nvidiaCosmos");
const nvidiaChat = require("../../services/nvidiaChat");
const { resolveProvider } = require("../../services/ai");
const instagramInsights = require("../../services/instagramInsights");
const companyGrowthContext = require("../../services/companyGrowthContext");
const conversationHistory = require("../../services/conversationHistory");
const { isDatabaseEnabled } = require("../../db/pool");

const router = express.Router();

router.use(requireAuth(["superadmin"]));

router.get("/ai-chat", async (_req, res) => {
  let companies = [];
  try {
    companies = await integrationStore.listCompanies();
  } catch {
    companies = [];
  }

  res.json({
    configured: config.isNvidiaConfigured(),
    provider: resolveProvider(),
    model: config.nvidiaChatModel,
    baseUrl: config.nvidiaChatBaseUrl,
    aiProviderEnv: config.aiProvider,
    companies: [
      { id: "legacy", name: "Febros (.env)" },
      ...companies.map((c) => ({ id: c.id, name: c.name })),
    ],
  });
});

router.post("/ai-chat", async (req, res) => {
  const message = String(req.body?.message || "").trim();
  if (!message) {
    return res.status(400).json({ error: "Mensaje requerido" });
  }

  if (!config.isNvidiaConfigured()) {
    return res.status(503).json({
      error: "NVIDIA_API_KEY no configurada en Railway / .env",
    });
  }

  try {
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const companyId = String(req.body?.companyId || "legacy");
    const forceRefresh = Boolean(req.body?.refreshContext);
    const context = await companyGrowthContext.getGrowthContextSafe(
      companyId,
      { forceRefresh }
    );

    const result = await nvidiaChat.generateReply(
      { message, systemPrompt: context.systemPrompt },
      null,
      history
    );
    res.json({
      ...result,
      companyId: context.companyId,
      companyName: context.companyName,
      username: context.username,
      contextFetchedAt: context.fetchedAt,
      insightsError: context.insightsError,
    });
  } catch (error) {
    console.error("[ai-chat] error:", error.message);
    const status =
      error.status && error.status >= 400 && error.status < 600
        ? error.status
        : 502;
    res.status(status).json({ error: error.message });
  }
});

router.get("/companies", async (_req, res) => {
  try {
    const companies = await integrationStore.listCompanies();
    res.json({ companies });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/companies/:companyId/instagram/insights", async (req, res) => {
  try {
    const data = await instagramInsights.getCompanyInsights(
      req.params.companyId
    );
    res.json(data);
  } catch (error) {
    const status = error.status && error.status >= 400 ? error.status : 502;
    res.status(status).json({
      error: error.message,
      metaError: error.metaError || null,
    });
  }
});

router.get("/instagram/insights/legacy", async (_req, res) => {
  try {
    const data = await instagramInsights.getCompanyInsights("legacy");
    res.json(data);
  } catch (error) {
    const status = error.status && error.status >= 400 ? error.status : 502;
    res.status(status).json({
      error: error.message,
      metaError: error.metaError || null,
    });
  }
});

router.get("/companies/:companyId/instagram/conversations", async (req, res) => {
  try {
    const conversations = await conversationHistory.listConversations(
      req.params.companyId,
      "instagram"
    );
    res.json({ conversations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get(
  "/companies/:companyId/instagram/conversations/:userId",
  async (req, res) => {
    try {
      const messages = await conversationHistory.getConversationThread(
        req.params.companyId,
        "instagram",
        req.params.userId
      );
      res.json({ userId: req.params.userId, messages });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

router.get("/instagram/conversations/legacy", async (_req, res) => {
  try {
    const conversations = await conversationHistory.listConversations(
      "legacy",
      "instagram"
    );
    res.json({ conversations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/instagram/conversations/legacy/:userId", async (req, res) => {
  try {
    const messages = await conversationHistory.getConversationThread(
      "legacy",
      "instagram",
      req.params.userId
    );
    res.json({ userId: req.params.userId, messages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/companies", async (req, res) => {
  const { name, integrations, admin } = req.body || {};

  if (!name?.trim()) {
    return res.status(400).json({ error: "Nombre de empresa requerido" });
  }

  const validTypes = Object.keys(INTEGRATION_TYPES);
  const selected = (integrations || []).filter((t) => validTypes.includes(t));
  if (selected.length === 0) {
    return res.status(400).json({ error: "Seleccioná al menos una integración" });
  }

  if (!admin?.email || !admin?.password) {
    return res.status(400).json({ error: "Email y contraseña del admin requeridos" });
  }

  if (admin.password.length < 8) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
  }

  try {
    const result = await integrationStore.createCompany({
      name: name.trim(),
      integrations: selected,
      adminEmail: admin.email,
      adminPassword: admin.password,
    });

    res.status(201).json({
      company: result.company,
      admin: {
        id: result.admin.id,
        email: result.admin.email,
        role: result.admin.role,
      },
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "El email del admin ya existe" });
    }
    res.status(500).json({ error: error.message });
  }
});

router.get("/integration-fields", (_req, res) => {
  res.json({ types: INTEGRATION_TYPES });
});

router.get("/febros-tracking", (_req, res) => {
  res.json({
    url: config.febrosClientTrackingUrl || null,
    label: "Acceso seguimiento clientes febros",
  });
});

router.get("/video-generation", (_req, res) => {
  res.json(nvidiaCosmos.getMeta());
});

router.get("/video-generation/history", (_req, res) => {
  try {
    const history = nvidiaCosmos.listHistory(20);
    res.json({ history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/video-generation", (req, res) => {
  uploadVideoImage.single("image")(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({ error: uploadError.message });
    }

    if (!config.isNvidiaConfigured()) {
      return res.status(503).json({
        error:
          "NVIDIA_API_KEY no configurada. Agregala en Railway y redeploy.",
      });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({
        error: "Subí una imagen JPG/PNG (image → video).",
      });
    }

    const maxBytes = 190 * 1024;
    if (req.file.buffer.length > maxBytes) {
      return res.status(400).json({
        error:
          "La imagen supera ~190KB. Comprimila o usá una más chica (requisito de NVIDIA).",
      });
    }

    const imageDataUri = nvidiaCosmos.bufferToDataUri(
      req.file.buffer,
      req.file.mimetype || "image/jpeg"
    );

    try {
      const result = await nvidiaCosmos.generateVideo({
        imageDataUri,
        seed: req.body?.seed,
        cfgScale: req.body?.cfgScale || 1.8,
      });

      res.json({
        videoUrl: result.videoUrl,
        filename: result.filename,
        model: result.model,
        provider: result.provider,
        seed: result.seed ?? null,
        cfgScale: result.cfgScale ?? null,
      });
    } catch (error) {
      console.error(
        "[nvidia] video generation error:",
        error.message,
        error.nvidiaError || ""
      );
      const status =
        error.status && error.status >= 400 && error.status < 600
          ? error.status
          : 502;
      res.status(status).json({ error: error.message });
    }
  });
});

router.get("/leader-comment", async (_req, res) => {
  if (!isDatabaseEnabled()) {
    return res.status(503).json({ error: "Base de datos no configurada" });
  }

  try {
    const leader = await leaderCommentConfig.getConfig();
    res.json({
      leader,
      publicBaseUrl: config.publicBaseUrl,
      metaNote:
        "Suscribí el campo comments en Meta Developer para @febros.uy",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/leader-comment", async (req, res) => {
  if (!isDatabaseEnabled()) {
    return res.status(503).json({ error: "Base de datos no configurada" });
  }

  const { keyword, replyText, enabled } = req.body || {};

  if (!String(keyword || "").trim()) {
    return res.status(400).json({ error: "La palabra clave es requerida" });
  }
  if (!String(replyText || "").trim()) {
    return res.status(400).json({ error: "El texto de respuesta es requerido" });
  }

  try {
    const leader = await leaderCommentConfig.updateConfig({
      keyword,
      replyText,
      enabled: Boolean(enabled),
    });
    res.json({ leader, publicBaseUrl: config.publicBaseUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/leader-comment/pdf", (req, res) => {
  if (!isDatabaseEnabled()) {
    return res.status(503).json({ error: "Base de datos no configurada" });
  }

  uploadLeaderPdf.single("pdf")(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({ error: uploadError.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Archivo PDF requerido" });
    }

    try {
      const leader = await leaderCommentConfig.setPdf(
        req.file.filename,
        req.file.originalname
      );
      res.json({ leader, publicBaseUrl: config.publicBaseUrl });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
});

router.delete("/leader-comment/pdf", async (_req, res) => {
  if (!isDatabaseEnabled()) {
    return res.status(503).json({ error: "Base de datos no configurada" });
  }

  try {
    const leader = await leaderCommentConfig.removePdf();
    res.json({ leader });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
