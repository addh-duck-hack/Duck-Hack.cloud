// Catálogo de tipos de sección del home de la app móvil — espejo de
// SECTION_VALIDATORS en packages/core-api/modules/appHome.js (el backend es
// quien valida; esto solo arma el editor). Agregar un tipo = agregarlo allá
// y aquí, y darle su formulario en AppHomeSectionForm.jsx.

export const SECTION_TYPES = {
  banner: {
    label: "Banner / carrusel de imágenes",
    icon: "fas fa-images",
    create: () => ({ items: [{ image: "", title: "", subtitle: "" }] }),
  },
  productCarousel: {
    label: "Carrusel de productos",
    icon: "fas fa-shopping-bag",
    create: () => ({ source: "latest", limit: 10 }),
  },
  categoryGrid: {
    label: "Accesos a categorías",
    icon: "fas fa-th-large",
    create: () => ({ items: [{ category: "", label: "", image: "" }] }),
  },
  notice: {
    label: "Texto / aviso",
    icon: "fas fa-bullhorn",
    create: () => ({ body: "", style: "info" }),
  },
};

export const PRODUCT_SOURCE_OPTIONS = [
  { value: "latest", label: "Los más recientes" },
  { value: "category", label: "De una categoría" },
  { value: "manual", label: "Elegidos a mano" },
];

export const NOTICE_STYLE_OPTIONS = [
  { value: "info", label: "Información" },
  { value: "promo", label: "Promoción" },
  { value: "warning", label: "Advertencia" },
];

export const LINK_TYPE_OPTIONS = [
  { value: "none", label: "Sin enlace" },
  { value: "product", label: "Producto" },
  { value: "category", label: "Categoría" },
  { value: "url", label: "URL externa" },
];

export const MAX_CAROUSEL_PRODUCTS = 20;

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const createSection = (type) => ({ id: newId(), type, visible: true, title: "", ...SECTION_TYPES[type].create() });

// Resumen de una línea para la lista del editor.
export const summarizeSection = (section, productsById) => {
  switch (section.type) {
    case "banner":
      return `${section.items?.length || 0} imagen(es)`;
    case "productCarousel":
      if (section.source === "manual") {
        const names = (section.productIds || []).map((id) => productsById.get(id)?.name || "producto eliminado");
        return names.length ? names.join(", ") : "Sin productos elegidos";
      }
      if (section.source === "category") return `Categoría: ${section.category || "—"} · máx. ${section.limit || 10}`;
      return `Más recientes · máx. ${section.limit || 10}`;
    case "categoryGrid":
      return (section.items || []).map((item) => item.label || item.category || "—").join(", ");
    case "notice":
      return section.body ? section.body.slice(0, 80) : "Sin texto";
    default:
      return "Tipo no soportado por este editor (se conserva tal cual)";
  }
};
