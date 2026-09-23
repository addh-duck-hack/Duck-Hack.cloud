// Biblioteca de medios del panel admin: lista, sube, edita metadatos y
// elimina los archivos de la carpeta uploads/ (la misma que sirve
// backend/server.js como estática en /uploads).
//
// La fuente de verdad de QUÉ archivos existen es el disco, no Mongo: GET /
// lee el directorio y le cruza la colección `Media`, que solo guarda los
// metadatos editables (título visible + texto alternativo). Así los archivos
// subidos antes de este módulo (productos, logo, hero, perfiles...) aparecen
// igual, con el nombre de archivo como título por default. "Renombrar" solo
// cambia `title` — el archivo físico nunca se mueve, así que ninguna ruta
// guardada en Product.images / StoreConfig / User.profileImage se rompe.
//
// DELETE revisa primero dónde se usa el archivo (ver findUsages) y responde
// 409 MEDIA_IN_USE con el detalle; el panel pide confirmación y reintenta con
// ?force=true.
const fs = require("fs");
const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const { asTrimmedString, getOrCreateModel } = require("../lib/moduleHelpers");
const { resolveUploadsDir, createMediaUploadMiddlewares, MEDIA_KIND_BY_EXTENSION } = require("../lib/uploads");

const TITLE_MAX = 200;
const ALT_TEXT_MAX = 500;

const mediaSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true, unique: true, trim: true, maxlength: 300 },
    title: { type: String, trim: true, maxlength: TITLE_MAX, default: "" },
    altText: { type: String, trim: true, maxlength: ALT_TEXT_MAX, default: "" },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Solo nombres planos dentro de uploads/ — nada de "../", subcarpetas ni
// archivos ocultos.
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const getExtension = (fileName) => path.extname(fileName).slice(1).toLowerCase();
const getKind = (fileName) => MEDIA_KIND_BY_EXTENSION[getExtension(fileName)] || null;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Una ruta guardada puede ser "uploads/x.jpg" o una URL absoluta que termina
// en ella — ambas cuentan como uso.
const matchesMediaPath = (value, mediaPath) =>
  typeof value === "string" && (value === mediaPath || value.endsWith(`/${mediaPath}`));

const STORE_CONFIG_LABELS = {
  logoUrl: "Logo",
  heroSlides: "Hero",
  homeBlocks: "Bloques de inicio",
  teamMembers: "Equipo",
  testimonials: "Testimonios",
  services: "Servicios",
};

