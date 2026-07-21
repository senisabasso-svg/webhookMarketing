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

const MAX_CAROUSEL = 10;

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

/** URL relativa para el panel (mismo origen; no depende de PUBLIC_BASE_URL). */
function previewMediaUrl(filename) {
  return `/files/scheduled/${encodeURIComponent(filename)}`;
}

function resolveFilenames(row) {
  if (Array.isArray(row.filenames) && row.filenames.length) {
    return row.filenames.map(String);
  }
  if (row.filenames && typeof row.filenames === "object") {
    // pg a veces devuelve objetos indexados
    const values = Object.values(row.filenames).map(String).filter(Boolean);
    if (values.length) return values;
  }
  if (typeof row.filenames === "string") {
    try {
      const parsed = JSON.parse(row.filenames);
      if (Array.isArray(parsed) && parsed.length) return parsed.map(String);
    } catch {
      /* ignore */
    }
  }
  return row.filename ? [String(row.filename)] : [];
}

function mapRow(row) {
  if (!row) return null;
  const filenames = resolveFilenames(row);
  return {
    id: row.id,
    companyId: row.company_id,
    mediaType: row.media_type,
    caption: row.caption,
    filename: filenames[0] || row.filename,
    filenames,
    mediaCount: filenames.length,
    originalName: row.original_name,
    mimeType: row.mime_type,
    mediaUrl: filenames[0] ? publicMediaUrl(filenames[0]) : null,
    mediaUrls: filenames.map(publicMediaUrl),
    previewUrl: filenames[0] ? previewMediaUrl(filenames[0]) : null,
    previewUrls: filenames.map(previewMediaUrl),
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

function validateFiles({ mediaType, files, scheduledAt }) {
  const requested = String(mediaType || "IMAGE").toUpperCase();
  if (!["IMAGE", "REELS", "CAROUSEL"].includes(requested)) {
    throw Object.assign(new Error("mediaType debe ser IMAGE o REELS"), {
      status: 400,
    });
  }

  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime())) {
    throw Object.assign(new Error("scheduledAt inválido"), { status: 400 });
  }
  if (when.getTime() < Date.now() - 60 * 1000) {
    throw Object.assign(new Error("La fecha/hora debe ser en el futuro"), {
      status: 400,
    });
  }

  if (!files?.length) {
    throw Object.assign(new Error("Archivo media requerido"), { status: 400 });
  }

  if (requested === "REELS") {
    if (files.length !== 1) {
      throw Object.assign(new Error("REELS acepta un solo video"), {
        status: 400,
      });
    }
    const file = files[0];
    if (
      !VIDEO_MIMES.has(file.mimetype) &&
      !String(file.mimetype || "").startsWith("video/")
    ) {
      throw Object.assign(new Error("Para REELS subí un video MP4/MOV"), {
        status: 400,
      });
    }
    return { type: "REELS", when, files };
  }

  if (files.length > MAX_CAROUSEL) {
    throw Object.assign(
      new Error(`Máximo ${MAX_CAROUSEL} fotos por carrusel`),
      { status: 400 }
    );
  }

  for (const file of files) {
    if (
      !IMAGE_MIMES.has(file.mimetype) &&
      !String(file.mimetype || "").startsWith("image/")
    ) {
      throw Object.assign(
        new Error("Para feed/carrusel subí solo JPG/PNG/WEBP"),
        { status: 400 }
      );
    }
    if (file.size > 8 * 1024 * 1024) {
      throw Object.assign(new Error("Cada imagen no puede superar 8MB"), {
        status: 400,
      });
    }
  }

  const type = files.length > 1 ? "CAROUSEL" : "IMAGE";
  return { type, when, files };
}

function unlinkFiles(files) {
  for (const file of files || []) {
    try {
      if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch {
      /* ignore */
    }
  }
}

function unlinkFilenames(filenames) {
  for (const name of filenames || []) {
    try {
      const filePath = path.join(getUploadDir(), name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      /* ignore */
    }
  }
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
  files,
  createdBy,
}) {
  requireDb();
  const list = Array.isArray(files) && files.length
    ? files
    : file
      ? [file]
      : [];

  const { type, when, files: validFiles } = validateFiles({
    mediaType,
    files: list,
    scheduledAt,
  });

  const filenames = validFiles.map((f) => f.filename);
  const first = validFiles[0];
  const originalNames = validFiles
    .map((f) => f.originalname)
    .filter(Boolean)
    .join(" | ");

  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO scheduled_posts
       (company_id, media_type, caption, filename, filenames, original_name, mime_type,
        scheduled_at, status, created_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, 'pending', $9)
     RETURNING *`,
    [
      String(companyId),
      type,
      String(caption || "").slice(0, 2200),
      filenames[0],
      JSON.stringify(filenames),
      originalNames || null,
      first.mimetype || null,
      when.toISOString(),
      createdBy || null,
    ]
  );
  return mapRow(rows[0]);
}

async function getPost(companyId, postId) {
  requireDb();
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM scheduled_posts WHERE id = $1 AND company_id = $2`,
    [postId, String(companyId)]
  );
  if (!rows[0]) {
    throw Object.assign(new Error("Post no encontrado"), { status: 404 });
  }
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

  unlinkFilenames(resolveFilenames(rows[0]));
  return mapRow(rows[0]);
}

