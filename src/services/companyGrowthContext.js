const instagramInsights = require("./instagramInsights");

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

function formatMediaLine(item, index) {
  const caption = (item.caption || "(sin caption)").replace(/\s+/g, " ").slice(0, 80);
  const views = item.views != null ? item.views : "n/d";
  const likes = item.likeCount != null ? item.likeCount : "n/d";
  const comments = item.commentsCount != null ? item.commentsCount : "n/d";
  const shares = item.shares != null ? item.shares : "n/d";
  const saves = item.saved != null ? item.saved : "n/d";
  return `${index + 1}. [${item.productType || item.mediaType}] "${caption}" | vistas=${views} likes=${likes} comentarios=${comments} shares=${shares} guardados=${saves}`;
}

function buildSystemPromptFromInsights(insightsPayload) {
  const company = insightsPayload.company || {};
  const summary = insightsPayload.summary || {};
  const profile = summary.profile || {};
  const day = summary.accountDay || {};
  const totals = summary.totalsRecentMedia || {};
  const topReels = summary.topReels || [];
  const topByViews = summary.topByViews || [];
  const topLikes = summary.topLikes || [];

  const lines = [
    "Sos un consultor de growth en Instagram para la empresa indicada abajo.",
    "Usá SOLO los datos de métricas provistos. Si algo no está en los datos, decilo claramente.",
    "Cuando pidan un plan de crecimiento: priorizá acciones concretas, frecuencia de publicación, formato (Reels vs feed), horarios tentativos, ideas de contenido basadas en lo que ya rindió, y KPIs medibles.",
    "Respondé en español, claro y accionable.",
    "",
    "## Empresa",
    `- Nombre: ${company.name || "n/d"}`,
    `- ID interno: ${company.id || "n/d"}`,
    `- Instagram: @${profile.username || "n/d"} (${profile.name || ""})`,
    `- Seguidores: ${profile.followers ?? "n/d"}`,
    `- Siguiendo: ${profile.following ?? "n/d"}`,
    `- Publicaciones totales: ${profile.mediaCount ?? "n/d"}`,
    profile.biography ? `- Bio: ${profile.biography}` : null,
    profile.website ? `- Web: ${profile.website}` : null,
    `- Métricas actualizadas: ${insightsPayload.fetchedAt || "n/d"}`,
    "",
    "## Métricas de cuenta (último día disponible en Meta)",
    `- Vistas: ${day.views ?? "n/d"}`,
    `- Alcance: ${day.reach ?? "n/d"}`,
    `- Visitas al perfil: ${day.profile_views ?? "n/d"}`,
    `- Cuentas engaged: ${day.accounts_engaged ?? "n/d"}`,
    `- Interacciones totales: ${day.total_interactions ?? "n/d"}`,
    `- Likes (día): ${day.likes ?? "n/d"}`,
    `- Comentarios (día): ${day.comments ?? "n/d"}`,
    `- Shares (día): ${day.shares ?? "n/d"}`,
    `- Saves (día): ${day.saves ?? "n/d"}`,
    "",
    `## Totales en los últimos ${summary.mediaCountFetched ?? 0} posts/reels analizados`,
    `- Vistas: ${totals.views ?? 0}`,
    `- Likes: ${totals.likes ?? 0}`,
    `- Comentarios: ${totals.comments ?? 0}`,
    `- Shares/reenvíos: ${totals.shares ?? 0}`,
    `- Guardados: ${totals.saves ?? 0}`,
    "",
    "## Reels más vistos",
    ...(topReels.length
      ? topReels.map((item, i) => formatMediaLine(item, i))
      : ["(sin reels con métrica de vistas)"]),
    "",
    "## Contenido con más vistas (cualquier formato)",
    ...(topByViews.length
      ? topByViews.map((item, i) => formatMediaLine(item, i))
      : ["(sin datos)"]),
    "",
    "## Contenido con más likes",
    ...(topLikes.length
      ? topLikes.map((item, i) => formatMediaLine(item, i))
      : ["(sin datos)"]),
  ].filter(Boolean);

  return lines.join("\n");
}

async function getGrowthContext(companyId, { forceRefresh = false } = {}) {
  const id = String(companyId || "legacy");
  const cached = cache.get(id);
  if (!forceRefresh && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const insights = await instagramInsights.getCompanyInsights(id);
  const systemPrompt = buildSystemPromptFromInsights(insights);
  const value = {
    companyId: id,
    companyName: insights.company?.name || id,
    username: insights.summary?.profile?.username || null,
    fetchedAt: insights.fetchedAt,
    systemPrompt,
    insightsError: null,
  };
  cache.set(id, { at: Date.now(), value });
  return value;
}

async function getGrowthContextSafe(companyId, options = {}) {
  try {
    return await getGrowthContext(companyId, options);
  } catch (error) {
    const id = String(companyId || "legacy");
    return {
      companyId: id,
      companyName: id,
      username: null,
      fetchedAt: null,
      systemPrompt: [
        "Sos un consultor de growth en Instagram.",
        `No se pudieron cargar métricas de Instagram para la empresa "${id}".`,
        `Error: ${error.message}`,
        "Pedí al usuario que revise metaAccessToken, igAccountId y permisos de insights.",
        "Podés igual dar un plan genérico de crecimiento, aclarando que no hay datos reales.",
      ].join("\n"),
      insightsError: error.message,
    };
  }
}

module.exports = {
  getGrowthContext,
  getGrowthContextSafe,
  buildSystemPromptFromInsights,
};
