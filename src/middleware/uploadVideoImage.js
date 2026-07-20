const multer = require("multer");

const uploadVideoImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (file.mimetype?.startsWith("image/")) {
      cb(null, true);
      return;
    }
    cb(new Error("Solo se permiten imágenes (jpg, png, webp)"));
  },
});

module.exports = { uploadVideoImage };
