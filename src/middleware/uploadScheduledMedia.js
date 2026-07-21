const path = require("path");
const fs = require("fs");
const multer = require("multer");

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads", "scheduled");

function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function getUploadDir() {
  return UPLOAD_DIR;
}

const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const VIDEO_MIMES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/mov",
  "video/webm",
]);

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    ensureUploadDir();
    cb(null, UPLOAD_DIR);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || ".bin";
    const safeBase = path
      .basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 40);
    cb(null, `ig-${safeBase || "media"}-${Date.now()}${ext}`);
  },
});

const uploadScheduledMedia = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (
      IMAGE_MIMES.has(file.mimetype) ||
      VIDEO_MIMES.has(file.mimetype) ||
      file.mimetype.startsWith("image/") ||
      file.mimetype.startsWith("video/")
    ) {
      cb(null, true);
      return;
    }
    cb(new Error("Solo se permiten imágenes (JPG/PNG/WEBP) o videos (MP4/MOV)"));
  },
});

module.exports = {
  uploadScheduledMedia,
  ensureUploadDir,
  getUploadDir,
  IMAGE_MIMES,
  VIDEO_MIMES,
};
