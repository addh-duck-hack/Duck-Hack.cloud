// Home de la app móvil armado por JSON desde el admin (server-driven UI): el
// admin (quien tenga el módulo "Configurar App", ver lib/permissions.js) decide
// qué secciones se ven y en qué orden sin publicar una
// versión nueva de la app. Singleton por despliegue, igual que StoreConfig
// (`singletonKey: "default"`).
//
// Las secciones se guardan como Mixed y se validan a mano contra un catálogo
// de tipos (SECTION_VALIDATORS) — así agregar un tipo nuevo no requiere
// migrar documentos. El PUT rechaza tipos desconocidos; la app, al revés,
// debe ignorar los tipos que no conozca, para que una versión vieja siga
// funcionando cuando aquí se agregue uno nuevo.
//
// El orden del arreglo ES el orden en pantalla. GET /public devuelve solo las
// secciones visibles y resuelve los carruseles de productos (mismas reglas
// que GET /api/products/public: activos y con stock, ver
// lib/purchaseLimits.js#filterInStock), para que la app arme el home con una
// sola petición; un carrusel que queda sin productos no se envía.
//
// Secciones de tienda (storeHero, storeMetrics, ... ver STORE_CONTENT): no
// guardan contenido propio, reutilizan el de StoreConfig (se edita una sola
// vez en "Configurar tienda" y sale igual en web y app). GET /public las
// resuelve en `items`: solo elementos activos, ordenados por sortOrder, sin
// isActive/sortOrder; métricas automáticas recalculadas como en
// GET /api/store-config/public (lib/liveMetrics.js). Sin elementos → no se envía.
const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");
const { sanitizeDoc, asTrimmedString, isValidObjectId, getOrCreateModel } = require("../lib/moduleHelpers");
const { getPurchaseLimit, filterInStock } = require("../lib/purchaseLimits");
const { resolveLiveMetrics } = require("../lib/liveMetrics");
const { createModuleAuthorizer } = require("../lib/permissions");
const { findCategoryByRef, toPublicCategory } = require("./categories");

const SCHEMA_VERSION = 1;
const MAX_SECTIONS = 30;
const PRODUCT_SOURCES = ["manual", "category", "latest"];
const NOTICE_STYLES = ["info", "promo", "warning"];
const LINK_TYPES = ["none", "product", "category", "url"];
const MAX_CAROUSEL_PRODUCTS = 20;

const appHomeSchema = new mongoose.Schema(
  {
    singletonKey: { type: String, default: "default", unique: true, immutable: true },
    schemaVersion: { type: Number, default: SCHEMA_VERSION },
    sections: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true, minimize: false }
);

// --- Validación ---
// Cada validador recibe la sección cruda y el prefijo del campo para el
// mensaje de error; devuelve { value } normalizado o { error }.

class HomeValidationError extends Error {}
const fail = (message) => {
  throw new HomeValidationError(message);
};

const optionalText = (value, field, max) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") fail(`${field} debe ser texto.`);
  const text = value.trim();
  if (text.length > max) fail(`${field} excede ${max} caracteres.`);
  return text || undefined;
};

const requiredText = (value, field, max) => {
  const text = optionalText(value, field, max);
  if (!text) fail(`${field} es requerido.`);
  return text;
};

// Ruta de la biblioteca de medios ("uploads/x.jpg") o URL http(s) absoluta.
const mediaPath = (value, field, { required = false } = {}) => {
  const text = required ? requiredText(value, field, 500) : optionalText(value, field, 500);
  if (text && !/^uploads\/[^\s]+$/.test(text) && !/^https?:\/\/\S+$/i.test(text)) {
    fail(`${field} debe ser una ruta de Medios (uploads/...) o una URL http(s).`);
  }
  return text;
};

const CATEGORY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const categorySlug = (value, field) => {
  const slug = requiredText(value, field, 80);
  if (!CATEGORY_SLUG.test(slug)) fail(`${field} debe ser el slug de una categoría.`);
  return slug;
};