// Recorre el documento de StoreConfig y devuelve las rutas de campo
// (ej. "heroSlides[0].mediaPath") cuyo valor apunta al archivo.
const findPathsInObject = (value, mediaPath, prefix = "") => {
  if (matchesMediaPath(value, mediaPath)) return [prefix];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findPathsInObject(item, mediaPath, `${prefix}[${index}]`));
  }
  if (value && typeof value === "object" && !(value instanceof Date) && !(value instanceof mongoose.Types.ObjectId)) {
    return Object.entries(value).flatMap(([key, child]) =>
      findPathsInObject(child, mediaPath, prefix ? `${prefix}.${key}` : key)
    );
  }
  return [];
};

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, authorizeRoles, ROLES, sendError } = ctx;
  const Media = getOrCreateModel(mongooseConnection, "Media", mediaSchema);

  const router = express.Router();
  router.use(verifyToken);
  router.use(authorizeRoles(ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN, ROLES.COLLABORATOR));

  const { uploadMiddleware, sanitizeAndStoreMiddleware } = createMediaUploadMiddlewares({
    fieldName: "media",
    filePrefix: "media",
    maxImageSizeMB: 10,
    maxVideoSizeMB: 50,
    sendError,
  });

  const getUploadsDirOrFail = (res) => {
    const uploadsDir = resolveUploadsDir();
    if (!uploadsDir) {
      sendError(res, 500, "UPLOAD_STORAGE_UNAVAILABLE", "No hay un directorio de uploads con permisos de escritura.");
    }
    return uploadsDir;
  };

  const toItem = (fileName, stat, doc) => ({
    fileName,
    path: `uploads/${fileName}`,
    kind: getKind(fileName),
    size: stat.size,
    uploadedAt: (doc?.createdAt || stat.mtime).toISOString(),
    title: doc?.title || fileName,
    altText: doc?.altText || "",
  });

  // Valida :fileName, confirma que el archivo existe y deja en req.media
  // { fileName, filePath, stat }.
  const resolveMediaFile = async (req, res, next) => {
    const { fileName } = req.params;
    if (!SAFE_FILE_NAME.test(fileName || "") || !getKind(fileName)) {
      return sendError(res, 400, "INVALID_FILE_NAME", "Nombre de archivo no válido.");
    }
    const uploadsDir = getUploadsDirOrFail(res);
    if (!uploadsDir) return undefined;

    const filePath = path.join(uploadsDir, fileName);
    try {
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) throw new Error("not a file");
      req.media = { fileName, filePath, stat };
      return next();
    } catch (error) {
      return sendError(res, 404, "MEDIA_NOT_FOUND", "Medio no encontrado.");
    }
  };

  const validateMetadata = (req, res, next) => {
    const payload = req.body || {};
    if (payload.title !== undefined) {
      const title = asTrimmedString(payload.title);
      if (!title) return sendError(res, 400, "VALIDATION_ERROR", "title no puede estar vacío.");
      if (title.length > TITLE_MAX) {
        return sendError(res, 400, "VALIDATION_ERROR", `title excede ${TITLE_MAX} caracteres.`);
      }
      req.body.title = title;
    }
    if (payload.altText !== undefined) {
      const altText = asTrimmedString(payload.altText);
      if (altText.length > ALT_TEXT_MAX) {
        return sendError(res, 400, "VALIDATION_ERROR", `altText excede ${ALT_TEXT_MAX} caracteres.`);
      }
      req.body.altText = altText;
    }
    return next();
  };

  // Dónde se referencia el archivo. Los modelos se buscan por nombre en la
  // conexión (no por import) — si un módulo no está montado, se omite.
  const findUsages = async (mediaPath) => {
    const { Product, User, StoreConfig } = mongooseConnection.models;
    const pathRegex = new RegExp(`(^|/)${escapeRegex(mediaPath)}$`);
    const usages = [];

    if (Product) {
      const products = await Product.find({ images: pathRegex }).select("name").lean();
      products.forEach((p) => usages.push({ type: "product", id: String(p._id), label: `Producto: ${p.name}` }));
    }

    if (User) {
      const users = await User.find({ profileImage: pathRegex }).select("name").lean();
      users.forEach((u) => usages.push({ type: "user", id: String(u._id), label: `Foto de perfil: ${u.name || "usuario"}` }));
    }

    if (StoreConfig) {
      const config = await StoreConfig.findOne().lean();
      if (config) {
        const { _id, __v, createdAt, updatedAt, ...content } = config;
        findPathsInObject(content, mediaPath).forEach((fieldPath) => {
          const section = STORE_CONFIG_LABELS[fieldPath.split(/[.[]/)[0]] || "Configuración";
          usages.push({ type: "storeConfig", field: fieldPath, label: `Configurar tienda: ${section} (${fieldPath})` });
        });
      }
    }

    return usages;
  };

  router.get("/", async (req, res) => {
    const uploadsDir = getUploadsDirOrFail(res);
    if (!uploadsDir) return undefined;

    try {
      const entries = await fs.promises.readdir(uploadsDir, { withFileTypes: true });
      const fileNames = entries
        .filter((entry) => entry.isFile() && SAFE_FILE_NAME.test(entry.name) && getKind(entry.name))
        .map((entry) => entry.name);

      const [stats, docs] = await Promise.all([
        Promise.all(fileNames.map((name) => fs.promises.stat(path.join(uploadsDir, name)))),
        Media.find({ fileName: { $in: fileNames } }).lean(),
      ]);
      const docsByName = new Map(docs.map((doc) => [doc.fileName, doc]));

      const items = fileNames
        .map((name, index) => toItem(name, stats[index], docsByName.get(name)))
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

      return res.status(200).json({ items });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar los medios.");
    }
  });

  router.post("/", uploadMiddleware, sanitizeAndStoreMiddleware, validateMetadata, async (req, res) => {
    if (!req.savedMedia) {
      return sendError(res, 400, "FILE_REQUIRED", "Se requiere un archivo en el campo media.");
    }

    const { fileName } = req.savedMedia;
    const originalBaseName = path.parse(req.file.originalname || "").name.trim().slice(0, TITLE_MAX);

    try {
      const doc = await Media.create({
        fileName,
        title: req.body.title || originalBaseName || fileName,
        altText: req.body.altText || "",
        uploadedBy: req.user?.id,
      });
      const stat = await fs.promises.stat(path.join(resolveUploadsDir(), fileName));
      return res.status(201).json({ message: "Medio subido correctamente.", item: toItem(fileName, stat, doc) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "El archivo se subió pero no se guardaron sus datos.");
    }
  });

  router.put("/:fileName", resolveMediaFile, validateMetadata, async (req, res) => {
    const update = {};
    if (req.body.title !== undefined) update.title = req.body.title;
    if (req.body.altText !== undefined) update.altText = req.body.altText;

    try {
      const { fileName, stat } = req.media;
      const doc = await Media.findOneAndUpdate(
        { fileName },
        { $set: update, $setOnInsert: { fileName } },
        { new: true, upsert: true, runValidators: true }
      ).lean();
      return res.status(200).json({ message: "Medio actualizado.", item: toItem(fileName, stat, doc) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al actualizar el medio.");
    }
  });

  router.get("/:fileName/usage", resolveMediaFile, async (req, res) => {
    try {
      const usages = await findUsages(`uploads/${req.media.fileName}`);
      return res.status(200).json({ items: usages });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al revisar dónde se usa el medio.");
    }
  });

  router.delete("/:fileName", resolveMediaFile, async (req, res) => {
    const { fileName, filePath } = req.media;
    try {
      if (req.query.force !== "true") {
        const usages = await findUsages(`uploads/${fileName}`);
        if (usages.length > 0) {
          return sendError(
            res,
            409,
            "MEDIA_IN_USE",
            "El medio está en uso. Confirma para eliminarlo de todas formas.",
            usages
          );
        }
      }

      await fs.promises.unlink(filePath);
      await Media.deleteOne({ fileName });
      return res.status(200).json({ message: "Medio eliminado." });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al eliminar el medio.");
    }
  });

  app.use("/api/media", router);
}

module.exports = {
  name: "media",
  registerRoutes,
  models: { Media: mediaSchema },
};