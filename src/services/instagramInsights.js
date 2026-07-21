const { buildTenantConfig } = require("./tenantConfig");
const {
  getIntegration,
  getCompanyById,
  rowToTenant,
} = require("./integrationStore");
const globalConfig = require("../config");
const { getLegacyInstagramConfig } = require("./tenantConfig");

const MEDIA_LIMIT = 25;

function insightValue(insightsPayload, metricName) {
  const items = insightsPayload?.data || [];
  const found = items.find((m) => m.name === metricName);
  if (!found) return null;
  if (found.values?.[0]?.value != null) return found.values[0].value;
  if (found.total_value?.value != null) return found.total_value.value;
  return null;
}

async function graphGet(tenant, path, params = {}) {
  if (!tenant.isMetaTokenConfigured()) {
    throw new Error("metaAccessToken no configurado para esta empresa");
  }

  const version = tenant.metaGraphVersion || globalConfig.metaGraphVersion || "v25.0";
  const base = tenant.graphBaseUrl();
  const url = new URL(`${base}/${version}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }
  url.searchParams.set("access_token", tenant.metaAccessToken);

  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error?.error_user_msg ||
      `Error Meta Graph ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.metaError = data?.error || data;
    throw err;
  }

  return data;
}

async function getTenantForCompany(companyId) {
  if (companyId === "legacy") {
    return {
      company: { id: "legacy", name: "Empresa (.env) / Febros" },
      tenant: getLegacyInstagramConfig(),
    };
  }

  const company = await getCompanyById(companyId);
  if (!company) {
    throw Object.assign(new Error("Empresa no encontrada"), { status: 404 });
  }

  const integration = await getIntegration(companyId, "instagram");
  if (!integration) {
    throw Object.assign(
      new Error("Esta empresa no tiene Instagram habilitado"),
      { status: 404 }
    );
  }

  return {
    company,
    tenant: rowToTenant(integration),
  };
}

async function fetchAccountProfile(tenant) {
  const igId = tenant.igAccountId;
  if (!igId) {
    throw new Error("igAccountId no configurado");
  }

  try {
    return await graphGet(tenant, `/${igId}`, {
      fields:
        "id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website",
    });
  } catch {
    // Instagram Login a veces usa /me
    return graphGet(tenant, "/me", {
      fields:
        "id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website",
    });
  }
}

async function fetchAccountInsights(tenant, igUserId) {
  const metrics = [
    "reach",
    "views",
    "profile_views",
    "accounts_engaged",
    "total_interactions",
    "likes",
    "comments",
    "shares",
    "saves",
    "replies",
  ];

  const result = {
    period: "day",
    metrics: {},
    errors: [],
  };

  // Intentar batch; si falla, métrica por métrica
  try {
    const data = await graphGet(tenant, `/${igUserId}/insights`, {
      metric: metrics.join(","),
      period: "day",
      metric_type: "total_value",
    });
    for (const name of metrics) {
      result.metrics[name] = insightValue(data, name);
    }
    return result;
  } catch (batchError) {
    result.errors.push(`batch: ${batchError.message}`);
  }

  for (const metric of metrics) {
    try {
      const data = await graphGet(tenant, `/${igUserId}/insights`, {
        metric,
        period: "day",
        metric_type: "total_value",
      });
      result.metrics[metric] = insightValue(data, metric);
    } catch (error) {
      result.metrics[metric] = null;
      result.errors.push(`${metric}: ${error.message}`);
    }
  }

  return result;
}

async function fetchMediaInsights(tenant, mediaId, mediaProductType) {
  const isReel = String(mediaProductType || "").toUpperCase() === "REELS";
  const metrics = isReel
    ? ["views", "reach", "saved", "shares", "total_interactions", "likes", "comments"]
    : ["views", "reach", "saved", "shares", "total_interactions", "likes", "comments"];

  try {
    const data = await graphGet(tenant, `/${mediaId}/insights`, {
      metric: metrics.join(","),
      period: "lifetime",
    });
    const out = {};
    for (const name of metrics) {
      out[name] = insightValue(data, name);
    }
    return out;
  } catch {
    // Fallback: métricas mínimas
    const out = {};
    for (const metric of ["views", "reach", "shares", "saved"]) {
      try {
        const data = await graphGet(tenant, `/${mediaId}/insights`, {
          metric,
          period: "lifetime",
        });
        out[metric] = insightValue(data, metric);
      } catch {
        out[metric] = null;
      }
    }
    return out;
  }
}

