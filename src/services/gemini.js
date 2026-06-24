const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require("../config");

const genAI = new GoogleGenerativeAI(config.geminiApiKey);

/**
 * Contrato interno:
 * Entrada: { user_id, message, message_id }
 * Salida:  { reply }
 */
async function generateReply({ user_id, message, message_id }) {
  const model = genAI.getGenerativeModel({
    model: config.geminiModel,
    systemInstruction: config.geminiSystemPrompt,
  });

  const prompt = [
    "Un usuario de Instagram te escribió por DM.",
    `user_id: ${user_id}`,
    `message_id: ${message_id}`,
    `Mensaje del usuario: "${message}"`,
    "",
    "Responde SOLO con el texto que debe enviarse al usuario, sin comillas ni markdown.",
  ].join("\n");

  const result = await model.generateContent(prompt);
  const reply = result.response.text().trim();

  if (!reply) {
    throw new Error("Gemini devolvió una respuesta vacía");
  }

  return { reply };
}

module.exports = { generateReply };
