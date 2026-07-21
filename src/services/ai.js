const globalConfig = require("../config");
const gemini = require("./gemini");
const nvidiaChat = require("./nvidiaChat");

function resolveProvider(tenant = null) {
  const cfg = tenant || globalConfig;
  const provider = String(
    cfg.aiProvider || globalConfig.aiProvider || "gemini"
  ).toLowerCase();
  if (["kimi", "nvidia", "moonshot"].includes(provider)) return "kimi";
  if (provider === "auto") return "auto";
  return "gemini";
}

async function generateReply(input, tenant = null, history = []) {
  const provider = resolveProvider(tenant);

  if (provider === "kimi") {
    return nvidiaChat.generateReply(input, tenant, history);
  }

  if (provider === "auto") {
    try {
      return await gemini.generateReply(input, tenant, history);
    } catch (geminiError) {
      console.warn(
        "[ai] Gemini falló, probando NVIDIA chat:",
        geminiError.message?.slice(0, 120)
      );
      return nvidiaChat.generateReply(input, tenant, history);
    }
  }

  return gemini.generateReply(input, tenant, history);
}

module.exports = { generateReply, resolveProvider };