const link = (value, field) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) fail(`${field} debe ser un objeto { type, value }.`);
  const type = asTrimmedString(value.type) || "none";
  if (!LINK_TYPES.includes(type)) fail(`${field}.type debe ser uno de: ${LINK_TYPES.join(", ")}.`);
  if (type === "none") return undefined;
  const target = requiredText(value.value, `${field}.value`, 500);
  if (type === "product" && !isValidObjectId(target)) fail(`${field}.value debe ser el id de un producto.`);
  // Categorías: se guarda el slug (modules/categories.js), no el nombre.
  if (type === "category" && !CATEGORY_SLUG.test(target)) fail(`${field}.value debe ser el slug de una categoría.`);
  if (type === "url" && !/^https?:\/\/\S+$/i.test(target)) fail(`${field}.value debe ser una URL http(s).`);
  return { type, value: target };
};

const itemList = (value, field, { min, max }) => {
  if (!Array.isArray(value)) fail(`${field} debe ser un arreglo.`);
  if (value.length < min) fail(`${field} necesita al menos ${min} elemento(s).`);
  if (value.length > max) fail(`${field} admite máximo ${max} elementos.`);
  value.forEach((item, i) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) fail(`${field}[${i}] debe ser un objeto.`);
  });
  return value;
};

const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

const SECTION_VALIDATORS = {
  // Una o varias imágenes deslizables, cada una con enlace opcional.
  banner: (s, f) => ({
    items: itemList(s.items, `${f}.items`, { min: 1, max: 10 }).map((item, i) =>
      clean({
        image: mediaPath(item.image, `${f}.items[${i}].image`, { required: true }),
        title: optionalText(item.title, `${f}.items[${i}].title`, 120),
        subtitle: optionalText(item.subtitle, `${f}.items[${i}].subtitle`, 200),
        link: link(item.link, `${f}.items[${i}].link`),
      })
    ),
  }),

  // Lista horizontal de productos: elegidos a mano, de una categoría o los más recientes.
  productCarousel: (s, f) => {
    const source = asTrimmedString(s.source) || "latest";
    if (!PRODUCT_SOURCES.includes(source)) fail(`${f}.source debe ser uno de: ${PRODUCT_SOURCES.join(", ")}.`);
    const limit = s.limit === undefined || s.limit === null || s.limit === "" ? 10 : Number(s.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CAROUSEL_PRODUCTS) {
      fail(`${f}.limit debe ser un entero entre 1 y ${MAX_CAROUSEL_PRODUCTS}.`);
    }
    const section = { source, limit };
    if (source === "manual") {
      if (!Array.isArray(s.productIds) || s.productIds.length === 0) fail(`${f}.productIds necesita al menos un producto.`);
      if (s.productIds.length > MAX_CAROUSEL_PRODUCTS) fail(`${f}.productIds admite máximo ${MAX_CAROUSEL_PRODUCTS}.`);
      section.productIds = [...new Set(s.productIds.map((id) => asTrimmedString(id)))];
      section.productIds.forEach((id, i) => {
        if (!isValidObjectId(id)) fail(`${f}.productIds[${i}] no es un id válido.`);
      });
    }
    if (source === "category") section.category = categorySlug(s.category, `${f}.category`);
    return section;
  },

  // Cuadrícula de accesos a categorías del catálogo.
  categoryGrid: (s, f) => ({
    items: itemList(s.items, `${f}.items`, { min: 1, max: 12 }).map((item, i) =>
      clean({
        category: categorySlug(item.category, `${f}.items[${i}].category`),
        label: optionalText(item.label, `${f}.items[${i}].label`, 60),
        image: mediaPath(item.image, `${f}.items[${i}].image`),
      })
    ),
  }),

  // Texto o aviso destacado (promoción, horario, etc.).
  notice: (s, f) => {
    const style = asTrimmedString(s.style) || "info";
    if (!NOTICE_STYLES.includes(style)) fail(`${f}.style debe ser uno de: ${NOTICE_STYLES.join(", ")}.`);
    return clean({ body: requiredText(s.body, `${f}.body`, 1000), style, link: link(s.link, `${f}.link`) });
  },
};

