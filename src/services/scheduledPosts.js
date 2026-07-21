const { getPool, isDatabaseEnabled } = require("../db/pool");
const config = require("../config");
const { publishScheduledMedia } = require("./instagramPublish");
const {
  IMAGE_MIMES,
  VIDEO_MIMES,
  makeStoredFilename,
} = require("../middleware/uploadScheduledMedia");

const MAX_CAROUSEL = 10;

function requireDb() {
  if (!isDatabaseEnabled()) {
    throw Object.assign(new Error("Base de datos no configurada"), {
      status: 503,
    });
  }
}

function tokenPublicUrl(token) {
  const base = config.publicBaseUrl.replace(/\/$/, "");
  return `${base}/files/scheduled-media/${token}`;
}

function tokenPreviewUrl(token) {
  return `/files/scheduled-media/${token}`;
}

function parseMediaItems(row) {
  const raw = row.media_items;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapRow(row) {
  if (!row) return null;
  const items = parseMediaItems(row).sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  );
  const tokens = items.map((i) => i.token).filter(Boolean);
  const filenames = items.map((i) => i.filename).filter(Boolean);

  return {
    id: row.id,
    companyId: row.company_id,
    mediaType: row.media_type,
    caption: row.caption,
    filename: filenames[0] || row.filename,
    filenames: filenames.length ? filenames : null,
    mediaCount: tokens.length || 1,
    originalName: row.original_name,
    mimeType: items[0]?.mimeType || row.mime_type,
    mediaUrl: tokens[0] ? tokenPublicUrl(tokens[0]) : null,
    mediaUrls: tokens.map(tokenPublicUrl),
    previewUrl: tokens[0] ? tokenPreviewUrl(tokens[0]) : null,
    previewUrls: tokens.map(tokenPreviewUrl),
    mediaTokens: tokens,
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

const MEDIA_SELECT = `
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'token', m.public_token,
          'mimeType', m.mime_type,
          'filename', m.filename,
          'sortOrder', m.sort_order
        )
        ORDER BY m.sort_order ASC
      )
      FROM scheduled_post_media m
      WHERE m.post_id = p.id
    ),
    '[]'::json
  ) AS media_items
`;

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
    if ((file.size || file.buffer?.length || 0) > 8 * 1024 * 1024) {
      throw Object.assign(new Error("Cada imagen no puede superar 8MB"), {
        status: 400,
      });
    }
  }

  const type = files.length > 1 ? "CAROUSEL" : "IMAGE";
  return { type, when, files };
}

function fileBuffer(file) {
  if (file?.buffer) return file.buffer;
  throw Object.assign(new Error("Archivo sin datos en memoria"), { status: 400 });
}

async function insertMediaRows(client, postId, files) {
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const filename = makeStoredFilename(file, i);
    await client.query(
      `INSERT INTO scheduled_post_media
         (post_id, sort_order, filename, original_name, mime_type, data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        postId,
        i,
        filename,
        file.originalname || null,
        file.mimetype || null,
        fileBuffer(file),
      ]
    );
  }
}

async function listPosts(companyId, { limit = 50 } = {}) {
  requireDb();
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT p.*, ${MEDIA_SELECT}
     FROM scheduled_posts p
     WHERE p.company_id = $1
     ORDER BY p.scheduled_at DESC
     LIMIT $2`,
    [String(companyId), Math.min(100, Number(limit) || 50)]
  );
  return rows.map(mapRow);
}