async function fetchMediaList(tenant, igUserId) {
  const data = await graphGet(tenant, `/${igUserId}/media`, {
    fields:
      "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count",
    limit: MEDIA_LIMIT,
  });

  const items = data.data || [];
  const enriched = [];

  for (const media of items) {
    const insights = await fetchMediaInsights(
      tenant,
      media.id,
      media.media_product_type || media.media_type
    );
    enriched.push({
      id: media.id,
      caption: media.caption || "",
      mediaType: media.media_type,
      productType: media.media_product_type || media.media_type,
      permalink: media.permalink,
      thumbnailUrl: media.thumbnail_url || media.media_url || null,
      timestamp: media.timestamp,
      likeCount: media.like_count ?? insights.likes ?? null,
      commentsCount: media.comments_count ?? insights.comments ?? null,
      views: insights.views ?? null,
      reach: insights.reach ?? null,
      shares: insights.shares ?? null,
      saved: insights.saved ?? null,
      totalInteractions: insights.total_interactions ?? null,
    });
  }

  return enriched;
}

function buildSummary(profile, accountInsights, media) {
  const reels = media.filter(
    (m) => String(m.productType || "").toUpperCase() === "REELS"
  );
  const topByViews = [...media]
    .filter((m) => m.views != null)
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 5);
  const topReels = [...reels]
    .filter((m) => m.views != null)
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 5);
  const topLikes = [...media]
    .filter((m) => m.likeCount != null)
    .sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0))
    .slice(0, 5);

  const totals = media.reduce(
    (acc, m) => {
      acc.views += Number(m.views) || 0;
      acc.likes += Number(m.likeCount) || 0;
      acc.comments += Number(m.commentsCount) || 0;
      acc.shares += Number(m.shares) || 0;
      acc.saves += Number(m.saved) || 0;
      return acc;
    },
    { views: 0, likes: 0, comments: 0, shares: 0, saves: 0 }
  );

  return {
    profile: {
      id: profile.id,
      username: profile.username,
      name: profile.name,
      picture: profile.profile_picture_url || null,
      followers: profile.followers_count ?? null,
      following: profile.follows_count ?? null,
      mediaCount: profile.media_count ?? null,
      biography: profile.biography || "",
      website: profile.website || "",
    },
    accountDay: accountInsights.metrics,
    accountDayErrors: accountInsights.errors,
    totalsRecentMedia: totals,
    topByViews,
    topReels,
    topLikes,
    mediaCountFetched: media.length,
  };
}

async function getCompanyInsights(companyId) {
  const { company, tenant } = await getTenantForCompany(companyId);

  if (!tenant.isMetaTokenConfigured()) {
    throw Object.assign(
      new Error(
        "Falta metaAccessToken en la integración Instagram de esta empresa"
      ),
      { status: 400 }
    );
  }

  const profile = await fetchAccountProfile(tenant);
  const igUserId = profile.id || tenant.igAccountId;

  const [accountInsights, media] = await Promise.all([
    fetchAccountInsights(tenant, igUserId),
    fetchMediaList(tenant, igUserId),
  ]);

  const summary = buildSummary(profile, accountInsights, media);

  return {
    company: {
      id: company.id,
      name: company.name,
    },
    fetchedAt: new Date().toISOString(),
    host: tenant.graphBaseUrl(),
    summary,
    media,
    permissionsHint:
      "Requiere permisos instagram_business_manage_insights (Instagram Login) o instagram_manage_insights (Facebook Login).",
  };
}

module.exports = {
  getCompanyInsights,
  getTenantForCompany,
};
