const express = require("express");
const { requireAuth } = require("../../services/auth");
const integrationStore = require("../../services/integrationStore");
const { getFieldsForType } = require("../../constants/integrationFields");
const defaultSystemPrompt = require("../../prompts/benjamin");
const instagramInsights = require("../../services/instagramInsights");
const companyGrowthContext = require("../../services/companyGrowthContext");
const conversationHistory = require("../../services/conversationHistory");
const scheduledPosts = require("../../services/scheduledPosts");
const {
  uploadScheduledMedia,
} = require("../../middleware/uploadScheduledMedia");
const {
  handleCreateScheduledPost,
} = require("../helpers/scheduledPostsHandlers");
const nvidiaChat = require("../../services/nvidiaChat");
const config = require("../../config");
const { resolveProvider } = require("../../services/ai");

const router = express.Router();

router.use(requireAuth(["company_admin"]));

router.get("/ai-chat", async (req, res) => {
  res.json({
    configured: config.isNvidiaConfigured(),
    provider: resolveProvider(),
    model: config.nvidiaChatModel,
    baseUrl: config.nvidiaChatBaseUrl,
    aiProviderEnv: config.aiProvider,
    companyId: req.user.company_id,
    companyName: req.user.company_name || null,
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
    const forceRefresh = Boolean(req.body?.refreshContext);
    const context = await companyGrowthContext.getGrowthContextSafe(
      req.user.company_id,
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
    console.error("[company-ai-chat] error:", error.message);
    const status =
      error.status && error.status >= 400 && error.status < 600
        ? error.status
        : 502;
    res.status(status).json({ error: error.message });
  }
});

router.get("/company", async (req, res) => {
  try {
    const company = await integrationStore.getCompanyById(req.user.company_id);
    if (!company) return res.status(404).json({ error: "Empresa no encontrada" });

    const pool = require("../../db/pool").getPool();
    const { rows } = await pool.query(
      `SELECT type, enabled, emitter_id, updated_at FROM integrations WHERE company_id = $1`,
      [company.id]
    );

    res.json({ company, integrations: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/instagram/insights", async (req, res) => {
  try {
    const data = await instagramInsights.getCompanyInsights(req.user.company_id);
    res.json(data);
  } catch (error) {
    const status = error.status && error.status >= 400 ? error.status : 502;
    res.status(status).json({
      error: error.message,
      metaError: error.metaError || null,
    });
  }
});

router.get("/instagram/conversations", async (req, res) => {
  try {
    const conversations = await conversationHistory.listConversations(
      req.user.company_id,
      "instagram"
    );
    res.json({ conversations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/instagram/conversations/:userId", async (req, res) => {
  try {
    const messages = await conversationHistory.getConversationThread(
      req.user.company_id,
      "instagram",
      req.params.userId
    );
    res.json({ userId: req.params.userId, messages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/instagram/scheduled-posts", async (req, res) => {
  try {
    const posts = await scheduledPosts.listPosts(req.user.company_id);
    res.json({ posts, publicBaseUrl: config.publicBaseUrl });
  } catch (error) {
    const status = error.status && error.status >= 400 ? error.status : 500;
    res.status(status).json({ error: error.message });
  }
});

router.post(
  "/instagram/scheduled-posts",
  (req, res, next) => {
    uploadScheduledMedia.single("media")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  },
  (req, res) =>
    handleCreateScheduledPost(req.user.company_id, req.user.email)(req, res)
);

router.delete("/instagram/scheduled-posts/:id", async (req, res) => {
  try {
    const post = await scheduledPosts.cancelPost(
      req.user.company_id,
      req.params.id
    );
    res.json({ post });
  } catch (error) {
    const status = error.status && error.status >= 400 ? error.status : 500;
    res.status(status).json({ error: error.message });
  }
});

router.get("/integrations/:type", async (req, res) => {
  const { type } = req.params;
  const fields = getFieldsForType(type);
  if (!fields.length) return res.status(400).json({ error: "Tipo inválido" });

  try {
    const integration = await integrationStore.getIntegration(
      req.user.company_id,
      type
    );
    if (!integration) {
      return res.status(404).json({ error: "Integración no habilitada para esta empresa" });
    }

    const config = { ...integration.config };
    if (!config.geminiSystemPrompt) {
      config.geminiSystemPrompt = defaultSystemPrompt;
    }

    res.json({
      type,
      enabled: integration.enabled,
      emitterId: integration.emitter_id,
      config,
      fields,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/integrations/:type", async (req, res) => {
  const { type } = req.params;
  const fields = getFieldsForType(type);
  if (!fields.length) return res.status(400).json({ error: "Tipo inválido" });

  const input = req.body?.config || req.body || {};
  const config = {};

  for (const field of fields) {
    if (input[field.key] !== undefined && input[field.key] !== null) {
      config[field.key] = String(input[field.key]).trim();
    } else if (field.default !== undefined) {
      config[field.key] = field.default;
    }
  }

  for (const field of fields) {
    if (field.required && !config[field.key]) {
      return res.status(400).json({ error: `Campo requerido: ${field.label}` });
    }
  }

  try {
    const updated = await integrationStore.updateIntegration(
      req.user.company_id,
      type,
      config
    );

    res.json({
      ok: true,
      emitterId: updated.emitter_id,
      updatedAt: updated.updated_at,
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: "Ese id emisor ya está registrado en otra empresa",
      });
    }
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
