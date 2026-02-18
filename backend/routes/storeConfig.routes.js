const express = require("express");
const router = express.Router();
const StoreConfig = require("../models/storeConfig.model");
const { verifyToken, authorizeRoles, ROLES } = require("../middleware/authMiddleware");
const { validateStoreConfigPayload } = require("../middleware/validationMiddleware");
const { sendError } = require("../utils/httpResponses");

const sanitizeStoreConfig = (doc) => {
  if (!doc) return null;
  const config = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  delete config.__v;
  return config;
};

router.get("/public", async (req, res) => {
  try {
    const config = await StoreConfig.findOne({ singletonKey: "default", isActive: true }).lean();
    if (!config) {
      return sendError(res, 404, "STORE_CONFIG_NOT_FOUND", "Configuración de tienda no encontrada.");
    }
    return res.status(200).json(sanitizeStoreConfig(config));
  } catch (error) {
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar configuración de tienda.");
  }
});

router.get(
  "/",
  verifyToken,
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN),
  async (req, res) => {
    try {
      const config = await StoreConfig.findOne({ singletonKey: "default" }).lean();
      if (!config) {
        return sendError(res, 404, "STORE_CONFIG_NOT_FOUND", "Configuración de tienda no encontrada.");
      }
      return res.status(200).json(sanitizeStoreConfig(config));
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar configuración de tienda.");
    }
  }
);

router.put(
  "/",
  verifyToken,
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN),
  validateStoreConfigPayload,
  async (req, res) => {
    try {
      const allowedFields = [
        "storeName",
        "storeSlug",
        "contactEmail",
        "contactPhone",
        "logoUrl",
        "theme",
        "homeBlocks",
        "isActive",
      ];

      const updateData = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) {
          updateData[key] = req.body[key];
        }
      }

      if (Object.keys(updateData).length === 0) {
        return sendError(res, 400, "NO_UPDATE_FIELDS", "No se enviaron datos para actualizar.");
      }

      const updated = await StoreConfig.findOneAndUpdate(
        { singletonKey: "default" },
        {
          $set: updateData,
          $setOnInsert: { singletonKey: "default" },
        },
        { upsert: true, new: true, runValidators: true }
      );

      return res.status(200).json({
        message: "Configuración de tienda actualizada correctamente.",
        storeConfig: sanitizeStoreConfig(updated),
      });
    } catch (error) {
      if (error?.code === 11000) {
        return sendError(
          res,
          409,
          "STORE_CONFIG_DUPLICATE",
          "Conflicto de unicidad en configuración de tienda."
        );
      }
      if (error?.name === "ValidationError") {
        const messages = Object.values(error.errors || {}).map((e) => e.message);
        return sendError(res, 400, "VALIDATION_ERROR", "Error de validación", messages);
      }
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al actualizar configuración de tienda.");
    }
  }
);

module.exports = router;
