// Categorías del catálogo. Reemplazan al viejo `Product.category` de texto
// libre: ahora el producto guarda la referencia (ObjectId) y la categoría
// tiene su propia imagen, orden y bandera de destacada (bloques de "categorías
// destacadas" del storefront y `categoryGrid` del home de la app).
//
// `kind` separa categorías de productos de las de servicios (catálogo de
// modules/services.js, que usa Citas). El `slug` es lo que guardan las secciones del home de la app
// (modules/appHome.js) y lo que acepta `?category=` en el catálogo público.
//
// No es un módulo aparte en lib/permissions.js: los permisos siguen al
// `kind`. Las de producto, como Productos (leer también lo pueden
// Inventario, Pedidos y Configurar App; escribir, solo Productos). Las de
// servicio, como Servicios (leer también Citas).
//
// Datos anteriores (categoría como texto en el producto, nombres de categoría
// en el home de la app): backend/scripts/migrate-categories-variants.mongo.js.
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
const { createModuleAuthorizer } = require("../lib/permissions");

const CATEGORY_KINDS = ["product", "service"];
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// "Café de Olla" → "cafe-de-olla". Mismo algoritmo que el script de migración.
const slugify = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 80, match: SLUG_PATTERN },
    kind: { type: String, enum: CATEGORY_KINDS, default: "product", immutable: true },
    description: { type: String, trim: true, maxlength: 500 },
    image: { type: String, trim: true, maxlength: 300 },
    featured: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
categorySchema.index({ kind: 1, slug: 1 }, { unique: true });
categorySchema.index({ kind: 1, sortOrder: 1, name: 1 });

const validatePayload = (sendError) => (req, res, next) => {
  const payload = req.body || {};
  const isCreate = req.method === "POST";

  if (isCreate || payload.name !== undefined) {
    const name = asTrimmedString(payload.name);
    if (!name) return sendError(res, 400, "VALIDATION_ERROR", "name es requerido.");
    req.body.name = name;
  }

  // Sin slug en el alta se genera del nombre; en una edición solo cambia si se manda.
  if (payload.slug !== undefined && payload.slug !== "") {
    const slug = slugify(payload.slug);
    if (!SLUG_PATTERN.test(slug)) return sendError(res, 400, "VALIDATION_ERROR", "slug solo admite letras, números y guiones.");
    req.body.slug = slug;
  } else if (isCreate) {
    const slug = slugify(req.body.name);
    if (!slug) return sendError(res, 400, "VALIDATION_ERROR", "No fue posible generar el slug a partir del nombre; captúralo a mano.");
    req.body.slug = slug;
  } else {
    delete req.body.slug;
  }

  if (isCreate) {
    const kind = payload.kind === undefined ? "product" : asTrimmedString(payload.kind);
    if (!CATEGORY_KINDS.includes(kind)) {
      return sendError(res, 400, "VALIDATION_ERROR", `kind debe ser uno de: ${CATEGORY_KINDS.join(", ")}.`);
    }
    req.body.kind = kind;
  } else {
    delete req.body.kind;
  }

  if (payload.description !== undefined) req.body.description = asTrimmedString(payload.description);
  if (payload.image !== undefined) req.body.image = asTrimmedString(payload.image);
  if (payload.featured !== undefined) req.body.featured = Boolean(payload.featured);
  if (payload.isActive !== undefined) req.body.isActive = Boolean(payload.isActive);
  if (payload.sortOrder !== undefined) {
    const sortOrder = asFiniteNumber(payload.sortOrder);
    if (sortOrder === null || sortOrder < 0) return sendError(res, 400, "VALIDATION_ERROR", "sortOrder debe ser un número >= 0.");
    req.body.sortOrder = Math.floor(sortOrder);
  }

  return next();
};

// Respuesta pública: solo lo que el storefront/app necesita mostrar.
const toPublic = (category) => ({
  _id: category._id,
  name: category.name,
  slug: category.slug,
  description: category.description || "",
  image: category.image || "",
  featured: Boolean(category.featured),
  sortOrder: category.sortOrder || 0,
});

