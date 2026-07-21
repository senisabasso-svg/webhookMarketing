const fs = require("fs");
const scheduledPosts = require("../../services/scheduledPosts");
const config = require("../../config");

function handleCreateScheduledPost(companyId, createdBy) {
  return async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Subí una imagen o video" });
      }

      const post = await scheduledPosts.createPost({
        companyId,
        mediaType: req.body?.mediaType || "IMAGE",
        caption: req.body?.caption || "",
        scheduledAt: req.body?.scheduledAt,
        file: req.file,
        createdBy,
      });

      res.status(201).json({
        post,
        publicBaseUrl: config.publicBaseUrl,
        note:
          "Meta necesita descargar el archivo vía PUBLIC_BASE_URL (HTTPS). " +
          "El worker publica automáticamente a la hora programada.",
      });
    } catch (error) {
      if (req.file?.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          /* ignore */
        }
      }
      const status = error.status && error.status >= 400 ? error.status : 500;
      res.status(status).json({ error: error.message });
    }
  };
}

module.exports = { handleCreateScheduledPost };
