// Subida de imagen de producto. Copia del comportamiento de
// backend/routes/upload.routes.js (ahora eliminado) — mismo endpoint
// POST /api/uploads/products-image, mismo campo "productImage", sin cambios
// de contrato para el frontend. Otros módulos que necesiten subir imágenes
// pueden agregar rutas a este mismo router.
const express = require("express");
const { createSingleImageUploadMiddlewares } = require("../lib/uploads");

function registerRoutes(app, ctx) {
  const { verifyToken, authorizeRoles, ROLES, sendError } = ctx;
  const router = express.Router();

  const { uploadMiddleware: uploadProductImage, sanitizeAndStoreMiddleware: sanitizeProductImage } =
    createSingleImageUploadMiddlewares({
      fieldName: "productImage",
      filePrefix: "productImage",
      maxFileSizeMB: 5,
      sendError,
    });

  router.post(
    "/products-image",
    verifyToken,
    authorizeRoles(ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN, ROLES.CATALOG_MANAGER),
    uploadProductImage,
    sanitizeProductImage,
    (req, res) => {
      if (!req.savedImagePath) {
        return sendError(res, 400, "FILE_REQUIRED", "Se requiere un archivo en el campo productImage.");
      }

      return res.status(201).json({
        message: "Imagen de producto subida correctamente.",
        imagePath: req.savedImagePath,
      });
    }
  );

  app.use("/api/uploads", router);
}

module.exports = {
  name: "uploads",
  registerRoutes,
  models: {},
};
