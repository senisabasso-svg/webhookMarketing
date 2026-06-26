const bcrypt = require("bcryptjs");
const config = require("../config");
const { getPool, isDatabaseEnabled } = require("./pool");

const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('superadmin', 'company_admin')),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('instagram', 'whatsapp')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  emitter_id VARCHAR(255),
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, type)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_integrations_emitter_type
  ON integrations(emitter_id, type)
  WHERE emitter_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id VARCHAR(64) NOT NULL,
  platform VARCHAR(32) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  role VARCHAR(16) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  message_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_lookup
  ON conversation_messages(company_id, platform, user_id, created_at DESC);
`;

async function seedSuperAdmin(client) {
  const email = config.superadminEmail;
  const password = config.superadminPassword;
  if (!email || !password) return;

  const existing = await client.query(
    "SELECT id FROM users WHERE email = $1",
    [email.toLowerCase()]
  );
  if (existing.rows.length > 0) return;

  const passwordHash = await bcrypt.hash(password, 12);
  await client.query(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, 'superadmin')`,
    [email.toLowerCase(), passwordHash]
  );
  console.log("[db] Superadmin creado:", email);
}

async function migrate() {
  if (!isDatabaseEnabled()) {
    console.log("[db] DATABASE_URL no configurada — panel admin deshabilitado");
    return;
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query(SCHEMA);
    await seedSuperAdmin(client);
    console.log("[db] Migraciones aplicadas");
  } finally {
    client.release();
  }
}

module.exports = { migrate };
