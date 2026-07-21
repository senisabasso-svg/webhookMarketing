const path = require("path");
const multer = require("multer");

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

const uploadScheduledMedia = multer({
  storage: multer.memoryStorage(),
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

function makeStoredFilename(file, index = 0) {
  const ext = path.extname(file.originalname || "").toLowerCase() || ".bin";
  const safeBase = path
    .basename(file.originalname || "media", path.extname(file.originalname || ""))
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 40);
  return `ig-${safeBase || "media"}-${Date.now()}-${index}${ext}`;
}

module.exports = {
  uploadScheduledMedia,
  ensureUploadDir: () => {},
  getUploadDir: () => null,
  IMAGE_MIMES,
  VIDEO_MIMES,
  makeStoredFilename,
};
