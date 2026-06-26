const { GoogleGenerativeAI } = require("@google/generative-ai");
const globalConfig = require("../config");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error) {
  const msg = error.message || "";
  return (
    msg.includes("503") ||
    msg.includes("429") ||
    msg.includes("high demand") ||
    msg.includes("quota")
  );
}

function sanitizeHistory(history = []) {
  const sanitized = [];

  for (const item of history) {
    if (!item?.content || !["user", "assistant"].includes(item.role)) continue;

    const role = item.role;
    const last = sanitized[sanitized.length - 1];

    if (!last) {
      if (role !== "user") continue;
      sanitized.push({ role, content: item.content });
      continue;
    }

    if (last.role === role) {
      sanitized[sanitized.length - 1] = { role, content: item.content };
      continue;
    }

    sanitized.push({ role, content: item.content });
  }

  if (sanitized.length && sanitized[sanitized.length - 1].role === "user") {
    sanitized.pop();
  }

  return sanitized;
}

function toGeminiHistory(history = []) {
  return sanitizeHistory(history).map((h) => ({
    role: h.role === "assistant" ? "model" : "user",
    parts: [{ text: h.content }],
  }));
}

async function generateWithModel(
  genAI,
  modelName,
  systemPrompt,
  message,
  history,
  { useHistory = true } = {}
) {
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
  });

  const geminiHistory = useHistory ? toGeminiHistory(history) : [];

  let reply;
  if (geminiHistory.length > 0) {
    const chat = model.startChat({ history: geminiHistory });
    const result = await chat.sendMessage(message);
    reply = result.response.text().trim();
  } else {
    const result = await model.generateContent(message);
    reply = result.response.text().trim();
  }

  if (!reply) {
    throw new Error("Gemini devolvió una respuesta vacía");
  }

  return reply;
}

async function generateReply(input, tenant = null, history = []) {
  const cfg = tenant || globalConfig;
  const genAI = new GoogleGenerativeAI(cfg.geminiApiKey);
  const message = String(input.message || "").trim();
  const models = cfg.geminiModels || globalConfig.geminiModels;
  const systemPrompt = cfg.geminiSystemPrompt || globalConfig.geminiSystemPrompt;
  const maxRetries = 2;
  const errors = [];
  const sanitizedHistory = sanitizeHistory(history);

  for (const modelName of models) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      for (const useHistory of [true, false]) {
        if (!useHistory && sanitizedHistory.length === 0) continue;

        try {
          const reply = await generateWithModel(
            genAI,
            modelName,
            systemPrompt,
            message,
            sanitizedHistory,
            { useHistory }
          );
          if (modelName !== models[0]) {
            console.log(`[ai] Respondió con modelo fallback: ${modelName}`);
          }
          if (!useHistory && sanitizedHistory.length > 0) {
            console.log("[ai] Respondió sin historial (fallback de contexto)");
          }
          return { reply, model: modelName };
        } catch (error) {
          errors.push({
            model: modelName,
            attempt,
            useHistory,
            error: error.message,
          });
          if (!useHistory) break;
        }
      }

      const lastError = errors[errors.length - 1]?.error || "";
      if (!isRetryableError({ message: lastError }) || attempt === maxRetries) {
        break;
      }
      await sleep(800 * (attempt + 1));
    }
  }

  const summary = errors
    .map((e) => {
      const mode = e.useHistory ? "con historial" : "sin historial";
      return `${e.model} (${mode}): ${e.error.slice(0, 80)}`;
    })
    .join(" | ");
  throw new Error(`Todos los modelos de Gemini fallaron: ${summary}`);
}

module.exports = { generateReply, sanitizeHistory };