/**
 * Edita un post pending o failed.
 * Si vienen files nuevos, reemplazan el media anterior.
 * Al guardar, status vuelve a pending.
 */
async function updatePost(companyId, postId, {
  caption,
  scheduledAt,
  mediaType,
  files,
} = {}) {
  requireDb();
  const pool = getPool();
  const { rows: existingRows } = await pool.query(
    `SELECT * FROM scheduled_posts
     WHERE id = $1 AND company_id = $2
       AND status IN ('pending', 'failed')`,
    [postId, String(companyId)]
  );
  const existing = existingRows[0];
  if (!existing) {
    throw Object.assign(
      new Error("Post no encontrado o ya no se puede editar (solo pending/failed)"),
      { status: 404 }
    );
  }

  const nextCaption =
    caption !== undefined
      ? String(caption || "").slice(0, 2200)
      : existing.caption;

  let nextWhen = existing.scheduled_at;
  if (scheduledAt !== undefined && scheduledAt !== null && scheduledAt !== "") {
    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime())) {
      throw Object.assign(new Error("scheduledAt inválido"), { status: 400 });
    }
    if (when.getTime() < Date.now() - 60 * 1000) {
      throw Object.assign(new Error("La fecha/hora debe ser en el futuro"), {
        status: 400,
      });
    }
    nextWhen = when.toISOString();
  }

  let nextType = existing.media_type;
  let nextFilename = existing.filename;
  let nextFilenames = resolveFilenames(existing);
  let nextOriginal = existing.original_name;
  let nextMime = existing.mime_type;
  let oldFilenamesToDelete = null;

  const list = Array.isArray(files) ? files.filter(Boolean) : [];
  if (list.length) {
    const { type, files: validFiles } = validateFiles({
      mediaType: mediaType || (list[0].mimetype?.startsWith("video/") ? "REELS" : "IMAGE"),
      files: list,
      scheduledAt: nextWhen,
    });
    oldFilenamesToDelete = nextFilenames;
    nextType = type;
    nextFilenames = validFiles.map((f) => f.filename);
    nextFilename = nextFilenames[0];
    nextOriginal = validFiles
      .map((f) => f.originalname)
      .filter(Boolean)
      .join(" | ");
    nextMime = validFiles[0].mimetype || null;
  } else if (mediaType) {
    const requested = String(mediaType).toUpperCase();
    if (requested === "REELS" && nextType !== "REELS") {
      throw Object.assign(
        new Error("Para pasar a Reel subí un video nuevo"),
        { status: 400 }
      );
    }
    if (
      (requested === "IMAGE" || requested === "CAROUSEL") &&
      nextType === "REELS"
    ) {
      throw Object.assign(
        new Error("Para pasar a imagen/carrusel subí fotos nuevas"),
        { status: 400 }
      );
    }
  }

  const { rows } = await pool.query(
    `UPDATE scheduled_posts
     SET caption = $3,
         scheduled_at = $4,
         media_type = $5,
         filename = $6,
         filenames = $7::jsonb,
         original_name = $8,
         mime_type = $9,
         status = 'pending',
         error_message = NULL,
         updated_at = NOW()
     WHERE id = $1 AND company_id = $2
       AND status IN ('pending', 'failed')
     RETURNING *`,
    [
      postId,
      String(companyId),
      nextCaption,
      nextWhen,
      nextType,
      nextFilename,
      JSON.stringify(nextFilenames),
      nextOriginal,
      nextMime,
    ]
  );

  if (!rows[0]) {
    throw Object.assign(new Error("No se pudo actualizar el post"), {
      status: 409,
    });
  }

  if (oldFilenamesToDelete?.length) {
    unlinkFilenames(oldFilenamesToDelete);
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
  const filenames =
    Array.isArray(post.filenames) && post.filenames.length
      ? post.filenames
      : post.filename
        ? [post.filename]
        : [];
  const mediaUrls = filenames.map(publicMediaUrl);
  const result = await publishScheduledMedia({
    companyId: post.companyId,
    mediaType: post.mediaType,
    mediaUrls,
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
  getPost,
  createPost,
  updatePost,
  cancelPost,
  claimDuePosts,
  processPost,
  markFailed,
  markPublished,
  unlinkFiles,
  MAX_CAROUSEL,
};
