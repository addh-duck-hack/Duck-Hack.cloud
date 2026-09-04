// Inventario: un registro de stock por producto. Roadmap eCommerce (ver
// frontend-admin/src/components/AdminMenu.jsx). No modela un histórico de
// movimientos en esta entrega — quantity se ajusta directo, igual de simple
// que el resto de los módulos nuevos (ver plan).
const express = require("express");
const mongoose = require("mongoose");
const {
  sanitizeDoc,
  handleMongooseError,
  asFiniteNumber,
  asTrimmedString,
  isValidObjectId,
  getOrCreateModel,
} = require("../lib/moduleHelpers");

const inventorySchema = new mongoose.Schema(
  {
    // Único a propósito: un solo registro de inventario por producto. Si se
    // necesita multi-almacén en el futuro, este es el campo a migrar.
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, unique: true },
    quantity: { type: Number, required: true, min: 0, default: 0 },
    lowStockThreshold: { type: Number, min: 0, default: 0 },
    // Recalculado server-side a partir de quantity/lowStockThreshold, nunca
    // aceptado del cliente — mismo criterio que DesignDebt.status.
    status: { type: String, enum: ["in_stock", "low_stock", "out_of_stock"], default: "in_stock" },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);
inventorySchema.index({ status: 1 });

const recalculateStatus = (quantity, threshold) => {
  if (quantity <= 0) return "out_of_stock";
  if (quantity <= threshold) return "low_stock";
  return "in_stock";
};

const validatePayload = (sendError) => (req, res, next) => {
  const payload = req.body || {};
  const isCreate = req.method === "POST";

  if (isCreate) {
    if (!isValidObjectId(payload.product)) {
      return sendError(res, 400, "VALIDATION_ERROR", "product es requerido y debe ser un id válido.");
    }
    req.body.product = payload.product;
  }

  if (isCreate || payload.quantity !== undefined) {
    const quantity = asFiniteNumber(payload.quantity);
    if (quantity === null || quantity < 0) {
      return sendError(res, 400, "VALIDATION_ERROR", "quantity debe ser un número >= 0.");
    }
    req.body.quantity = quantity;
  }

  if (payload.lowStockThreshold !== undefined) {
    const threshold = asFiniteNumber(payload.lowStockThreshold);
    if (threshold === null || threshold < 0) {
      return sendError(res, 400, "VALIDATION_ERROR", "lowStockThreshold debe ser un número >= 0.");
    }
    req.body.lowStockThreshold = threshold;
  }

  if (payload.notes !== undefined) req.body.notes = asTrimmedString(payload.notes);

  // status nunca se acepta del cliente.
  delete req.body.status;

  return next();
};

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, authorizeRoles, ROLES, STAFF_ROLES, sendError } = ctx;
  const Inventory = getOrCreateModel(mongooseConnection, "Inventory", inventorySchema);

  const router = express.Router();
  router.use(verifyToken);

  const canRead = authorizeRoles(...STAFF_ROLES);
  const canWrite = authorizeRoles(ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN, ROLES.COLLABORATOR);

  const validateObjectIdParam = (paramName) => (req, res, next) => {
    if (!isValidObjectId(req.params?.[paramName])) {
      return sendError(res, 400, "INVALID_OBJECT_ID", `${paramName} no válido`);
    }
    return next();
  };

  const ensureInventoryExists = async (req, res, next) => {
    try {
      const item = await Inventory.findById(req.params.id);
      if (!item) return sendError(res, 404, "INVENTORY_NOT_FOUND", "Registro de inventario no encontrado.");
      req.inventoryItem = item;
      return next();
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar el inventario.");
    }
  };

  router.get("/", canRead, async (req, res) => {
    try {
      const filter = {};
      if (req.query.status) filter.status = req.query.status;
      const items = await Inventory.find(filter).sort({ updatedAt: -1 }).populate("product", "name sku price images");
      return res.status(200).json({ items: items.map(sanitizeDoc) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar el inventario.");
    }
  });

  router.post("/", canWrite, validatePayload(sendError), async (req, res) => {
    try {
      const Product = mongooseConnection.models.Product;
      const productExists = Product ? await Product.exists({ _id: req.body.product }) : null;
      if (!productExists) {
        return sendError(res, 404, "PRODUCT_NOT_FOUND", "El producto referenciado no existe.");
      }

      const status = recalculateStatus(req.body.quantity, req.body.lowStockThreshold || 0);
      const item = new Inventory({ ...req.body, status });
      await item.save();
      return res.status(201).json({ message: "Inventario registrado.", inventory: sanitizeDoc(item) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al registrar el inventario.");
    }
  });

  router.get("/:id", validateObjectIdParam("id"), canRead, ensureInventoryExists, async (req, res) => {
    await req.inventoryItem.populate("product", "name sku price images");
    return res.status(200).json(sanitizeDoc(req.inventoryItem));
  });

  router.put(
    "/:id",
    validateObjectIdParam("id"),
    canWrite,
    ensureInventoryExists,
    validatePayload(sendError),
    async (req, res) => {
      try {
        // product es inmutable después de creado (un registro = un producto).
        if (req.body.quantity !== undefined) req.inventoryItem.quantity = req.body.quantity;
        if (req.body.lowStockThreshold !== undefined) req.inventoryItem.lowStockThreshold = req.body.lowStockThreshold;
        if (req.body.notes !== undefined) req.inventoryItem.notes = req.body.notes;
        req.inventoryItem.status = recalculateStatus(req.inventoryItem.quantity, req.inventoryItem.lowStockThreshold || 0);

        await req.inventoryItem.save();
        return res.status(200).json({ message: "Inventario actualizado.", inventory: sanitizeDoc(req.inventoryItem) });
      } catch (error) {
        return handleMongooseError(sendError, res, error, "Error al actualizar el inventario.");
      }
    }
  );

  router.delete("/:id", validateObjectIdParam("id"), canWrite, ensureInventoryExists, async (req, res) => {
    try {
      await req.inventoryItem.deleteOne();
      return res.status(200).json({ message: "Registro de inventario eliminado." });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al eliminar el inventario.");
    }
  });

  app.use("/api/inventory", router);
}

module.exports = {
  name: "inventory",
  registerRoutes,
  models: { Inventory: inventorySchema },
};
