const express = require("express");
const { requireAuth } = require("../../services/auth");
const config = require("../../config");
const integrationStore = require("../../services/integrationStore");
const { INTEGRATION_TYPES } = require("../../constants/integrationFields");
const leaderCommentConfig = require("../../services/leaderCommentConfig");
const { uploadLeaderPdf } = require("../../middleware/uploadLeaderPdf");
const { uploadVideoImage } = require("../../middleware/uploadVideoImage");
const nvidiaCosmos = require("../../services/nvidiaCosmos");
const { isDatabaseEnabled } = require("../../db/pool");

const router = express.Router();

router.use(requireAuth(["superadmin"]));

router.get("/companies", async (_req, res) => {
  try {
    const companies = await integrationStore.listCompanies();
    res.json({ companies });
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
  res.json({
    configured: config.isNvidiaConfigured(),
    model: config.nvidiaVideoModel,
    baseUrl: config.nvidiaBaseUrl,
    resolutions: ["720_16_9", "1080_16_9"],
    maxFrames: 189,
  });
});

router.post("/video-generation", (req, res) => {
  uploadVideoImage.single("image")(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({ error: uploadError.message });
    }

    if (!config.isNvidiaConfigured()) {
      return res.status(503).json({
        error:
          "NVIDIA_API_KEY no configurada. Agregala al .env y reiniciá el servidor.",
      });
    }

    const prompt = req.body?.prompt;
    if (!String(prompt || "").trim()) {
      return res.status(400).json({ error: "El prompt es requerido" });
    }

    let imageDataUri = null;
    if (req.file?.buffer) {
      imageDataUri = nvidiaCosmos.bufferToDataUri(
        req.file.buffer,
        req.file.mimetype || "image/jpeg"
      );
    }

    try {
      const result = await nvidiaCosmos.generateVideo({
        prompt,
        imageDataUri,
        resolution: req.body?.resolution || "720_16_9",
        numOutputFrames: req.body?.numOutputFrames || 120,
        seed: req.body?.seed,
        negativePrompt: req.body?.negativePrompt || "",
      });

      res.json({
        videoUrl: result.videoUrl,
        filename: result.filename,
        resolution: result.resolution,
        numOutputFrames: result.numOutputFrames,
        model: result.model,
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
