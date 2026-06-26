const { getPool, isDatabaseEnabled } = require("../db/pool");
const { getEmitterFromConfig } = require("../constants/integrationFields");
const { buildTenantConfig } = require("./tenantConfig");

let cache = {
  byEmitter: new Map(),
  verifyTokens: new Set(),
  appSecrets: new Set(),
  loadedAt: 0,
};

const CACHE_TTL_MS = 30_000;

function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function refreshCache() {
  if (!isDatabaseEnabled()) return;

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT i.*, c.name AS company_name
     FROM integrations i
     JOIN companies c ON c.id = i.company_id
     WHERE i.enabled = TRUE`
  );

  const byEmitter = new Map();
  const verifyTokens = new Set();
  const appSecrets = new Set();

  for (const row of rows) {
    const config = row.config || {};
    const emitterId = row.emitter_id || getEmitterFromConfig(row.type, config);

    if (emitterId) {
      byEmitter.set(`${row.type}:${emitterId}`, row);
    }

    if (row.type === "instagram" && config.verifyToken) {
      verifyTokens.add(config.verifyToken);
    }
    if (row.type === "whatsapp") {
      if (config.whatsappVerifyToken) verifyTokens.add(config.whatsappVerifyToken);
      if (config.verifyToken) verifyTokens.add(config.verifyToken);
    }
    if (config.metaAppSecret) appSecrets.add(config.metaAppSecret);
    if (config.igAppSecret) appSecrets.add(config.igAppSecret);
  }

  cache = { byEmitter, verifyTokens, appSecrets, loadedAt: Date.now() };
}

async function ensureCache() {
  if (!isDatabaseEnabled()) return;
  if (Date.now() - cache.loadedAt > CACHE_TTL_MS) {
    await refreshCache();
  }
}

async function invalidateCache() {
  cache.loadedAt = 0;
  await refreshCache();
}

function rowToTenant(row) {
  return buildTenantConfig({
    companyId: row.company_id,
    companyName: row.company_name,
    source: "database",
    type: row.type,
    config: row.config || {},
  });
}

async function findByEmitter(type, emitterId) {
  if (!emitterId || !isDatabaseEnabled()) return null;
  await ensureCache();
  const row = cache.byEmitter.get(`${type}:${emitterId}`);
  return row ? rowToTenant(row) : null;
}

async function getAllVerifyTokens() {
  await ensureCache();
  return cache.verifyTokens;
}

async function getAllAppSecrets() {
  await ensureCache();
  return cache.appSecrets;
}

async function listCompanies() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.slug, c.created_at,
            COALESCE(
              json_agg(
                json_build_object(
                  'type', i.type,
                  'enabled', i.enabled,
                  'emitter_id', i.emitter_id
                )
              ) FILTER (WHERE i.id IS NOT NULL),
              '[]'
            ) AS integrations
     FROM companies c
     LEFT JOIN integrations i ON i.company_id = c.id
     GROUP BY c.id
     ORDER BY c.created_at DESC`
  );
  return rows;
}

async function getCompanyById(companyId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, name, slug, created_at FROM companies WHERE id = $1`,
    [companyId]
  );
  return rows[0] || null;
}

async function getIntegration(companyId, type) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT i.*, c.name AS company_name
     FROM integrations i
     JOIN companies c ON c.id = i.company_id
     WHERE i.company_id = $1 AND i.type = $2`,
    [companyId, type]
  );
  return rows[0] || null;
}

async function createCompany({ name, integrations, adminEmail, adminPassword }) {
  const pool = getPool();
  const bcrypt = require("bcryptjs");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let slug = slugify(name);
    const slugCheck = await client.query(
      "SELECT id FROM companies WHERE slug = $1",
      [slug]
    );
    if (slugCheck.rows.length > 0) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const companyResult = await client.query(
      `INSERT INTO companies (name, slug) VALUES ($1, $2) RETURNING *`,
      [name, slug]
    );
    const company = companyResult.rows[0];

    for (const type of integrations) {
      await client.query(
        `INSERT INTO integrations (company_id, type, enabled, config)
         VALUES ($1, $2, TRUE, '{}')`,
        [company.id, type]
      );
    }

    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, role, company_id)
       VALUES ($1, $2, 'company_admin', $3)
       RETURNING id, email, role, company_id`,
      [adminEmail.toLowerCase(), passwordHash, company.id]
    );

    await client.query("COMMIT");
    await invalidateCache();

    return { company, admin: userResult.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function updateIntegration(companyId, type, config) {
  const pool = getPool();
  const emitterId = getEmitterFromConfig(type, config);

  const { rows } = await pool.query(
    `UPDATE integrations
     SET config = $3::jsonb,
         emitter_id = $4,
         updated_at = NOW()
     WHERE company_id = $1 AND type = $2
     RETURNING *`,
    [companyId, type, JSON.stringify(config), emitterId]
  );

  if (!rows[0]) {
    throw new Error("Integración no encontrada");
  }

  await invalidateCache();
  return rows[0];
}

module.exports = {
  slugify,
  refreshCache,
  invalidateCache,
  findByEmitter,
  getAllVerifyTokens,
  getAllAppSecrets,
  listCompanies,
  getCompanyById,
  getIntegration,
  createCompany,
  updateIntegration,
  rowToTenant,
};