// `?category=` del catálogo y secciones del home: acepta id o slug. Devuelve
// el documento (lean) o null. Exportado para modules/products.js y appHome.js.
const findCategoryByRef = async (connection, ref, { kind = "product" } = {}) => {
  const Category = connection.models.Category;
  const value = asTrimmedString(ref);
  if (!Category || !value) return null;
  if (isValidObjectId(value) && /^[0-9a-f]{24}$/i.test(value)) {
    const byId = await Category.findOne({ _id: value, kind }).lean();
    if (byId) return byId;
  }
  return Category.findOne({ kind, slug: value.toLowerCase() }).lean();
};

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, sendError } = ctx;
  const Category = getOrCreateModel(mongooseConnection, "Category", categorySchema);
  const router = express.Router();

  const parseKind = (value) => (CATEGORY_KINDS.includes(value) ? value : "product");

  const validateObjectIdParam = (paramName) => (req, res, next) => {
    if (!isValidObjectId(req.params?.[paramName])) {
      return sendError(res, 400, "INVALID_OBJECT_ID", `${paramName} no válido`);
    }
    return next();
  };

  const ensureCategoryExists = async (req, res, next) => {
    try {
      const category = await Category.findById(req.params.id);
      if (!category) return sendError(res, 404, "CATEGORY_NOT_FOUND", "Categoría no encontrada.");
      req.category = category;
      return next();
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar la categoría.");
    }
  };

  // ---- pública (storefront / app): solo activas ----
  router.get("/public", async (req, res) => {
    try {
      const filter = { kind: parseKind(req.query.kind), isActive: true };
      if (req.query.featured === "true") filter.featured = true;
      const categories = await Category.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
      return res.status(200).json({ items: categories.map(toPublic) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar categorías.");
    }
  });

  router.use(verifyToken);

  const { authorizeModule } = createModuleAuthorizer({ mongooseConnection, sendError });
  const authorizers = {
    product: {
      read: authorizeModule("products", { alsoBy: ["inventory", "orders", "appConfig"], requireContract: false }),
      write: authorizeModule("products"),
    },
    service: {
      read: authorizeModule("services", { alsoBy: ["appointments"], requireContract: false }),
      write: authorizeModule("services"),
    },
  };
  // El kind sale del query (listado), del body (alta) o de la categoría ya
  // cargada (ver/editar/borrar: ensureCategoryExists va antes).
  const kindOf = (req) => req.category?.kind || parseKind(req.query?.kind ?? req.body?.kind);
  const canRead = (req, res, next) => authorizers[kindOf(req)].read(req, res, next);
  const canWrite = (req, res, next) => authorizers[kindOf(req)].write(req, res, next);

  // Con `productCount` (todos los productos o servicios de la categoría,
  // activos o no; mismo campo para los dos kinds) para que el admin vea qué
  // categorías están en uso antes de borrar.
  router.get("/", canRead, async (req, res) => {
    try {
      const filter = { kind: parseKind(req.query.kind) };
      if (req.query.isActive === "true") filter.isActive = true;
      if (req.query.isActive === "false") filter.isActive = false;
      const categories = await Category.find(filter).sort({ sortOrder: 1, name: 1 }).lean();

      const Items = filter.kind === "service" ? mongooseConnection.models.Service : mongooseConnection.models.Product;
      const counts = Items
        ? await Items.aggregate([
            { $match: { category: { $in: categories.map((c) => c._id) } } },
            { $group: { _id: "$category", count: { $sum: 1 } } },
          ])
        : [];
      const countById = new Map(counts.map((c) => [String(c._id), c.count]));
      const items = categories.map((c) => ({ ...sanitizeDoc(c), productCount: countById.get(String(c._id)) || 0 }));
      return res.status(200).json({ items });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar categorías.");
    }
  });

  router.post("/", canWrite, validatePayload(sendError), async (req, res) => {
    try {
      const category = new Category(req.body);
      await category.save();
      return res.status(201).json({ message: "Categoría creada.", category: sanitizeDoc(category) });
    } catch (error) {
      if (error?.code === 11000) {
        return sendError(res, 409, "CATEGORY_SLUG_TAKEN", `Ya existe una categoría con el slug "${req.body.slug}".`);
      }
      return handleMongooseError(sendError, res, error, "Error al crear la categoría.");
    }
  });

  router.get("/:id", validateObjectIdParam("id"), ensureCategoryExists, canRead, async (req, res) => {
    return res.status(200).json(sanitizeDoc(req.category));
  });

  router.put(
    "/:id",
    validateObjectIdParam("id"),
    ensureCategoryExists,
    canWrite,
    validatePayload(sendError),
    async (req, res) => {
      try {
        const allowedFields = ["name", "slug", "description", "image", "featured", "sortOrder", "isActive"];
        for (const key of allowedFields) {
          if (req.body[key] !== undefined) req.category[key] = req.body[key];
        }
        await req.category.save();
        return res.status(200).json({ message: "Categoría actualizada.", category: sanitizeDoc(req.category) });
      } catch (error) {
        if (error?.code === 11000) {
          return sendError(res, 409, "CATEGORY_SLUG_TAKEN", `Ya existe una categoría con el slug "${req.body.slug}".`);
        }
        return handleMongooseError(sendError, res, error, "Error al actualizar la categoría.");
      }
    }
  );

  // Bloqueado si algún producto (o servicio) la usa — mismo criterio que
  // borrar un producto con inventario o pedidos (PRODUCT_HAS_RELATED_RECORDS).
  router.delete("/:id", validateObjectIdParam("id"), ensureCategoryExists, canWrite, async (req, res) => {
    try {
      if (req.category.kind === "service") {
        const Service = mongooseConnection.models.Service;
        if (Service && (await Service.exists({ category: req.category._id }))) {
          return sendError(
            res,
            409,
            "CATEGORY_HAS_SERVICES",
            "No se puede eliminar la categoría: hay servicios que la usan. Cámbialos de categoría o desactívala."
          );
        }
      }
      const Product = mongooseConnection.models.Product;
      const inUse = Product ? await Product.exists({ category: req.category._id }) : null;
      if (inUse) {
        return sendError(
          res,
          409,
          "CATEGORY_HAS_PRODUCTS",
          "No se puede eliminar la categoría: hay productos que la usan. Cámbialos de categoría o desactívala."
        );
      }
      await req.category.deleteOne();
      return res.status(200).json({ message: "Categoría eliminada." });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al eliminar la categoría.");
    }
  });

  app.use("/api/categories", router);
}

module.exports = {
  name: "categories",
  registerRoutes,
  models: { Category: categorySchema },
  findCategoryByRef,
  slugify,
  toPublicCategory: toPublic,
};
