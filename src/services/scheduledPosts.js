const path = require("path");
const fs = require("fs");
const { getPool, isDatabaseEnabled } = require("../db/pool");
const config = require("../config");
const { publishScheduledMedia } = require("./instagramPublish");
const {
  getUploadDir,
  ensureUploadDir,
  IMAGE_MIMES,
  VIDEO_MIMES,
} = require("../middleware/uploadScheduledMedia");

function requireDb() {
  if (!isDatabaseEnabled()) {
    throw Object.assign(new Error("Base de datos no configurada"), {
      status: 503,
    });
  }
}

function publicMediaUrl(filename) {
  const base = config.publicBaseUrl.replace(/\/$/, "");
  return `${base}/files/scheduled/${encodeURIComponent(filename)}`;
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.company_id,
    mediaType: row.media_type,
    caption: row.caption,
    filename: row.filename,
    originalName: row.original_name,
    mimeType: row.mime_type,
    mediaUrl: publicMediaUrl(row.filename),
    scheduledAt: row.scheduled_at,
    status: row.status,
    metaContainerId: row.meta_container_id,
    metaMediaId: row.meta_media_id,
    permalink: row.permalink,
    errorMessage: row.error_message,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

function validateCreateInput({ mediaType, mimeType, fileSize, scheduledAt }) {
  const type = String(mediaType || "IMAGE").toUpperCase();
  if (type !== "IMAGE" && type !== "REELS") {
    throw Object.assign(new Error("mediaType debe ser IMAGE o REELS"), {
      status: 400,
    });
  }

  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime())) {
    throw Object.assign(new Error("scheduledAt inválido"), { status: 400 });
  }
  if (when.getTime() < Date.now() - 60 * 1000) {
    throw Object.assign(
      new Error("La fecha/hora debe ser en el futuro"),
      { status: 400 }
    );
  }

  if (type === "IMAGE") {
    if (
      !IMAGE_MIMES.has(mimeType) &&
      !String(mimeType || "").startsWith("image/")
    ) {
      throw Object.assign(
        new Error("Para IMAGE subí JPG/PNG/WEBP"),
        { status: 400 }
      );
    }
    if (fileSize > 8 * 1024 * 1024) {
      throw Object.assign(new Error("La imagen no puede superar 8MB"), {
        status: 400,
      });
    }
  } else {
    if (
      !VIDEO_MIMES.has(mimeType) &&
      !String(mimeType || "").startsWith("video/")
    ) {
      throw Object.assign(new Error("Para REELS subí un video MP4/MOV"), {
        status: 400,
      });
    }
  }

  return { type, when };
}

async function listPosts(companyId, { limit = 50 } = {}) {
  requireDb();
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM scheduled_posts
     WHERE company_id = $1
     ORDER BY scheduled_at DESC
     LIMIT $2`,
    [String(companyId), Math.min(100, Number(limit) || 50)]
  );
  return rows.map(mapRow);
}

async function createPost({
  companyId,
  mediaType,
  caption,
  scheduledAt,
  file,
  createdBy,
}) {
  requireDb();
  if (!file?.filename) {
    throw Object.assign(new Error("Archivo media requerido"), { status: 400 });
  }

  const { type, when } = validateCreateInput({
    mediaType,
    mimeType: file.mimetype,
    fileSize: file.size,
    scheduledAt,
  });

  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO scheduled_posts
       (company_id, media_type, caption, filename, original_name, mime_type,
        scheduled_at, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
     RETURNING *`,
    [
      String(companyId),
      type,
      String(caption || "").slice(0, 2200),
      file.filename,
      file.originalname || null,
      file.mimetype || null,
      when.toISOString(),
      createdBy || null,
    ]
  );
  return mapRow(rows[0]);
}

async function cancelPost(companyId, postId) {
  requireDb();
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE scheduled_posts
     SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND company_id = $2 AND status = 'pending'
     RETURNING *`,
    [postId, String(companyId)]
  );
  if (!rows[0]) {
    throw Object.assign(
      new Error("Post no encontrado o ya no se puede cancelar"),
      { status: 404 }
    );
  }

  try {
    const filePath = path.join(getUploadDir(), rows[0].filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore cleanup errors
  }

  return mapRow(rows[0]);
}

async function claimDuePosts(limit = 3) {
  requireDb();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id FROM scheduled_posts
       WHERE status = 'pending' AND scheduled_at <= NOW()
       ORDER BY scheduled_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [Math.min(10, Number(limit) || 3)]
    );
    if (!rows.length) {
      await client.query("COMMIT");
      return [];
    }
    const ids = rows.map((r) => r.id);
    const { rows: claimed } = await client.query(
      `UPDATE scheduled_posts
       SET status = 'processing', updated_at = NOW(), error_message = NULL
       WHERE id = ANY($1::uuid[])
       RETURNING *`,
      [ids]
    );
    await client.query("COMMIT");
    return claimed.map(mapRow);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function markPublished(postId, { containerId, mediaId, permalink }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE scheduled_posts
     SET status = 'published',
         meta_container_id = $2,
         meta_media_id = $3,
         permalink = $4,
         published_at = NOW(),
         updated_at = NOW(),
         error_message = NULL
     WHERE id = $1
     RETURNING *`,
    [postId, containerId || null, mediaId || null, permalink || null]
  );
  return mapRow(rows[0]);
}

async function markFailed(postId, errorMessage) {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE scheduled_posts
     SET status = 'failed',
         error_message = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [postId, String(errorMessage || "Error desconocido").slice(0, 2000)]
  );
  return mapRow(rows[0]);
}

async function processPost(post) {
  const mediaUrl = publicMediaUrl(post.filename);
  const result = await publishScheduledMedia({
    companyId: post.companyId,
    mediaType: post.mediaType,
    mediaUrl,
    caption: post.caption,
  });
  return markPublished(post.id, {
    containerId: result.containerId,
    mediaId: result.mediaId,
    permalink: result.permalink,
  });
}

module.exports = {
  ensureUploadDir,
  getUploadDir,
  publicMediaUrl,
  listPosts,
  createPost,
  cancelPost,
  claimDuePosts,
  processPost,
  markFailed,
  markPublished,
};
