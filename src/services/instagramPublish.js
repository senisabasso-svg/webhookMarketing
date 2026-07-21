const globalConfig = require("../config");
const { getTenantForCompany } = require("./instagramInsights");

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function graphRequest(tenant, method, path, { query = {}, body = null } = {}) {
  if (!tenant.isMetaTokenConfigured()) {
    throw Object.assign(
      new Error("metaAccessToken no configurado para esta empresa"),
      { status: 400 }
    );
  }

  const version =
    tenant.metaGraphVersion || globalConfig.metaGraphVersion || "v25.0";
  const base = tenant.graphBaseUrl();
  const url = new URL(`${base}/${version}${path}`);
  const params = { ...query, ...(body || {}) };
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }
  url.searchParams.set("access_token", tenant.metaAccessToken);

  const response = await fetch(url, {
    method,
    headers: { Accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error?.error_user_msg ||
      `Error Meta Graph ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.metaError = data?.error || data;
    if (
      String(message).toLowerCase().includes("permission") ||
      data?.error?.code === 10
    ) {
      err.message = `${message} — Revisá permiso instagram_content_publish / content publishing en la app Meta.`;
    }
    throw err;
  }

  return data;
}

async function resolveIgUserId(tenant) {
  if (tenant.igAccountId) return tenant.igAccountId;
  const me = await graphRequest(tenant, "GET", "/me", {
    query: { fields: "id,username" },
  });
  if (!me?.id) {
    throw Object.assign(new Error("No se pudo resolver igAccountId"), {
      status: 400,
    });
  }
  return me.id;
}

async function waitForContainerReady(tenant, containerId) {
  const started = Date.now();
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const status = await graphRequest(tenant, "GET", `/${containerId}`, {
      query: { fields: "status_code,status" },
    });
    const code = String(status.status_code || status.status || "").toUpperCase();
    if (code === "FINISHED" || code === "PUBLISHED") {
      return status;
    }
    if (code === "ERROR" || code === "EXPIRED") {
      throw new Error(
        `Contenedor Meta en estado ${code}. Revisá el archivo (formato/URL pública).`
      );
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("Timeout esperando que Meta procese el media (10 min)");
}

async function createMediaContainer(tenant, igUserId, { mediaType, mediaUrl, caption }) {
  if (mediaType === "REELS") {
    return graphRequest(tenant, "POST", `/${igUserId}/media`, {
      body: {
        media_type: "REELS",
        video_url: mediaUrl,
        caption: caption || "",
        share_to_feed: true,
      },
    });
  }

  return graphRequest(tenant, "POST", `/${igUserId}/media`, {
    body: {
      image_url: mediaUrl,
      caption: caption || "",
    },
  });
}

async function publishContainer(tenant, igUserId, creationId) {
  return graphRequest(tenant, "POST", `/${igUserId}/media_publish`, {
    body: { creation_id: creationId },
  });
}

async function fetchPermalink(tenant, mediaId) {
  try {
    const data = await graphRequest(tenant, "GET", `/${mediaId}`, {
      query: { fields: "id,permalink" },
    });
    return data.permalink || null;
  } catch {
    return null;
  }
}

/**
 * Publica un post IMAGE o REELS usando Content Publishing API.
 * mediaUrl debe ser HTTPS público alcanzable por Meta.
 */
async function publishScheduledMedia({
  companyId,
  mediaType,
  mediaUrl,
  caption,
}) {
  const { tenant, company } = await getTenantForCompany(companyId);
  const igUserId = await resolveIgUserId(tenant);
  const type = String(mediaType || "IMAGE").toUpperCase() === "REELS"
    ? "REELS"
    : "IMAGE";

  if (!mediaUrl || !/^https:\/\//i.test(mediaUrl)) {
    throw Object.assign(
      new Error(
        "La URL del media debe ser HTTPS público (configurá PUBLIC_BASE_URL en Railway)"
      ),
      { status: 400 }
    );
  }

  const container = await createMediaContainer(tenant, igUserId, {
    mediaType: type,
    mediaUrl,
    caption,
  });
  const creationId = container.id || container.creation_id;
  if (!creationId) {
    throw new Error("Meta no devolvió creation_id del contenedor");
  }

  await waitForContainerReady(tenant, creationId);

  const published = await publishContainer(tenant, igUserId, creationId);
  const mediaId = published.id;
  const permalink = mediaId
    ? await fetchPermalink(tenant, mediaId)
    : null;

  return {
    companyId: company.id,
    containerId: creationId,
    mediaId: mediaId || null,
    permalink,
    igUserId,
  };
}

module.exports = {
  publishScheduledMedia,
  graphRequest,
};
