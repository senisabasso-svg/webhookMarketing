const express = require("express");
const { requireAuth } = require("../../services/auth");
const integrationStore = require("../../services/integrationStore");
const { getFieldsForType } = require("../../constants/integrationFields");
const defaultSystemPrompt = require("../../prompts/benjamin");

const router = express.Router();

router.use(requireAuth(["company_admin"]));

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
