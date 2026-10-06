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
// campo al esquema por giro. Son solo informativos — lo que el cliente elige
// al comprar (talla, color…) son las variantes (`options`/`variants`, ver
// lib/variants.js), cada una con su SKU, existencias y precio opcional.
//
// `category` referencia a modules/categories.js. `featured`/`sortOrder` los
// usa el storefront para destacar y ordenar (orden por defecto del catálogo
// público: sortOrder y luego nombre).
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
const { getPurchaseLimit, filterInStock } = require("../lib/purchaseLimits");
const { createModuleAuthorizer } = require("../lib/permissions");
const { hasVariants, normalizeOptions, normalizeVariants, validateVariants } = require("../lib/variants");
const { findCategoryByRef } = require("./categories");

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

const productOptionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    values: { type: [String], default: [] },
  },
  { _id: false }
);

// Con _id propio: es lo que referencian Inventory.variant y Order.items[].variant.
const productVariantSchema = new mongoose.Schema({
  sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 60 },
  // Un valor por opción, en el mismo orden que `options`.
  optionValues: { type: [String], default: [] },
  // Vacíos = heredan price/compareAtPrice del producto (lib/variants.js#variantPricing).
  price: { type: Number, min: 0 },
  compareAtPrice: { type: Number, min: 0 },
  image: { type: String, trim: true, maxlength: 300 },
  isActive: { type: Boolean, default: true },
});

const PRODUCT_DESCRIPTION_MAX = 20000;

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
    sku: { type: String, required: true, trim: true, uppercase: true, unique: true, maxlength: 60 },
    // HTML (etiquetas incluidas): 20 000 caracteres dan para una ficha larga y
    // quedan muy por debajo del límite de 100 KB de express.json().
    description: { type: String, trim: true, maxlength: PRODUCT_DESCRIPTION_MAX },
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
    images: { type: [String], default: [] },
    attributes: { type: [productAttributeSchema], default: [] },
    options: { type: [productOptionSchema], default: [] },
    variants: { type: [productVariantSchema], default: [] },
    featured: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    // Promedio y número de reseñas aprobadas. Solo los escribe
    // modules/reviews.js al moderar; nunca se aceptan del payload.
    ratingAvg: { type: Number, min: 0, max: 5, default: 0 },
    ratingCount: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);
productSchema.index({ name: 1 });
productSchema.index({ isActive: 1 });
productSchema.index({ category: 1 });
// SKU de variante único entre productos (dentro del mismo producto lo revisa
// lib/variants.js#validateVariants).
productSchema.index({ "variants.sku": 1 }, { unique: true, partialFilterExpression: { "variants.sku": { $exists: true } } });

