const path = require("path");
const multer = require("multer");
const { getUploadDir } = require("../services/leaderCommentConfig");

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, getUploadDir());
  },
  filename(_req, file, cb) {
    const safeBase = path
      .basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 40);
    cb(null, `febros-${safeBase || "doc"}-${Date.now()}.pdf`);
  },
});

const uploadLeaderPdf = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
      return;
    }
    cb(new Error("Solo se permiten archivos PDF"));
  },
});

module.exports = { uploadLeaderPdf };
