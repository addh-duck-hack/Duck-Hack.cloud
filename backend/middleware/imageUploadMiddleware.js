const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const sharp = require("sharp");
const { sendError } = require("../utils/httpResponses");
const { resolveUploadsDir } = require("../utils/uploads");

const ALLOWED_IMAGE_FORMATS = new Set(["jpeg", "png"]);

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
