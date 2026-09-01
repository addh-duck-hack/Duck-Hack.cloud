// Ex-copia de backend/utils/uploads.js + backend/middleware/imageUploadMiddleware.js
// — desde que Auth/StoreConfig se movieron a core-api, este es el ÚNICO
// lugar donde vive `createSingleImageUploadMiddlewares` (perfil, store-config
// y productos ya la consumen de acá). `backend/utils/uploads.js` sigue
// existiendo, pero solo para que server.js sirva /uploads como estático
// (`resolveUploadsDir()`) — ya no para el pipeline de subida en sí.
// `sendError` se recibe por parámetro en vez de importarse (mismo criterio
// que lib/moduleHelpers.js).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const sharp = require("sharp");

const fallbackUploadsDir = path.join("/tmp", "media-uploads");
let cachedUploadsDir = null;

const isWritableDir = (dirPath) => {
  try {
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch (error) {
    return false;
  }
};

const ensureWritableDir = (dirPath) => {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    return isWritableDir(dirPath);
  } catch (error) {
    return false;
  }
};

const resolveUploadsDir = () => {
  if (cachedUploadsDir) return cachedUploadsDir;

  const preferredDir = process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.join(process.cwd(), "uploads");

  if (ensureWritableDir(preferredDir)) {
    cachedUploadsDir = preferredDir;
    return cachedUploadsDir;
  }

  if (ensureWritableDir(fallbackUploadsDir)) {
    cachedUploadsDir = fallbackUploadsDir;
    return cachedUploadsDir;
  }

  return null;
};

const ALLOWED_IMAGE_FORMATS = new Set(["jpeg", "png"]);

const createSingleImageUploadMiddlewares = ({ fieldName, filePrefix, maxFileSizeMB = 5, sendError }) => {
  const uploadMiddleware = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxFileSizeMB * 1024 * 1024 },
  }).single(fieldName);

  const sanitizeAndStoreMiddleware = async (req, res, next) => {
    if (!req.file) {
      return next();
    }

    try {
      const uploadsDir = resolveUploadsDir();
      if (!uploadsDir) {
        return sendError(
          res,
          500,
          "UPLOAD_STORAGE_UNAVAILABLE",
          "No hay un directorio de uploads con permisos de escritura."
        );
      }

      const metadata = await sharp(req.file.buffer).metadata();
      if (!metadata?.format || !ALLOWED_IMAGE_FORMATS.has(metadata.format)) {
        return sendError(
          res,
          400,
          "INVALID_FILE_TYPE",
          "Solo se permiten imágenes reales en formato JPG o PNG."
        );
      }

      const extension = metadata.format === "png" ? "png" : "jpg";
      const uniqueSuffix = `${Date.now()}-${crypto.randomUUID()}`;
      const outputFileName = `${filePrefix}-${uniqueSuffix}.${extension}`;
      const outputPath = path.join(uploadsDir, outputFileName);

      const imagePipeline = sharp(req.file.buffer).rotate();
      if (extension === "png") {
        await imagePipeline.png({ compressionLevel: 9 }).toFile(outputPath);
      } else {
        await imagePipeline.jpeg({ quality: 85, mozjpeg: true }).toFile(outputPath);
      }

      req.savedImagePath = `uploads/${outputFileName}`;
      return next();
    } catch (error) {
      return sendError(
        res,
        400,
        "INVALID_IMAGE_CONTENT",
        "El archivo de imagen no es válido o está corrupto."
      );
    }
  };

  return { uploadMiddleware, sanitizeAndStoreMiddleware };
};

module.exports = {
  resolveUploadsDir,
  createSingleImageUploadMiddlewares,
};