// Secciones que muestran contenido de StoreConfig: tipo → campo de origen.
// Solo llevan los campos comunes (id, type, visible, title).
const STORE_CONTENT = {
  storeHero: { field: "heroSlides" },
  storeMetrics: { field: "metrics" },
  storeCommands: { field: "commands" },
  storeServices: { field: "services" },
  storePricingPlans: { field: "pricingPlans" },
  storeFaqs: { field: "faqs" },
  storeTeam: { field: "teamMembers" },
  storeTestimonials: { field: "testimonials" },
};
Object.keys(STORE_CONTENT).forEach((type) => {
  SECTION_VALIDATORS[type] = () => ({});
});

const SECTION_TYPES = Object.keys(SECTION_VALIDATORS);

// Elementos públicos de una sección de tienda: activos, por sortOrder (estable).
const publicStoreItems = (config, field) =>
  (Array.isArray(config?.[field]) ? config[field] : [])
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item && item.isActive !== false)
    .sort((a, b) => (a.item.sortOrder ?? 0) - (b.item.sortOrder ?? 0) || a.index - b.index)
    .map(({ item }) => {
      const { isActive, sortOrder, _id, ...rest } = item;
      return rest;
    });

// Normaliza `sections` completo o lanza HomeValidationError. Campos comunes:
// id (se genera si falta; único), type, visible (default true), title.
const normalizeSections = (sections) => {
  if (!Array.isArray(sections)) fail("sections debe ser un arreglo.");
  if (sections.length > MAX_SECTIONS) fail(`sections admite máximo ${MAX_SECTIONS} secciones.`);
  const ids = new Set();
  return sections.map((raw, index) => {
    const f = `sections[${index}]`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(`${f} debe ser un objeto.`);
    const type = asTrimmedString(raw.type);
    if (!SECTION_VALIDATORS[type]) fail(`${f}.type debe ser uno de: ${SECTION_TYPES.join(", ")}.`);
    const id = optionalText(raw.id, `${f}.id`, 40) || crypto.randomUUID();
    if (ids.has(id)) fail(`${f}.id "${id}" está repetido.`);
    ids.add(id);
    if (raw.visible !== undefined && typeof raw.visible !== "boolean") fail(`${f}.visible debe ser true o false.`);
    return clean({
      id,
      type,
      visible: raw.visible !== false,
      title: optionalText(raw.title, `${f}.title`, 120),
      ...SECTION_VALIDATORS[type](raw, f),
    });
  });
};

