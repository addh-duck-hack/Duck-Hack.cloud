const express = require("express");
const router = express.Router();
const StoreConfig = require("../models/storeConfig.model");
const AgencyClient = require("../models/agencyClient.model");
const { verifyToken, authorizeRoles, ROLES } = require("../middleware/authMiddleware");
const { validateStoreConfigPayload } = require("../middleware/validationMiddleware");
const { sendError } = require("../utils/httpResponses");
const { createSingleImageUploadMiddlewares } = require("../middleware/imageUploadMiddleware");
const { getRunningContainersCount } = require("../utils/portainerClient");

const sanitizeStoreConfig = (doc) => {
  if (!doc) return null;
  const config = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  delete config.__v;
  return config;
};

// Sustituye el `value` de las métricas cuyo `source` no es "manual" por un
// dato real, calculado al vuelo. Nunca deja que un fallo acá tumbe /public
// (mejor mostrar el placeholder guardado que romper el storefront) — cada
// fuente se resuelve de forma independiente y solo si al menos una métrica la
// necesita, para no pagar el costo en instancias que no configuraron ninguna.
const resolveLiveMetrics = async (metrics) => {
  if (!Array.isArray(metrics) || metrics.length === 0) return metrics;

  const needsActiveClients = metrics.some((m) => m.source === "active_clients");
  const needsActiveContainers = metrics.some((m) => m.source === "active_containers");
  if (!needsActiveClients && !needsActiveContainers) return metrics;

  const [activeClientsResult, activeContainersResult] = await Promise.allSettled([
    needsActiveClients ? AgencyClient.countDocuments({ isActive: { $ne: false } }) : Promise.resolve(null),
    needsActiveContainers ? getRunningContainersCount() : Promise.resolve(null),
  ]);

  const activeClientsCount = activeClientsResult.status === "fulfilled" ? activeClientsResult.value : null;
  const activeContainersCount = activeContainersResult.status === "fulfilled" ? activeContainersResult.value : null;

  return metrics.map((m) => {
    if (m.source === "active_clients" && activeClientsCount !== null) {
      return { ...m, value: String(activeClientsCount) };
    }
    if (m.source === "active_containers" && activeContainersCount !== null) {
      return { ...m, value: String(activeContainersCount) };
    }
    return m; // fuente automática pero no se pudo calcular ahora mismo: se
    // mantiene el placeholder guardado en vez de mostrar vacío.
  });
};

router.get("/public", async (req, res) => {
  try {
    const config = await StoreConfig.findOne({ singletonKey: "default", isActive: true }).lean();
    if (!config) {
      return sendError(res, 404, "STORE_CONFIG_NOT_FOUND", "Configuración de tienda no encontrada.");
    }
    config.metrics = await resolveLiveMetrics(config.metrics);
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
        "socialLinks",
        "legalIdentity",
        "heroSlides",
        "metrics",
        "commands",
        "services",
        "pricingPlans",
        "commonPlanChecks",
        "faqs",
        "teamMembers",
        "testimonials",
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

const { uploadMiddleware: uploadStoreImage, sanitizeAndStoreMiddleware: sanitizeStoreImage } =
  createSingleImageUploadMiddlewares({
    fieldName: "image",
    filePrefix: "store-config",
    maxFileSizeMB: 5,
  });

// Endpoint genérico de subida de imagen para store-config: sirve tanto para el
// logo como para las fotos de equipo/testimonios (mismo formato/validación en
// los tres casos vía sharp). El frontend decide a qué campo asigna el
// imagePath devuelto (logoUrl, teamMembers[i].photoUrl, testimonials[i].photoUrl).
router.post(
  "/upload-image",
  verifyToken,
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN),
  uploadStoreImage,
  sanitizeStoreImage,
  (req, res) => {
    if (!req.savedImagePath) {
      return sendError(res, 400, "FILE_REQUIRED", "Se requiere un archivo en el campo image.");
    }
    return res.status(201).json({
      message: "Imagen subida correctamente.",
      imagePath: req.savedImagePath,
    });
  }
);

module.exports = router;
