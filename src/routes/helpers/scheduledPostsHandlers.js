const scheduledPosts = require("../../services/scheduledPosts");
const config = require("../../config");

function handleCreateScheduledPost(companyId, createdBy) {
  return async (req, res) => {
    const files = Array.isArray(req.files)
      ? req.files
      : req.file
        ? [req.file]
        : [];

    try {
      if (!files.length) {
        return res.status(400).json({ error: "Subí una o más imágenes, o un video" });
      }

      const post = await scheduledPosts.createPost({
        companyId,
        mediaType: req.body?.mediaType || "IMAGE",
        caption: req.body?.caption || "",
        scheduledAt: req.body?.scheduledAt,
        files,
        createdBy,
      });

      res.status(201).json({
        post,
        publicBaseUrl: config.publicBaseUrl,
        note:
          "Meta necesita descargar el archivo vía PUBLIC_BASE_URL (HTTPS). " +
          "El worker publica automáticamente a la hora programada. " +
          "2–10 fotos = carrusel.",
      });
    } catch (error) {
      scheduledPosts.unlinkFiles(files);
      const status = error.status && error.status >= 400 ? error.status : 500;
      res.status(status).json({ error: error.message });
    }
  };
}

function handleUpdateScheduledPost(companyId) {
  return async (req, res) => {
    const files = Array.isArray(req.files)
      ? req.files
      : req.file
        ? [req.file]
        : [];

    try {
      const post = await scheduledPosts.updatePost(companyId, req.params.id, {
        caption: req.body?.caption,
        scheduledAt: req.body?.scheduledAt,
        mediaType: req.body?.mediaType,
        files,
      });
      res.json({
        post,
        publicBaseUrl: config.publicBaseUrl,
      });
    } catch (error) {
      scheduledPosts.unlinkFiles(files);
      const status = error.status && error.status >= 400 ? error.status : 500;
      res.status(status).json({ error: error.message });
    }
  };
}

module.exports = { handleCreateScheduledPost, handleUpdateScheduledPost };
