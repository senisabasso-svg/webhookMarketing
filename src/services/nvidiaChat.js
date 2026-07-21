const globalConfig = require("../config");
const { sanitizeHistory } = require("./gemini");

async function generateWithKimi({
  systemPrompt,
  message,
  history = [],
  tenant = null,
} = {}) {
  const cfg = tenant || globalConfig;
  const apiKey = cfg.nvidiaApiKey || globalConfig.nvidiaApiKey;
  if (!apiKey || apiKey.startsWith("PENDIENTE")) {
    throw new Error("NVIDIA_API_KEY no configurada para Kimi");
  }

  const base = (
    cfg.nvidiaChatBaseUrl ||
    globalConfig.nvidiaChatBaseUrl ||
    "https://integrate.api.nvidia.com"
  ).replace(/\/$/, "");
  const model =
    cfg.nvidiaChatModel ||
    globalConfig.nvidiaChatModel ||
    "moonshotai/kimi-k2.6";

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  for (const turn of sanitizeHistory(history)) {
    messages.push({
      role: turn.role === "assistant" ? "assistant" : "user",
      content: turn.content,
    });
  }
  messages.push({ role: "user", content: String(message || "").trim() });

  const url = `${base}/v1/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: Number(process.env.NVIDIA_CHAT_MAX_TOKENS) || 16384,
      temperature: Number(process.env.NVIDIA_CHAT_TEMPERATURE) || 1,
      top_p: Number(process.env.NVIDIA_CHAT_TOP_P) || 1,
      seed: Number(process.env.NVIDIA_CHAT_SEED) || 0,
      stream: false,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg =
      data?.error?.message ||
      data?.detail ||
      data?.message ||
      `Error NVIDIA chat ${response.status}`;
    const err = new Error(msg);
    err.status = response.status;
    err.nvidiaError = data;
    throw err;
  }

  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new Error("Kimi devolvió una respuesta vacía");
  }

  return { reply, model, provider: "kimi" };
}

async function generateReply(input, tenant = null, history = []) {
  const cfg = tenant || globalConfig;
  const systemPrompt = cfg.geminiSystemPrompt || globalConfig.geminiSystemPrompt;
  const message = String(input.message || "").trim();
  if (!message) {
    throw new Error("Mensaje vacío");
  }

  return generateWithKimi({
    systemPrompt,
    message,
    history,
    tenant,
  });
}

module.exports = { generateReply, generateWithKimi };
