const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const sharp = require("sharp");
const { fileTypeFromBuffer } = require("file-type");
const { sendError } = require("../utils/httpResponses");

const UPLOADS_DIR = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

const createSingleImageUploadMiddlewares = ({
  fieldName,
  filePrefix,
  maxFileSizeMB = 5,
}) => {
  const uploadMiddleware = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxFileSizeMB * 1024 * 1024 },
  }).single(fieldName);

  const sanitizeAndStoreMiddleware = async (req, res, next) => {
    if (!req.file) {
      return next();
    }

    try {
      const detectedFileType = await fileTypeFromBuffer(req.file.buffer);
      if (!detectedFileType || !ALLOWED_IMAGE_MIME_TYPES.has(detectedFileType.mime)) {
        return sendError(
          res,
          400,
          "INVALID_FILE_TYPE",
          "Solo se permiten imágenes reales en formato JPG o PNG."
        );
      }

      const extension = detectedFileType.mime === "image/png" ? "png" : "jpg";
      const uniqueSuffix = `${Date.now()}-${crypto.randomUUID()}`;
      const outputFileName = `${filePrefix}-${uniqueSuffix}.${extension}`;
      const outputPath = path.join(UPLOADS_DIR, outputFileName);

      // Re-encodado para eliminar contenido no esperado y normalizar el archivo.
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
  createSingleImageUploadMiddlewares,
};
