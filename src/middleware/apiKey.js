const config = require("../config");

function requireApiKey(req, res, next) {
  const headerKey = req.get("x-api-key");
  const bearer = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  const queryKey = req.query.api_key;

  const provided = headerKey || bearer || queryKey;

  if (!provided || provided !== config.logsApiKey) {
    return res.status(401).json({ error: "API key inválida o ausente" });
  }

  next();
}

module.exports = { requireApiKey };
