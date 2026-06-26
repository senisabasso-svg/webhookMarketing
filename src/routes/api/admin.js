const express = require("express");
const { requireAuth } = require("../../services/auth");
const config = require("../../config");
const integrationStore = require("../../services/integrationStore");
const { INTEGRATION_TYPES } = require("../../constants/integrationFields");

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

module.exports = router;
