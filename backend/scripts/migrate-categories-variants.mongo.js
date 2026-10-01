// Uso:
// mongosh "mongodb://localhost:27017/duckhackdb" backend/scripts/migrate-categories-variants.mongo.js
//
// Corrida única al desplegar Categorías + Variantes (packages/core-api
// modules/categories.js, lib/variants.js) en una tienda que ya tenía datos.
// Correrla ANTES (o justo después) de levantar el backend nuevo — sin ella:
//   - Product.category sigue siendo texto y Mongoose lo descarta al leerlo como
//     ObjectId: el producto se ve "sin categoría" y, si se guarda desde el
//     admin, la pierde para siempre.
//   - El índice único viejo de inventario ("product_1") impide registrar
//     inventario a más de una variante del mismo producto (409).
//
// Qué hace:
//   1. Crea una Category (kind "product") por cada texto distinto de
//      Product.category y cambia el texto por su _id. Nombres que dan el mismo
//      slug ("Café" y "cafe") quedan en una sola categoría.
//   2. En el home de la app (apphomes), cambia los nombres de categoría de las
//      secciones (carrusel por categoría, cuadrícula de categorías, links de
//      tipo "category") por el slug.
//   3. Borra el índice único "product_1" de inventories (el nuevo es
//      product + variant, lo crea Mongoose al arrancar).
// Idempotente: correrla dos veces no hace nada la segunda vez.

// Mismo algoritmo que modules/categories.js#slugify.
const slugify = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

// --- 1. Product.category: texto -> referencia ---
const now = new Date();
const slugByName = {};
const legacyNames = db.products.distinct("category", { category: { $type: "string" } });
let createdCategories = 0;
let migratedProducts = 0;

legacyNames.forEach((raw) => {
  const name = raw.trim();
  if (!name) {
    const res = db.products.updateMany({ category: raw }, { $set: { category: null } });
    migratedProducts += res.modifiedCount;
    return;
  }
  const slug = slugify(name) || "categoria";
  let category = db.categories.findOne({ kind: "product", slug });
  if (!category) {
    db.categories.insertOne({
      name,
      slug,
      kind: "product",
      description: "",
      featured: false,
      sortOrder: 0,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    category = db.categories.findOne({ kind: "product", slug });
    createdCategories += 1;
  }
  slugByName[raw] = slug;
  slugByName[name] = slug;
  const res = db.products.updateMany({ category: raw }, { $set: { category: category._id } });
  migratedProducts += res.modifiedCount;
});
print(`Categorías creadas: ${createdCategories} · productos migrados: ${migratedProducts}`);

// --- 2. Home de la app: nombre de categoría -> slug ---
// Incluye las categorías que ya existían (por si se corre después de crear
// alguna a mano con el mismo nombre que usaban las secciones).
db.categories.find({ kind: "product" }).forEach((c) => {
  slugByName[c.name] = c.slug;
});
const toSlug = (value) => {
  if (typeof value !== "string" || !value.trim()) return value;
  if (slugByName[value] || slugByName[value.trim()]) return slugByName[value] || slugByName[value.trim()];
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? value : slugify(value);
};
const fixLink = (link) => (link && link.type === "category" ? { ...link, value: toSlug(link.value) } : link);

let updatedSections = 0;
db.apphomes.find({}).forEach((doc) => {
  const before = JSON.stringify(doc.sections || []);
  const sections = (doc.sections || []).map((section) => {
    const next = { ...section };
    if (next.type === "productCarousel" && next.source === "category") next.category = toSlug(next.category);
    if (Array.isArray(next.items)) {
      next.items = next.items.map((item) => {
        const fixed = { ...item };
        if (next.type === "categoryGrid") fixed.category = toSlug(fixed.category);
        if (fixed.link) fixed.link = fixLink(fixed.link);
        return fixed;
      });
    }
    if (next.link) next.link = fixLink(next.link);
    return next;
  });
  if (JSON.stringify(sections) !== before) {
    db.apphomes.updateOne({ _id: doc._id }, { $set: { sections } });
    updatedSections += 1;
  }
});
print(`Documentos de home de la app actualizados: ${updatedSections}`);

// --- 3. Índice único viejo de inventario ---
const oldIndex = db.inventories.getIndexes().find((i) => i.name === "product_1" && i.unique);
if (oldIndex) {
  db.inventories.dropIndex("product_1");
  print('Índice "product_1" de inventories eliminado.');
} else {
  print('Índice "product_1" de inventories: no existe (nada que hacer).');
}
