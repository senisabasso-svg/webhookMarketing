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

CREATE TABLE IF NOT EXISTS leader_comment_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  keyword VARCHAR(255) NOT NULL DEFAULT '',
  reply_text TEXT NOT NULL DEFAULT '',
  pdf_filename VARCHAR(512),
  pdf_original_name VARCHAR(255),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO leader_comment_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id VARCHAR(64) NOT NULL,
  media_type VARCHAR(16) NOT NULL CHECK (media_type IN ('IMAGE', 'REELS', 'CAROUSEL')),
  caption TEXT NOT NULL DEFAULT '',
  filename VARCHAR(512) NOT NULL,
  filenames JSONB,
  original_name VARCHAR(255),
  mime_type VARCHAR(128),
  scheduled_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'published', 'failed', 'cancelled')),
  meta_container_id VARCHAR(255),
  meta_media_id VARCHAR(255),
  permalink TEXT,
  error_message TEXT,
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_due
  ON scheduled_posts(status, scheduled_at);
`;

const SCHEMA_PATCHES = `
ALTER TABLE scheduled_posts
  ADD COLUMN IF NOT EXISTS filenames JSONB;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'scheduled_posts'
      AND constraint_name = 'scheduled_posts_media_type_check'
  ) THEN
    ALTER TABLE scheduled_posts DROP CONSTRAINT scheduled_posts_media_type_check;
  END IF;
END $$;

ALTER TABLE scheduled_posts
  ADD CONSTRAINT scheduled_posts_media_type_check
  CHECK (media_type IN ('IMAGE', 'REELS', 'CAROUSEL'));
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
    await client.query(SCHEMA_PATCHES);
    await seedSuperAdmin(client);
    console.log("[db] Migraciones aplicadas");
  } finally {
    client.release();
  }
}

module.exports = { migrate };
