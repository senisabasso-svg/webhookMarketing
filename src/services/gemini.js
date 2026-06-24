const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require("../config");

const genAI = new GoogleGenerativeAI(config.geminiApiKey);

const DEFAULT_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-flash-latest",
];

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

function buildPrompt({ message }) {
  return `Mensaje del usuario en Instagram DM:\n"${message}"`;
}

async function generateWithModel(modelName, prompt) {
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: config.geminiSystemPrompt,
  });

  const result = await model.generateContent(prompt);
  const reply = result.response.text().trim();

  if (!reply) {
    throw new Error("Gemini devolvió una respuesta vacía");
  }

  return reply;
}

/**
 * Contrato interno:
 * Entrada: { user_id, message, message_id }
 * Salida:  { reply, model }
 */
async function generateReply(input) {
  const prompt = buildPrompt(input);
  const models = config.geminiModels;
  const maxRetries = 2;
  const errors = [];

  for (const modelName of models) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const reply = await generateWithModel(modelName, prompt);
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
