// Inventario: un registro de stock por producto, o uno por variante si el
// producto tiene variantes (lib/variants.js). Cada cambio de cantidad deja un
// renglón en InventoryMovement (lib/stockMovements.js): el alta y la edición a
// mano desde aquí, y pedidos/mayoreo/compras vía adjustStock.
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
const { createModuleAuthorizer } = require("../lib/permissions");
const { hasVariants, findVariant, variantLabel } = require("../lib/variants");
const {
  MOVEMENT_REASONS,
  inventoryMovementSchema,
  getMovementModel,
  recalculateStatus,
  notifyStockAlerts,
  recordMovement,
} = require("../lib/stockMovements");

const inventorySchema = new mongoose.Schema(
  {
    // Un solo registro por producto + variante (índice único abajo). Si se
    // necesita multi-almacén en el futuro, este es el índice a migrar.
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    // _id de Product.variants; null = producto sin variantes.
    variant: { type: mongoose.Schema.Types.ObjectId, default: null },
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
// Antes el único era solo `product` (índice "product_1"); al pasar a variantes
// hay que borrarlo en cada tienda: backend/scripts/migrate-categories-variants.mongo.js.
inventorySchema.index({ product: 1, variant: 1 }, { unique: true });

const validatePayload = (sendError) => (req, res, next) => {
  const payload = req.body || {};
  const isCreate = req.method === "POST";

  if (isCreate) {
    if (!isValidObjectId(payload.product)) {
      return sendError(res, 400, "VALIDATION_ERROR", "product es requerido y debe ser un id válido.");
    }
    req.body.product = payload.product;
    if (payload.variant !== undefined && payload.variant !== null && payload.variant !== "") {
      if (!isValidObjectId(payload.variant)) {
        return sendError(res, 400, "VALIDATION_ERROR", "variant debe ser un id válido.");
      }
      req.body.variant = payload.variant;
    } else {
      req.body.variant = null;
    }
  } else {
    // product/variant son inmutables después de creado.
    delete req.body.product;
    delete req.body.variant;
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
  // Motivo del ajuste a mano (va al historial, no al registro).
  req.body.movementNote = asTrimmedString(payload.movementNote).slice(0, 300);

  // status nunca se acepta del cliente.
  delete req.body.status;

  return next();
};

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, sendError } = ctx;
  const Inventory = getOrCreateModel(mongooseConnection, "Inventory", inventorySchema);
  const InventoryMovement = getMovementModel(mongooseConnection);

  const router = express.Router();
  router.use(verifyToken);

  // Permisos por tienda (lib/permissions.js).
  const { authorizeModule } = createModuleAuthorizer({ mongooseConnection, sendError });
  const canRead = authorizeModule("inventory");
  const canWrite = authorizeModule("inventory");
  // Mayoreo y Compras eligen producto con su existencia a la vista.
  const canReadStock = authorizeModule("inventory", { alsoBy: ["wholesale", "storeAccounting"] });

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

  // Respuesta con `variantLabel`/`variantSku` ya resueltos y `isOrphan` si el
  // registro ya no corresponde a la forma actual del producto (no debería
  // pasar: products.js lo bloquea, pero queda visible si alguien edita la BD).
  const POPULATE_FIELDS = "name sku price images options variants";
  const toResponse = (item) => {
    const doc = sanitizeDoc(item);
    const product = doc.product && typeof doc.product === "object" ? doc.product : null;
    if (!product) return doc;
    if (doc.variant) {
      const variant = findVariant(product, doc.variant);
      doc.variantLabel = variant ? variantLabel(product, variant) : null;
      doc.variantSku = variant?.sku || null;
      doc.isOrphan = !variant;
    } else {
      doc.isOrphan = hasVariants(product);
    }
    return doc;
  };

  // Historial de movimientos (más recientes primero), paginado por `before`
  // (createdAt del último renglón recibido).
  router.get("/movements", canRead, async (req, res) => {
    try {
      const filter = {};
      if (req.query.product && isValidObjectId(req.query.product)) filter.product = req.query.product;
      if (req.query.variant && isValidObjectId(req.query.variant)) filter.variant = req.query.variant;
      if (MOVEMENT_REASONS.includes(req.query.reason)) filter.reason = req.query.reason;
      const createdAt = {};
      const from = req.query.from ? new Date(req.query.from) : null;
      const to = req.query.to ? new Date(req.query.to) : null;
      const before = req.query.before ? new Date(req.query.before) : null;
      if (from && !Number.isNaN(+from)) createdAt.$gte = from;
      if (to && !Number.isNaN(+to)) createdAt.$lt = to;
      if (before && !Number.isNaN(+before)) createdAt.$lt = createdAt.$lt && createdAt.$lt < before ? createdAt.$lt : before;
      if (Object.keys(createdAt).length) filter.createdAt = createdAt;
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);

      const rows = await InventoryMovement.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate("product", "name sku options variants")
        .populate("by", "name email")
        .lean();
      const items = rows.map((row) => {
        const product = row.product && typeof row.product === "object" ? row.product : null;
        const variant = product && row.variant ? findVariant(product, row.variant) : null;
        return {
          ...sanitizeDoc(row),
          product: product ? { _id: product._id, name: product.name, sku: product.sku } : row.product,
          variantLabel: variant ? variantLabel(product, variant) : null,
        };
      });
      return res.status(200).json({ items, hasMore: rows.length === limit });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar el historial de inventario.");
    }
  });

  router.get("/", canReadStock, async (req, res) => {
    try {
      const filter = {};
      if (req.query.status) filter.status = req.query.status;
      if (req.query.product && isValidObjectId(req.query.product)) filter.product = req.query.product;
      const items = await Inventory.find(filter).sort({ updatedAt: -1 }).populate("product", POPULATE_FIELDS);
      return res.status(200).json({ items: items.map(toResponse) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar el inventario.");
    }
  });

  router.post("/", canWrite, validatePayload(sendError), async (req, res) => {
    try {
      const Product = mongooseConnection.models.Product;
      const product = Product ? await Product.findById(req.body.product).select("name options variants").lean() : null;
      if (!product) {
        return sendError(res, 404, "PRODUCT_NOT_FOUND", "El producto referenciado no existe.");
      }
      if (hasVariants(product) && !req.body.variant) {
        return sendError(res, 400, "VARIANT_REQUIRED", `"${product.name}" tiene variantes: elige a cuál le registras inventario.`);
      }
      if (!hasVariants(product) && req.body.variant) {
        return sendError(res, 400, "VARIANT_NOT_FOUND", `"${product.name}" no tiene variantes.`);
      }
      if (req.body.variant && !findVariant(product, req.body.variant)) {
        return sendError(res, 404, "VARIANT_NOT_FOUND", "La variante referenciada no existe en el producto.");
      }

      const status = recalculateStatus(req.body.quantity, req.body.lowStockThreshold || 0);
      const item = new Inventory({ ...req.body, status });
      await item.save();
      await recordMovement(mongooseConnection, {
        product: item.product,
        variant: item.variant,
        delta: item.quantity,
        quantityAfter: item.quantity,
        reason: "initial",
        by: req.user?.id,
      });
      return res.status(201).json({ message: "Inventario registrado.", inventory: sanitizeDoc(item) });
    } catch (error) {
      if (error?.code === 11000) {
        return sendError(res, 409, "INVENTORY_ALREADY_EXISTS", "Ese producto (o variante) ya tiene registro de inventario; edítalo en lugar de crear otro.");
      }
      return handleMongooseError(sendError, res, error, "Error al registrar el inventario.");
    }
  });

  router.get("/:id", validateObjectIdParam("id"), canRead, ensureInventoryExists, async (req, res) => {
    await req.inventoryItem.populate("product", POPULATE_FIELDS);
    return res.status(200).json(toResponse(req.inventoryItem));
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
        const previousStatus = req.inventoryItem.status;
        const previousQuantity = req.inventoryItem.quantity;
        if (req.body.quantity !== undefined) req.inventoryItem.quantity = req.body.quantity;
        if (req.body.lowStockThreshold !== undefined) req.inventoryItem.lowStockThreshold = req.body.lowStockThreshold;
        if (req.body.notes !== undefined) req.inventoryItem.notes = req.body.notes;
        req.inventoryItem.status = recalculateStatus(req.inventoryItem.quantity, req.inventoryItem.lowStockThreshold || 0);

        await req.inventoryItem.save();
        await recordMovement(mongooseConnection, {
          product: req.inventoryItem.product,
          variant: req.inventoryItem.variant,
          delta: req.inventoryItem.quantity - previousQuantity,
          quantityAfter: req.inventoryItem.quantity,
          reason: "manual_adjust",
          note: req.body.movementNote,
          by: req.user?.id,
        });
        notifyStockAlerts(mongooseConnection, [{ item: req.inventoryItem, previousStatus }]);
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
  models: { Inventory: inventorySchema, InventoryMovement: inventoryMovementSchema },
  // Viven en lib/stockMovements.js; se re-exportan por compatibilidad.
  recalculateStatus,
  notifyStockAlerts,
};
