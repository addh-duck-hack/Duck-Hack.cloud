const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles, ROLES } = require("../middleware/authMiddleware");
const { createSingleImageUploadMiddlewares } = require("../middleware/imageUploadMiddleware");
const { sendError } = require("../utils/httpResponses");

const {
  uploadMiddleware: uploadProductImage,
  sanitizeAndStoreMiddleware: sanitizeProductImage,
} = createSingleImageUploadMiddlewares({
  fieldName: "productImage",
  filePrefix: "productImage",
  maxFileSizeMB: 5,
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

module.exports = router;