async function getPost(companyId, postId) {
  requireDb();
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT p.*, ${MEDIA_SELECT}
     FROM scheduled_posts p
     WHERE p.id = $1 AND p.company_id = $2`,
    [postId, String(companyId)]
  );
  if (!rows[0]) {
    throw Object.assign(new Error("Post no encontrado"), { status: 404 });
  }
  return mapRow(rows[0]);
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

  const first = validFiles[0];
  const filenames = validFiles.map((f, i) => makeStoredFilename(f, i));
  const originalNames = validFiles
    .map((f) => f.originalname)
    .filter(Boolean)
    .join(" | ");

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
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
    await insertMediaRows(client, rows[0].id, validFiles);
    await client.query("COMMIT");
    return getPost(companyId, rows[0].id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Elimina post pendiente/fallido y su media en DB. */
async function deletePost(companyId, postId) {
  requireDb();
  const pool = getPool();
  const { rows } = await pool.query(
    `DELETE FROM scheduled_posts
     WHERE id = $1 AND company_id = $2
       AND status IN ('pending', 'failed')
     RETURNING id`,
    [postId, String(companyId)]
  );
  if (!rows[0]) {
    throw Object.assign(
      new Error("Post no encontrado o ya no se puede eliminar (solo pending/failed)"),
      { status: 404 }
    );
  }
  return { deleted: true, id: rows[0].id };
}

// alias histórico
async function cancelPost(companyId, postId) {
  return deletePost(companyId, postId);
}

async function updatePost(companyId, postId, {
  caption,
  scheduledAt,
  mediaType,
  files,
} = {}) {
  requireDb();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: existingRows } = await client.query(
      `SELECT * FROM scheduled_posts
       WHERE id = $1 AND company_id = $2
         AND status IN ('pending', 'failed')
       FOR UPDATE`,
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
    let nextFilenamesJson = existing.filenames;
    let nextOriginal = existing.original_name;
    let nextMime = existing.mime_type;

    const list = Array.isArray(files) ? files.filter(Boolean) : [];
    if (list.length) {
      const { type, files: validFiles } = validateFiles({
        mediaType:
          mediaType ||
          (list[0].mimetype?.startsWith("video/") ? "REELS" : "IMAGE"),
        files: list,
        scheduledAt: nextWhen,
      });
      nextType = type;
      const names = validFiles.map((f, i) => makeStoredFilename(f, i));
      nextFilename = names[0];
      nextFilenamesJson = names;
      nextOriginal = validFiles
        .map((f) => f.originalname)
        .filter(Boolean)
        .join(" | ");
      nextMime = validFiles[0].mimetype || null;

      await client.query(`DELETE FROM scheduled_post_media WHERE post_id = $1`, [
        postId,
      ]);
      await insertMediaRows(client, postId, validFiles);
    } else {
      const { rows: mediaCount } = await client.query(
        `SELECT COUNT(*)::int AS c FROM scheduled_post_media WHERE post_id = $1`,
        [postId]
      );
      if (!mediaCount[0]?.c) {
        throw Object.assign(
          new Error(
            "Este post no tiene media en la base. Subí las fotos/video de nuevo al editar."
          ),
          { status: 400 }
        );
      }
    }

    await client.query(
      `UPDATE scheduled_posts
       SET caption = $3,
           scheduled_at = $4,
           media_type = $5,
           filename = $6,
           filenames = COALESCE($7::jsonb, filenames),
           original_name = $8,
           mime_type = $9,
           status = 'pending',
           error_message = NULL,
           updated_at = NOW()
       WHERE id = $1 AND company_id = $2`,
      [
        postId,
        String(companyId),
        nextCaption,
        nextWhen,
        nextType,
        nextFilename,
        list.length ? JSON.stringify(nextFilenamesJson) : null,
        nextOriginal,
        nextMime,
      ]
    );
    await client.query("COMMIT");
    return getPost(companyId, postId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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
       RETURNING id, company_id`,
      [ids]
    );
    await client.query("COMMIT");

    const out = [];
    for (const row of claimed) {
      out.push(await getPost(row.company_id, row.id));
    }
    return out;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function markPublished(postId, { containerId, mediaId, permalink }) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
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
    // Liberar espacio: media ya no hace falta tras publicar
    await client.query(`DELETE FROM scheduled_post_media WHERE post_id = $1`, [
      postId,
    ]);
    await client.query("COMMIT");
    return mapRow({ ...rows[0], media_items: [] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function markFailed(postId, errorMessage) {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE scheduled_posts
     SET status = 'failed',
         error_message = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, company_id`,
    [postId, String(errorMessage || "Error desconocido").slice(0, 2000)]
  );
  if (!rows[0]) return null;
  return getPost(rows[0].company_id, rows[0].id);
}

async function processPost(post) {
  const mediaUrls = post.mediaUrls || [];
  if (!mediaUrls.length) {
    throw new Error(
      "No hay media en base de datos para este post. Editá y volvé a subir las fotos."
    );
  }
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

async function getMediaByToken(token) {
  requireDb();
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT mime_type, filename, original_name, data
     FROM scheduled_post_media
     WHERE public_token = $1`,
    [String(token)]
  );
  if (!rows[0]) {
    throw Object.assign(new Error("Media no encontrada"), { status: 404 });
  }
  return {
    mimeType: rows[0].mime_type || "application/octet-stream",
    filename: rows[0].filename || rows[0].original_name || "media",
    data: rows[0].data,
  };
}

function unlinkFiles() {
  // memoryStorage: nada que borrar en disco
}

module.exports = {
  ensureUploadDir: () => {},
  getUploadDir: () => null,
  listPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  cancelPost,
  claimDuePosts,
  processPost,
  markFailed,
  markPublished,
  getMediaByToken,
  unlinkFiles,
  MAX_CAROUSEL,
};
