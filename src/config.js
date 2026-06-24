require("dotenv").config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

const databaseUrl = required("DATABASE_URL");

module.exports = {
  port: Number(process.env.PORT) || 3000,
  verifyToken: required("VERIFY_TOKEN"),
  metaAccessToken: required("META_ACCESS_TOKEN"),
  metaGraphVersion: process.env.META_GRAPH_VERSION || "v23.0",
  geminiApiKey: required("GEMINI_API_KEY"),
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  geminiSystemPrompt:
    process.env.GEMINI_SYSTEM_PROMPT ||
    "Eres un asistente amable de atención al cliente en Instagram. Responde de forma breve, clara y en español.",
  databaseUrl,
  logsApiKey: required("LOGS_API_KEY"),
  dbSsl:
    process.env.DB_SSL === "true" || process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : undefined,
};