const PUBLIC_SORTS = ["relevance", "price_asc", "price_desc", "newest", "name"];
const MAX_PUBLIC_LIMIT = 100;
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const validatePayload = (sendError) => (req, res, next) => {
  const payload = req.body || {};
  const isCreate = req.method === "POST";
  // Las calificaciones las calcula modules/reviews.js.
  delete payload.ratingAvg;
  delete payload.ratingCount;

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
  // Existencia de la categoría: en el handler (resolveCategory).
  if (payload.category !== undefined) {
    if (payload.category === null || payload.category === "") {
      req.body.category = null;
    } else if (!isValidObjectId(payload.category)) {
      return sendError(res, 400, "VALIDATION_ERROR", "category debe ser un id de categoría válido.");
    } else {
      req.body.category = payload.category;
    }
  }
  if (payload.featured !== undefined) req.body.featured = Boolean(payload.featured);
  if (payload.sortOrder !== undefined) {
    const sortOrder = asFiniteNumber(payload.sortOrder);
    if (sortOrder === null || sortOrder < 0) return sendError(res, 400, "VALIDATION_ERROR", "sortOrder debe ser un número >= 0.");
    req.body.sortOrder = Math.floor(sortOrder);
  }
  // Forma de options/variants aquí; la congruencia entre ambos, en el handler
  // (en un PUT puede llegar solo uno y se compara contra lo guardado).
  if (payload.options !== undefined) {
    const options = normalizeOptions(payload.options);
    if (options.error) return sendError(res, 400, "VALIDATION_ERROR", options.error);
    req.body.options = options.value;
  }
  if (payload.variants !== undefined) {
    const variants = normalizeVariants(payload.variants, isValidObjectId);
    if (variants.error) return sendError(res, 400, "VALIDATION_ERROR", variants.error);
    req.body.variants = variants.value;
  }
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

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, sendError } = ctx;
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

  // Categoría del payload → existe y es de productos. Devuelve un mensaje de
  // error o null (null también si no viene o se está quitando).
  const resolveCategory = async (categoryId) => {
    if (!categoryId) return null;
    const Category = mongooseConnection.models.Category;
    const exists = Category ? await Category.exists({ _id: categoryId, kind: "product" }) : null;
    return exists ? null : "La categoría elegida no existe.";
  };

  // El inventario siempre sigue la forma actual del producto: un registro sin
  // variante, o uno por variante. Por eso no se puede quitar una variante (ni
  // pasar de "sin variantes" a "con variantes" y viceversa) mientras tenga
  // inventario registrado — igual que no se borra un producto con inventario.
  const checkInventoryForVariantChange = async (product, nextOptions, nextVariants) => {
    const Inventory = mongooseConnection.models.Inventory;
    if (!Inventory) return null;
    const hadVariants = hasVariants(product);
    const willHaveVariants = nextOptions.length > 0;

    if (!hadVariants && willHaveVariants) {
      const base = await Inventory.exists({ product: product._id, variant: null });
      return base
        ? "Este producto tiene inventario sin variante. Elimina ese registro de inventario antes de agregarle variantes."
        : null;
    }
    const keptIds = new Set(nextVariants.filter((v) => v._id).map((v) => String(v._id)));
    const removedIds = (product.variants || []).map((v) => v._id).filter((id) => !keptIds.has(String(id)));
    if (removedIds.length === 0) return null;
    const removedWithStock = await Inventory.exists({ product: product._id, variant: { $in: removedIds } });
    return removedWithStock
      ? "Una de las variantes que quitaste tiene inventario registrado. Elimina su inventario o, mejor, desactívala."
      : null;
  };

  // ---- rutas públicas (storefront) — sin verifyToken, siempre isActive:true
  // y con stock (ver filterInStock) ----
  //
  // Filtros: q (nombre, descripción o SKU), category (id o slug), featured,
  // minPrice/maxPrice (precio efectivo; con variantes, cualquiera disponible),
  // sort (relevance|price_asc|price_desc|newest|name) y paginación opcional
  // page/limit. Sin `limit` devuelve todo (comportamiento anterior). Los
  // filtros de precio, el orden y la paginación se aplican después de
  // filterInStock para que `total` cuente solo lo que realmente se ve.
  router.get("/public", async (req, res) => {
    try {
      const filter = { isActive: true };
      if (req.query.category) {
        const category = await findCategoryByRef(mongooseConnection, req.query.category);
        if (!category || category.isActive === false) return res.status(200).json({ items: [], total: 0, page: 1, limit: null });
        filter.category = category._id;
      }
      if (req.query.featured === "true") filter.featured = true;
      const q = asTrimmedString(req.query.q).slice(0, 100);
      if (q) {
        const pattern = new RegExp(escapeRegex(q), "i");
        filter.$or = [{ name: pattern }, { description: pattern }, { sku: pattern }, { "variants.sku": pattern }];
      }

      const products = await Product.find(filter).populate("category", "name slug").lean();
      const Inventory = mongooseConnection.models.Inventory;
      let items = await filterInStock(Inventory, products, await getPurchaseLimit(mongooseConnection));

      const minPrice = asFiniteNumber(req.query.minPrice);
      const maxPrice = asFiniteNumber(req.query.maxPrice);
      const displayPrice = (p) => p.priceRange?.min ?? p.price;
      if (minPrice !== null || maxPrice !== null) {
        items = items.filter((p) => {
          const low = p.priceRange?.min ?? p.price;
          const high = p.priceRange?.max ?? p.price;
          return (minPrice === null || high >= minPrice) && (maxPrice === null || low <= maxPrice);
        });
      }

      const sort = PUBLIC_SORTS.includes(req.query.sort) ? req.query.sort : "relevance";
      const byName = (a, b) => a.name.localeCompare(b.name, "es");
      const comparators = {
        relevance: (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || byName(a, b),
        price_asc: (a, b) => displayPrice(a) - displayPrice(b) || byName(a, b),
        price_desc: (a, b) => displayPrice(b) - displayPrice(a) || byName(a, b),
        newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
        name: byName,
      };
      items.sort(comparators[sort]);

      const total = items.length;
      const limitParam = asFiniteNumber(req.query.limit);
      if (limitParam === null) return res.status(200).json({ items, total, page: 1, limit: null });
      const limit = Math.min(Math.max(Math.floor(limitParam), 1), MAX_PUBLIC_LIMIT);
      const page = Math.max(Math.floor(asFiniteNumber(req.query.page) || 1), 1);
      return res.status(200).json({ items: items.slice((page - 1) * limit, page * limit), total, page, limit });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar productos.");
    }
  });

  router.get("/public/:id", validateObjectIdParam("id"), async (req, res) => {
    try {
      const product = await Product.findOne({ _id: req.params.id, isActive: true }).populate("category", "name slug").lean();
      if (!product) return sendError(res, 404, "PRODUCT_NOT_FOUND", "Producto no encontrado.");

      const Inventory = mongooseConnection.models.Inventory;
      const [inStock] = await filterInStock(Inventory, [product], await getPurchaseLimit(mongooseConnection));
      if (!inStock) return sendError(res, 404, "PRODUCT_NOT_FOUND", "Producto no encontrado.");

      return res.status(200).json(inStock);
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar el producto.");
    }
  });

  // Productos relacionados = misma categoría, disponibles, sin el propio.
  // Sin categoría no hay relacionados (lista vacía, no error).
  router.get("/public/:id/related", validateObjectIdParam("id"), async (req, res) => {
    try {
      const product = await Product.findOne({ _id: req.params.id, isActive: true }).select("category").lean();
      if (!product) return sendError(res, 404, "PRODUCT_NOT_FOUND", "Producto no encontrado.");
      if (!product.category) return res.status(200).json({ items: [] });

      const limit = Math.min(Math.max(Math.floor(asFiniteNumber(req.query.limit) || 4), 1), 12);
      const candidates = await Product.find({ _id: { $ne: product._id }, category: product.category, isActive: true })
        .sort({ sortOrder: 1, name: 1 })
        .populate("category", "name slug")
        .lean();
      const Inventory = mongooseConnection.models.Inventory;
      const inStock = await filterInStock(Inventory, candidates, await getPurchaseLimit(mongooseConnection));
      return res.status(200).json({ items: inStock.slice(0, limit) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar productos relacionados.");
    }
  });

  // ---- de aquí en adelante, todo el router exige JWT de staff ----
  router.use(verifyToken);

  // Permisos por tienda (lib/permissions.js): leer el catálogo también lo
  // necesitan Inventario, Pedidos y Configurar App (selector de productos), aunque la tienda no
  // haya contratado Productos (el catálogo ya es público); escribir, solo Productos.
  const { authorizeModule } = createModuleAuthorizer({ mongooseConnection, sendError });
  const canRead = authorizeModule("products", { alsoBy: ["inventory", "orders", "appConfig", "wholesale", "storeAccounting"], requireContract: false });
  const canWrite = authorizeModule("products");

  router.get("/", canRead, async (req, res) => {
    try {
      const filter = {};
      if (req.query.isActive === "true") filter.isActive = true;
      if (req.query.isActive === "false") filter.isActive = false;
      if (req.query.category && isValidObjectId(req.query.category)) filter.category = req.query.category;
      const products = await Product.find(filter).sort({ sortOrder: 1, name: 1 }).populate("category", "name slug");
      return res.status(200).json({ items: products.map(sanitizeDoc) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar productos.");
    }
  });

  router.post("/", canWrite, validatePayload(sendError), async (req, res) => {
    try {
      const categoryError = await resolveCategory(req.body.category);
      if (categoryError) return sendError(res, 400, "CATEGORY_NOT_FOUND", categoryError);
      const variantsError = validateVariants(req.body.options || [], req.body.variants || [], req.body.sku);
      if (variantsError) return sendError(res, 400, "VALIDATION_ERROR", variantsError);

      const product = new Product(req.body);
      await product.save();
      return res.status(201).json({ message: "Producto creado.", product: sanitizeDoc(product) });
    } catch (error) {
      if (error?.code === 11000) return sendError(res, 409, "SKU_TAKEN", "El SKU del producto o de una variante ya existe en otro producto.");
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
        if (req.body.category !== undefined) {
          const categoryError = await resolveCategory(req.body.category);
          if (categoryError) return sendError(res, 400, "CATEGORY_NOT_FOUND", categoryError);
        }

        if (req.body.options !== undefined || req.body.variants !== undefined || req.body.sku !== undefined) {
          const nextOptions = req.body.options ?? req.product.options.map((o) => ({ name: o.name, values: [...o.values] }));
          const nextVariants = req.body.variants ?? req.product.variants.map((v) => v.toObject());
          const variantsError = validateVariants(nextOptions, nextVariants, req.body.sku ?? req.product.sku);
          if (variantsError) return sendError(res, 400, "VALIDATION_ERROR", variantsError);
          const inventoryError = await checkInventoryForVariantChange(req.product, nextOptions, nextVariants);
          if (inventoryError) return sendError(res, 409, "VARIANT_HAS_INVENTORY", inventoryError);
        }

        const allowedFields = [
          "name", "sku", "description", "price", "compareAtPrice", "category", "images", "attributes",
          "options", "variants", "featured", "sortOrder", "isActive",
        ];
        for (const key of allowedFields) {
          if (req.body[key] !== undefined) req.product[key] = req.body[key];
        }
        await req.product.save();
        return res.status(200).json({ message: "Producto actualizado.", product: sanitizeDoc(req.product) });
      } catch (error) {
        if (error?.code === 11000) return sendError(res, 409, "SKU_TAKEN", "El SKU del producto o de una variante ya existe en otro producto.");
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
