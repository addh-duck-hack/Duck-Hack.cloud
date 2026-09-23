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

const ALLOWED_HERO_IMAGE_FORMATS = new Set(["jpeg", "png", "gif"]);

// Variante de createSingleImageUploadMiddlewares para el media del hero:
// jpeg/png siguen re-encodeándose con sharp (mismo camino de siempre), pero
// un gif real se escribe TAL CUAL (sin pasar por sharp) — sharp aplanaría la
// animación a un solo frame si se le pidiera .toFile() sobre un gif.
const createHeroImageUploadMiddlewares = ({ fieldName, filePrefix, maxFileSizeMB = 10, sendError }) => {
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
      if (!metadata?.format || !ALLOWED_HERO_IMAGE_FORMATS.has(metadata.format)) {
        return sendError(
          res,
          400,
          "INVALID_FILE_TYPE",
          "Solo se permiten imágenes reales en formato JPG, PNG o GIF."
        );
      }

      const uniqueSuffix = `${Date.now()}-${crypto.randomUUID()}`;

      if (metadata.format === "gif") {
        const outputFileName = `${filePrefix}-${uniqueSuffix}.gif`;
        const outputPath = path.join(uploadsDir, outputFileName);
        await fs.promises.writeFile(outputPath, req.file.buffer);
        req.savedImagePath = `uploads/${outputFileName}`;
        return next();
      }

      const extension = metadata.format === "png" ? "png" : "jpg";
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
        "El archivo no es válido o está corrupto."
      );
    }
  };

  return { uploadMiddleware, sanitizeAndStoreMiddleware };
};

// Firma binaria de los videos aceptados por la biblioteca de medios — sharp
// no entiende video, así que el tipo se decide por los primeros bytes del
// archivo (nunca por el Content-Type/extensión que declara el cliente).
const detectVideoFormat = (buffer) => {
  if (!buffer || buffer.length < 12) return null;
  // MP4/MOV (ISO BMFF): bytes 4..8 = "ftyp"; la marca decide si es QuickTime.
  if (buffer.toString("ascii", 4, 8) === "ftyp") {
    return buffer.toString("ascii", 8, 12) === "qt  " ? null : "mp4";
  }
  // WebM (EBML): 1A 45 DF A3.
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return "webm";
  }
  return null;
};

const MEDIA_MIME_TYPES = {
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
};

const MEDIA_KIND_BY_EXTENSION = {
  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "gif",
  mp4: "video",
  webm: "video",
};

// Variante para la biblioteca de medios del admin (modules/media.js):
// jpeg/png se re-encodean con sharp (igual que el resto), gif se guarda tal
// cual (ver createHeroImageUploadMiddlewares) y mp4/webm se validan por firma
// binaria y se escriben sin tocar. Deja en req.savedMedia
// { fileName, path, kind, mimeType, size }.
const createMediaUploadMiddlewares = ({
  fieldName,
  filePrefix,
  maxImageSizeMB = 10,
  maxVideoSizeMB = 50,
  sendError,
}) => {
  const maxUploadMB = Math.max(maxImageSizeMB, maxVideoSizeMB);
  const multerSingle = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxUploadMB * 1024 * 1024 },
  }).single(fieldName);

  // Sin este envoltorio, LIMIT_FILE_SIZE caería al handler genérico de
  // server.js como un 500.
  const uploadMiddleware = (req, res, next) =>
    multerSingle(req, res, (error) => {
      if (!error) return next();
      if (error.code === "LIMIT_FILE_SIZE") {
        return sendError(res, 413, "FILE_TOO_LARGE", `El archivo excede ${maxUploadMB} MB.`);
      }
      return sendError(res, 400, "INVALID_UPLOAD", "No fue posible procesar el archivo subido.");
    });

  const sanitizeAndStoreMiddleware = async (req, res, next) => {
    if (!req.file) {
      return next();
    }

    const uploadsDir = resolveUploadsDir();
    if (!uploadsDir) {
      return sendError(
        res,
        500,
        "UPLOAD_STORAGE_UNAVAILABLE",
        "No hay un directorio de uploads con permisos de escritura."
      );
    }

    const { buffer } = req.file;
    const uniqueSuffix = `${Date.now()}-${crypto.randomUUID()}`;
    const buildOutput = (extension) => {
      const fileName = `${filePrefix}-${uniqueSuffix}.${extension}`;
      return { fileName, outputPath: path.join(uploadsDir, fileName) };
    };
    const tooLarge = (maxMB) => buffer.length > maxMB * 1024 * 1024;

    try {
      const videoFormat = detectVideoFormat(buffer);
      if (videoFormat) {
        if (tooLarge(maxVideoSizeMB)) {
          return sendError(res, 413, "FILE_TOO_LARGE", `El video excede ${maxVideoSizeMB} MB.`);
        }
        const { fileName, outputPath } = buildOutput(videoFormat);
        await fs.promises.writeFile(outputPath, buffer);
        req.savedMedia = {
          fileName,
          path: `uploads/${fileName}`,
          kind: "video",
          mimeType: MEDIA_MIME_TYPES[videoFormat],
          size: buffer.length,
        };
        return next();
      }

      if (tooLarge(maxImageSizeMB)) {
        return sendError(res, 413, "FILE_TOO_LARGE", `La imagen excede ${maxImageSizeMB} MB.`);
      }

      const metadata = await sharp(buffer).metadata();
      if (!metadata?.format || !ALLOWED_HERO_IMAGE_FORMATS.has(metadata.format)) {
        return sendError(
          res,
          400,
          "INVALID_FILE_TYPE",
          "Solo se permiten archivos JPG, PNG, GIF, MP4 o WebM."
        );
      }

      if (metadata.format === "gif") {
        const { fileName, outputPath } = buildOutput("gif");
        await fs.promises.writeFile(outputPath, buffer);
        req.savedMedia = { fileName, path: `uploads/${fileName}`, kind: "gif", mimeType: MEDIA_MIME_TYPES.gif, size: buffer.length };
        return next();
      }

      const extension = metadata.format === "png" ? "png" : "jpg";
      const { fileName, outputPath } = buildOutput(extension);
      const imagePipeline = sharp(buffer).rotate();
      const info =
        extension === "png"
          ? await imagePipeline.png({ compressionLevel: 9 }).toFile(outputPath)
          : await imagePipeline.jpeg({ quality: 85, mozjpeg: true }).toFile(outputPath);

      req.savedMedia = {
        fileName,
        path: `uploads/${fileName}`,
        kind: "image",
        mimeType: MEDIA_MIME_TYPES[extension],
        size: info.size,
      };
      return next();
    } catch (error) {
      return sendError(res, 400, "INVALID_FILE_CONTENT", "El archivo no es válido o está corrupto.");
    }
  };

  return { uploadMiddleware, sanitizeAndStoreMiddleware };
};

module.exports = {
  resolveUploadsDir,
  createSingleImageUploadMiddlewares,
  createHeroImageUploadMiddlewares,
  createMediaUploadMiddlewares,
  MEDIA_KIND_BY_EXTENSION,
};
