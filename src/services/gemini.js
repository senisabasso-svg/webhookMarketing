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

function buildPrompt({ message, channel = "Instagram DM" }) {
  return `Mensaje del usuario en ${channel}:\n"${message}"`;
}

async function generateWithModel(genAI, modelName, systemPrompt, prompt) {
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
  });

  const result = await model.generateContent(prompt);
  const reply = result.response.text().trim();

  if (!reply) {
    throw new Error("Gemini devolvió una respuesta vacía");
  }

  return reply;
}

async function generateReply(input, tenant = null) {
  const cfg = tenant || globalConfig;
  const genAI = new GoogleGenerativeAI(cfg.geminiApiKey);
  const channel =
    cfg.integrationType === "whatsapp" ? "WhatsApp" : "Instagram DM";
  const prompt = buildPrompt({ ...input, channel });
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
          prompt
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