const toResponse = (doc) => ({
  schemaVersion: doc?.schemaVersion || SCHEMA_VERSION,
  sections: doc?.sections || [],
  updatedAt: doc?.updatedAt || null,
});

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, sendError, resolveLiveMetricSources } = ctx;
  const AppHome = getOrCreateModel(mongooseConnection, "AppHome", appHomeSchema);
  const router = express.Router();

  // Resuelve los productos de un carrusel. Toma todos los candidatos y corta
  // después de filtrar por stock, para que `limit` cuente productos visibles.
  const resolveCarousel = async (section, purchaseLimit) => {
    const { Product, Inventory } = mongooseConnection.models;
    if (!Product) return [];
    let candidates;
    if (section.source === "manual") {
      const found = await Product.find({ _id: { $in: section.productIds }, isActive: true }).lean();
      const byId = new Map(found.map((p) => [String(p._id), p]));
      candidates = section.productIds.map((id) => byId.get(id)).filter(Boolean);
    } else if (section.source === "category") {
      // section.category = slug (o id) de la categoría; inexistente o inactiva = carrusel vacío.
      const category = await findCategoryByRef(mongooseConnection, section.category);
      candidates = category && category.isActive !== false
        ? await Product.find({ isActive: true, category: category._id }).sort({ sortOrder: 1, name: 1 }).lean()
        : [];
    } else {
      candidates = await Product.find({ isActive: true }).sort({ createdAt: -1 }).lean();
    }
    const inStock = await filterInStock(Inventory, candidates, purchaseLimit);
    return inStock.slice(0, section.limit);
  };

  const resolveStoreSection = async (section, config) => {
    const { field } = STORE_CONTENT[section.type];
    let items = publicStoreItems(config, field);
    if (section.type === "storeMetrics") items = await resolveLiveMetrics(items, resolveLiveMetricSources);
    const resolved = { ...section, items };
    if (section.type === "storePricingPlans") resolved.commonChecks = config?.commonPlanChecks || [];
    return resolved;
  };

  // ---- Pública (app móvil) ----
  router.get("/public", async (req, res) => {
    try {
      const doc = await AppHome.findOne({ singletonKey: "default" }).lean();
      const visible = (doc?.sections || []).filter((s) => s.visible !== false);
      const purchaseLimit = await getPurchaseLimit(mongooseConnection);
      // StoreConfig solo se lee si hay secciones de tienda visibles.
      const StoreConfig = mongooseConnection.models.StoreConfig;
      const needsStore = visible.some((s) => STORE_CONTENT[s.type]);
      const storeConfig =
        needsStore && StoreConfig ? await StoreConfig.findOne({ singletonKey: "default", isActive: true }).lean() : null;

      const sections = [];
      for (const { visible: _visible, ...section } of visible) {
        if (section.type === "categoryGrid") {
          // Cada acceso trae `categoryInfo` (nombre, imagen…) resuelto; los
          // de categorías borradas o inactivas se omiten.
          const items = [];
          for (const item of section.items || []) {
            const category = await findCategoryByRef(mongooseConnection, item.category);
            if (category && category.isActive !== false) items.push({ ...item, categoryInfo: toPublicCategory(category) });
          }
          if (items.length === 0) continue;
          sections.push({ ...section, items });
        } else if (section.type === "productCarousel") {
          const products = await resolveCarousel(section, purchaseLimit);
          if (products.length === 0) continue;
          sections.push({ ...section, products });
        } else if (STORE_CONTENT[section.type]) {
          const resolved = await resolveStoreSection(section, storeConfig);
          if (resolved.items.length === 0) continue;
          sections.push(resolved);
        } else {
          sections.push(section);
        }
      }
      return res.status(200).json({ ...toResponse(doc), sections });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al obtener el home de la app.");
    }
  });

  // ---- Admin: módulo "Configurar App" de los permisos por tienda (lib/permissions.js) ----
  router.use(verifyToken, createModuleAuthorizer({ mongooseConnection, sendError }).authorizeModule("appConfig"));

  router.get("/", async (req, res) => {
    try {
      const doc = await AppHome.findOne({ singletonKey: "default" }).lean();
      return res.status(200).json({ ...toResponse(doc), sectionTypes: SECTION_TYPES });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al obtener el home de la app.");
    }
  });

  router.put("/", async (req, res) => {
    let sections;
    try {
      sections = normalizeSections(req.body?.sections);
    } catch (error) {
      if (error instanceof HomeValidationError) return sendError(res, 400, "VALIDATION_ERROR", error.message);
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al validar el home de la app.");
    }

    try {
      // Los productos elegidos a mano deben existir (aunque estén inactivos o
      // sin stock: eso solo los oculta en GET /public, no es un error).
      const Product = mongooseConnection.models.Product;
      const manualIds = [...new Set(sections.flatMap((s) => s.productIds || []))];
      if (Product && manualIds.length > 0) {
        const existing = await Product.find({ _id: { $in: manualIds } }).distinct("_id");
        const existingIds = new Set(existing.map(String));
        const missing = manualIds.filter((id) => !existingIds.has(id));
        if (missing.length > 0) {
          return sendError(res, 400, "APP_HOME_PRODUCT_NOT_FOUND", `No existen los productos: ${missing.join(", ")}.`);
        }
      }

      const doc = await AppHome.findOneAndUpdate(
        { singletonKey: "default" },
        { $set: { sections, schemaVersion: SCHEMA_VERSION } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      ).lean();
      return res.status(200).json({ message: "Home de la app guardado.", ...toResponse(sanitizeDoc(doc)) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al guardar el home de la app.");
    }
  });

  app.use("/api/app-home", router);
}

module.exports = {
  name: "appHome",
  registerRoutes,
  models: { AppHome: appHomeSchema },
};
