// Inventario: un registro de stock por producto, o uno por variante si el
// producto tiene variantes (lib/variants.js). Roadmap eCommerce (ver
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
const { createModuleAuthorizer } = require("../lib/permissions");
const { hasVariants, findVariant, variantLabel } = require("../lib/variants");
const { sendMail } = require("../lib/mailer");
const { lowStockEmailTemplate } = require("../lib/emailTemplates");

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

const recalculateStatus = (quantity, threshold) => {
  if (quantity <= 0) return "out_of_stock";
  if (quantity <= threshold) return "low_stock";
  return "in_stock";
};

// Alertas de inventario (§4.3 del Roadmap de cotizaciones): un correo a la
// tienda cuando un registro EMPEORA de estado (in_stock → low_stock,
// cualquiera → out_of_stock). Reabastecer o volver a guardar sin cambio no
// avisa. `changes`: [{ item, previousStatus }] con item ya guardado; varios
// cambios (p. ej. todos los renglones de un pedido confirmado) van en un solo
// correo. Respeta StoreConfig.lowStockAlerts. Best-effort: nunca lanza.
const STATUS_RANK = { in_stock: 0, low_stock: 1, out_of_stock: 2 };

const notifyStockAlerts = async (mongooseConnection, changes) => {
  try {
    const worsened = changes.filter(({ item, previousStatus }) => STATUS_RANK[item.status] > (STATUS_RANK[previousStatus] ?? 0));
    if (worsened.length === 0) return;

    const { StoreConfig, Product } = mongooseConnection.models;
    const storeConfig = StoreConfig ? await StoreConfig.findOne({ singletonKey: "default" }).lean() : null;
    if (storeConfig?.lowStockAlerts === false) return;
    const to = process.env.CONTACT_EMAIL_TO || process.env.EMAIL_USER;
    if (!to || !Product) return;

    const products = await Product.find({ _id: { $in: worsened.map(({ item }) => item.product) } })
      .select("name sku options variants")
      .lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const items = worsened.map(({ item }) => {
      const product = byId.get(String(item.product)) || {};
      const variant = item.variant ? findVariant(product, item.variant) : null;
      return {
        name: product.name || "Producto",
        variantLabel: variant ? variantLabel(product, variant) : undefined,
        sku: variant?.sku || product.sku,
        quantity: item.quantity,
        threshold: item.lowStockThreshold || 0,
        status: item.status,
      };
    });

    const backendPublicUrl = (process.env.BACKEND_PUBLIC_URL || "").replace(/\/+$/, "");
    const logoAbsoluteUrl = backendPublicUrl && storeConfig?.logoUrl
      ? `${backendPublicUrl}/${String(storeConfig.logoUrl).replace(/^\/+/, "")}`
      : undefined;
    const { subject, html, text } = lowStockEmailTemplate({ items, storeConfig, logoAbsoluteUrl });
    await sendMail({ to, subject, text, html });
  } catch (error) {
    console.error("No fue posible enviar la alerta de inventario:", error.message);
  }
};

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

  // status nunca se acepta del cliente.
  delete req.body.status;

  return next();
};

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, sendError } = ctx;
  const Inventory = getOrCreateModel(mongooseConnection, "Inventory", inventorySchema);

  const router = express.Router();
  router.use(verifyToken);

  // Permisos por tienda (lib/permissions.js).
  const { authorizeModule } = createModuleAuthorizer({ mongooseConnection, sendError });
  const canRead = authorizeModule("inventory");
  const canWrite = authorizeModule("inventory");

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

  router.get("/", canRead, async (req, res) => {
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
        if (req.body.quantity !== undefined) req.inventoryItem.quantity = req.body.quantity;
        if (req.body.lowStockThreshold !== undefined) req.inventoryItem.lowStockThreshold = req.body.lowStockThreshold;
        if (req.body.notes !== undefined) req.inventoryItem.notes = req.body.notes;
        req.inventoryItem.status = recalculateStatus(req.inventoryItem.quantity, req.inventoryItem.lowStockThreshold || 0);

        await req.inventoryItem.save();
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
  models: { Inventory: inventorySchema },
  // Reutilizado por modules/orders.js al descontar/restaurar stock cuando un
  // pedido entra o sale de "confirmed" — mismo criterio de cálculo que este
  // módulo usa para su propio CRUD, para no tener dos copias de la regla.
  recalculateStatus,
  // Y este, para avisar si confirmar un pedido dejó productos en su mínimo.
  notifyStockAlerts,
};
