const fs = require("fs");
const path = require("path");
const config = require("../config");
const { getPool, isDatabaseEnabled } = require("../db/pool");

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads", "leader");

function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function getPdfPublicUrl(filename) {
  if (!filename) return null;
  const base = config.publicBaseUrl.replace(/\/$/, "");
  return `${base}/files/leader/${encodeURIComponent(filename)}`;
}

async function getConfig() {
  if (!isDatabaseEnabled()) return null;

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT keyword, reply_text, pdf_filename, pdf_original_name, enabled, updated_at
     FROM leader_comment_config WHERE id = 1`
  );

  const row = rows[0];
  if (!row) return null;

  return {
    keyword: row.keyword || "",
    replyText: row.reply_text || "",
    pdfFilename: row.pdf_filename,
    pdfOriginalName: row.pdf_original_name,
    pdfUrl: getPdfPublicUrl(row.pdf_filename),
    enabled: row.enabled,
    updatedAt: row.updated_at,
  };
}

async function updateConfig({ keyword, replyText, enabled }) {
  if (!isDatabaseEnabled()) {
    throw new Error("Base de datos no configurada");
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE leader_comment_config
     SET keyword = $1,
         reply_text = $2,
         enabled = $3,
         updated_at = NOW()
     WHERE id = 1
     RETURNING keyword, reply_text, pdf_filename, pdf_original_name, enabled, updated_at`,
    [
      String(keyword || "").trim(),
      String(replyText || "").trim(),
      Boolean(enabled),
    ]
  );

  const row = rows[0];
  return {
    keyword: row.keyword,
    replyText: row.reply_text,
    pdfFilename: row.pdf_filename,
    pdfOriginalName: row.pdf_original_name,
    pdfUrl: getPdfPublicUrl(row.pdf_filename),
    enabled: row.enabled,
    updatedAt: row.updated_at,
  };
}

async function setPdf(filename, originalName) {
  if (!isDatabaseEnabled()) {
    throw new Error("Base de datos no configurada");
  }

  const pool = getPool();
  const existing = await pool.query(
    `SELECT pdf_filename FROM leader_comment_config WHERE id = 1`
  );
  const oldFile = existing.rows[0]?.pdf_filename;

  const { rows } = await pool.query(
    `UPDATE leader_comment_config
     SET pdf_filename = $1,
         pdf_original_name = $2,
         updated_at = NOW()
     WHERE id = 1
     RETURNING keyword, reply_text, pdf_filename, pdf_original_name, enabled, updated_at`,
    [filename, originalName]
  );

  if (oldFile && oldFile !== filename) {
    const oldPath = path.join(UPLOAD_DIR, oldFile);
    fs.unlink(oldPath, () => {});
  }

  const row = rows[0];
  return {
    keyword: row.keyword,
    replyText: row.reply_text,
    pdfFilename: row.pdf_filename,
    pdfOriginalName: row.pdf_original_name,
    pdfUrl: getPdfPublicUrl(row.pdf_filename),
    enabled: row.enabled,
    updatedAt: row.updated_at,
  };
}

async function removePdf() {
  if (!isDatabaseEnabled()) {
    throw new Error("Base de datos no configurada");
  }

  const pool = getPool();
  const existing = await pool.query(
    `SELECT pdf_filename FROM leader_comment_config WHERE id = 1`
  );
  const oldFile = existing.rows[0]?.pdf_filename;

  const { rows } = await pool.query(
    `UPDATE leader_comment_config
     SET pdf_filename = NULL,
         pdf_original_name = NULL,
         updated_at = NOW()
     WHERE id = 1
     RETURNING keyword, reply_text, pdf_filename, pdf_original_name, enabled, updated_at`
  );

  if (oldFile) {
    fs.unlink(path.join(UPLOAD_DIR, oldFile), () => {});
  }

  const row = rows[0];
  return {
    keyword: row.keyword,
    replyText: row.reply_text,
    pdfFilename: null,
    pdfOriginalName: null,
    pdfUrl: null,
    enabled: row.enabled,
    updatedAt: row.updated_at,
  };
}

function getUploadDir() {
  ensureUploadDir();
  return UPLOAD_DIR;
}

function matchesKeyword(commentText, keyword) {
  if (!keyword || !commentText) return false;
  const normalizedComment = commentText.toLowerCase().trim();
  const normalizedKeyword = keyword.toLowerCase().trim();
  return normalizedComment.includes(normalizedKeyword);
}

module.exports = {
  getConfig,
  updateConfig,
  setPdf,
  removePdf,
  getUploadDir,
  getPdfPublicUrl,
  matchesKeyword,
  ensureUploadDir,
};
