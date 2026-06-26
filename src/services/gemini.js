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

function toGeminiHistory(history = []) {
  return history
    .filter((h) => h.content && (h.role === "user" || h.role === "assistant"))
    .map((h) => ({
      role: h.role === "assistant" ? "model" : "user",
      parts: [{ text: h.content }],
    }));
}

async function generateWithModel(genAI, modelName, systemPrompt, message, history) {
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
  });

  const geminiHistory = toGeminiHistory(history);

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

  for (const modelName of models) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const reply = await generateWithModel(
          genAI,
          modelName,
          systemPrompt,
          message,
          history
        );
        if (modelName !== models[0]) {
          console.log(`[ai] Respondió con modelo fallback: ${modelName}`);
        }
        return { reply, model: modelName };
      } catch (error) {
        errors.push({ model: modelName, attempt, error: error.message });
        if (!isRetryableError(error) || attempt === maxRetries) break;
        await sleep(800 * (attempt + 1));
      }
    }
  }

  const summary = errors
    .map((e) => `${e.model} (intento ${e.attempt + 1}): ${e.error.slice(0, 80)}`)
    .join(" | ");
  throw new Error(`Todos los modelos de Gemini fallaron: ${summary}`);
}

module.exports = { generateReply };
