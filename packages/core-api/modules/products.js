// Catálogo de productos. Roadmap eCommerce (backend/frontend-admin/src/components/AdminMenu.jsx).
// Las imágenes se suben aparte, vía la biblioteca de medios
// (POST /api/media, packages/core-api/modules/media.js) — este módulo solo
// guarda las rutas resultantes ("uploads/...") en `images`.
//
// GET /public y GET /public/:id son las únicas rutas sin auth: las consume el
// storefront (frontend-user) para la tienda pública. Van montadas ANTES de
// `router.use(verifyToken)` (mismo criterio que storeConfig.js#GET /public),
// siempre filtran isActive:true — nunca exponen un producto dado de baja — y,
// además, solo devuelven productos con inventario cargado y quantity > 0 (ver
// filterInStock) — un producto sin registro de inventario se trata como sin
// existencias, no como "ilimitado". Cada producto público lleva además
// `purchaseLimit` (tope por pedido configurable, lib/purchaseLimits.js; null
// = sin tope) y `maxQty` = min(existencias, purchaseLimit): lo máximo que el
// storefront deja agregar. Con tope, arriba de él no se ve el inventario real.
//
// `attributes`: especificaciones libres "Nombre: valor" en el orden en que se
// muestran (Notas de cata: cacao, panela · Tueste: medio · Material: barro ·
// Talla: M). Genérico a propósito: cada tienda define los suyos sin agregar un
// campo al esquema por giro.
const express = require("express");
const mongoose = require("mongoose");
const {
  sanitizeDoc,
  handleMongooseError,
  asTrimmedString,
  asFiniteNumber,
  isValidObjectId,
  getOrCreateModel,
} = require("../lib/moduleHelpers");
const { getPurchaseLimit } = require("../lib/purchaseLimits");

const MAX_ATTRIBUTES = 30;
const MAX_ATTRIBUTE_NAME = 60;
const MAX_ATTRIBUTE_VALUE = 300;

const productAttributeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: MAX_ATTRIBUTE_NAME },
    value: { type: String, required: true, trim: true, maxlength: MAX_ATTRIBUTE_VALUE },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
    sku: { type: String, required: true, trim: true, uppercase: true, unique: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 2000 },
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0 },
    // String libre a propósito: no existe un modelo Category todavía, no se
    // agrega en esta entrega para no sobre-alcanzar el roadmap pedido.
    category: { type: String, trim: true, maxlength: 100 },
    images: { type: [String], default: [] },
    attributes: { type: [productAttributeSchema], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
productSchema.index({ name: 1 });
productSchema.index({ isActive: 1 });

const validatePayload = (sendError) => (req, res, next) => {
  const payload = req.body || {};
  const isCreate = req.method === "POST";

  if (isCreate || payload.name !== undefined) {
    const name = asTrimmedString(payload.name);
    if (!name) return sendError(res, 400, "VALIDATION_ERROR", "name es requerido.");
    req.body.name = name;
  }

  if (isCreate || payload.sku !== undefined) {
    const sku = asTrimmedString(payload.sku).toUpperCase();
    if (!sku) return sendError(res, 400, "VALIDATION_ERROR", "sku es requerido.");
    req.body.sku = sku;
  }

  if (isCreate || payload.price !== undefined) {
    const price = asFiniteNumber(payload.price);
    if (price === null || price < 0) return sendError(res, 400, "VALIDATION_ERROR", "price debe ser un número >= 0.");
    req.body.price = price;
  }

  if (payload.compareAtPrice !== undefined) {
    if (payload.compareAtPrice === null || payload.compareAtPrice === "") {
      req.body.compareAtPrice = undefined;
    } else {
      const compareAtPrice = asFiniteNumber(payload.compareAtPrice);
      if (compareAtPrice === null || compareAtPrice < 0) {
        return sendError(res, 400, "VALIDATION_ERROR", "compareAtPrice debe ser un número >= 0.");
      }
      req.body.compareAtPrice = compareAtPrice;
    }
  }

  if (payload.description !== undefined) req.body.description = asTrimmedString(payload.description);
  if (payload.category !== undefined) req.body.category = asTrimmedString(payload.category);
  if (payload.images !== undefined) {
    req.body.images = Array.isArray(payload.images) ? payload.images.filter((i) => typeof i === "string") : [];
  }
  if (payload.attributes !== undefined) {
    if (!Array.isArray(payload.attributes)) {
      return sendError(res, 400, "VALIDATION_ERROR", "attributes debe ser un arreglo.");
    }
    const attributes = [];
    for (const [index, item] of payload.attributes.entries()) {
      const name = asTrimmedString(item?.name);
      const value = asTrimmedString(item?.value);
      if (!name && !value) continue; // fila vacía: se descarta sin error
      if (!name || !value) {
        return sendError(res, 400, "VALIDATION_ERROR", `attributes[${index}] necesita nombre y valor.`);
      }
      if (name.length > MAX_ATTRIBUTE_NAME) {
        return sendError(res, 400, "VALIDATION_ERROR", `attributes[${index}].name excede ${MAX_ATTRIBUTE_NAME} caracteres.`);
      }
      if (value.length > MAX_ATTRIBUTE_VALUE) {
        return sendError(res, 400, "VALIDATION_ERROR", `attributes[${index}].value excede ${MAX_ATTRIBUTE_VALUE} caracteres.`);
      }
      attributes.push({ name, value });
    }
    if (attributes.length > MAX_ATTRIBUTES) {
      return sendError(res, 400, "VALIDATION_ERROR", `attributes admite máximo ${MAX_ATTRIBUTES} elementos.`);
    }
    req.body.attributes = attributes;
  }
  if (payload.isActive !== undefined) req.body.isActive = Boolean(payload.isActive);

  return next();
};

// Solo se muestran productos con inventario cargado y quantity > 0 — un
// producto sin registro de inventario (nunca se le dio de alta stock) se
// considera sin existencias, no "ilimitado" (decisión explícita del
// negocio). Usado únicamente por GET /public y GET /public/:id — las rutas
// de staff siguen viendo el catálogo completo para poder gestionarlo.
// Devuelve los productos ya sanitizados y con `maxQty`/`purchaseLimit`.
const filterInStock = async (Inventory, products, purchaseLimit) => {
  if (!Inventory || products.length === 0) return [];
  const ids = products.map((p) => p._id);
  const stocked = await Inventory.find({ product: { $in: ids }, quantity: { $gt: 0 } })
    .select("product quantity")
    .lean();
  const stockById = new Map(stocked.map((i) => [String(i.product), i.quantity]));
  return products
    .filter((p) => stockById.has(String(p._id)))
    .map((p) => {
      const stock = Math.floor(stockById.get(String(p._id)));
      return {
        ...sanitizeDoc(p),
        maxQty: purchaseLimit ? Math.min(stock, purchaseLimit) : stock,
        purchaseLimit,
      };
    });
};

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, authorizeRoles, ROLES, STAFF_ROLES, sendError } = ctx;
  const Product = getOrCreateModel(mongooseConnection, "Product", productSchema);

  const router = express.Router();

  const validateObjectIdParam = (paramName) => (req, res, next) => {
    if (!isValidObjectId(req.params?.[paramName])) {
      return sendError(res, 400, "INVALID_OBJECT_ID", `${paramName} no válido`);
    }
    return next();
  };

  const ensureProductExists = async (req, res, next) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) return sendError(res, 404, "PRODUCT_NOT_FOUND", "Producto no encontrado.");
      req.product = product;
      return next();
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar el producto.");
    }
  };

  // ---- rutas públicas (storefront) — sin verifyToken, siempre isActive:true
  // y con stock (ver filterInStock) ----
  router.get("/public", async (req, res) => {
    try {
      const filter = { isActive: true };
      if (req.query.category) filter.category = asTrimmedString(req.query.category);
      const products = await Product.find(filter).sort({ name: 1 }).lean();

      const Inventory = mongooseConnection.models.Inventory;
      const inStock = await filterInStock(Inventory, products, await getPurchaseLimit(mongooseConnection));
      return res.status(200).json({ items: inStock });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar productos.");
    }
  });

  router.get("/public/:id", validateObjectIdParam("id"), async (req, res) => {
    try {
      const product = await Product.findOne({ _id: req.params.id, isActive: true }).lean();
      if (!product) return sendError(res, 404, "PRODUCT_NOT_FOUND", "Producto no encontrado.");

      const Inventory = mongooseConnection.models.Inventory;
      const [inStock] = await filterInStock(Inventory, [product], await getPurchaseLimit(mongooseConnection));
      if (!inStock) return sendError(res, 404, "PRODUCT_NOT_FOUND", "Producto no encontrado.");

      return res.status(200).json(inStock);
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar el producto.");
    }
  });

  // ---- de aquí en adelante, todo el router exige JWT de staff ----
  router.use(verifyToken);

  const canRead = authorizeRoles(...STAFF_ROLES);
  const canWrite = authorizeRoles(ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN, ROLES.COLLABORATOR);

  router.get("/", canRead, async (req, res) => {
    try {
      const filter = {};
      if (req.query.isActive === "true") filter.isActive = true;
      if (req.query.isActive === "false") filter.isActive = false;
      const products = await Product.find(filter).sort({ name: 1 });
      return res.status(200).json({ items: products.map(sanitizeDoc) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar productos.");
    }
  });

  router.post("/", canWrite, validatePayload(sendError), async (req, res) => {
    try {
      const product = new Product(req.body);
      await product.save();
      return res.status(201).json({ message: "Producto creado.", product: sanitizeDoc(product) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al crear el producto.");
    }
  });

  router.get("/:id", validateObjectIdParam("id"), canRead, ensureProductExists, async (req, res) => {
    return res.status(200).json(sanitizeDoc(req.product));
  });

  router.put(
    "/:id",
    validateObjectIdParam("id"),
    canWrite,
    ensureProductExists,
    validatePayload(sendError),
    async (req, res) => {
      try {
        const allowedFields = ["name", "sku", "description", "price", "compareAtPrice", "category", "images", "attributes", "isActive"];
        for (const key of allowedFields) {
          if (req.body[key] !== undefined) req.product[key] = req.body[key];
        }
        await req.product.save();
        return res.status(200).json({ message: "Producto actualizado.", product: sanitizeDoc(req.product) });
      } catch (error) {
        return handleMongooseError(sendError, res, error, "Error al actualizar el producto.");
      }
    }
  );

  router.delete("/:id", validateObjectIdParam("id"), canWrite, ensureProductExists, async (req, res) => {
    try {
      // Inventory/Order se registran en la misma conexión (por otros módulos
      // de este mismo paquete) — se consultan por nombre de modelo en vez de
      // requerir esos archivos directamente, para no acoplar este módulo a
      // que los otros dos estén necesariamente montados.
      const Inventory = mongooseConnection.models.Inventory;
      const Order = mongooseConnection.models.Order;
      const [hasInventory, hasOrders] = await Promise.all([
        Inventory ? Inventory.exists({ product: req.product._id }) : null,
        Order ? Order.exists({ "items.product": req.product._id }) : null,
      ]);
      if (hasInventory || hasOrders) {
        return sendError(
          res,
          409,
          "PRODUCT_HAS_RELATED_RECORDS",
          "No se puede eliminar el producto: tiene inventario o pedidos registrados."
        );
      }
      await req.product.deleteOne();
      return res.status(200).json({ message: "Producto eliminado." });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al eliminar el producto.");
    }
  });

  app.use("/api/products", router);
}

module.exports = {
  name: "products",
  registerRoutes,
  models: { Product: productSchema },
};
