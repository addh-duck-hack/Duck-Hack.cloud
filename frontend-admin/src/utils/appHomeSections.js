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

// Secciones que reutilizan el contenido de "Configurar tienda" (STORE_CONTENT
// en appHome.js): no tienen campos propios además del título. `field` es el
// arreglo de StoreConfig que muestran y `tab` dónde se edita.
const STORE_HOME_TAB = { path: "/admin/store-config/home", label: "Configurar tienda → Home" };
const STORE_SERVICES_TAB = { path: "/admin/store-config/servicios-precios", label: "Configurar tienda → Secciones, planes y FAQ" };
const STORE_TEAM_TAB = { path: "/admin/store-config/equipo-testimonios", label: "Configurar tienda → Equipo y testimonios" };

export const STORE_SECTION_TYPES = {
  storeHero: { label: "Tienda: Hero", icon: "fas fa-film", field: "heroSlides", tab: STORE_HOME_TAB },
  storeMetrics: { label: "Tienda: Métricas", icon: "fas fa-chart-line", field: "metrics", tab: STORE_HOME_TAB },
  storeCommands: { label: "Tienda: Pasos", icon: "fas fa-list-ol", field: "commands", tab: STORE_HOME_TAB },
  storeServices: { label: "Tienda: Servicios", icon: "fas fa-concierge-bell", field: "services", tab: STORE_SERVICES_TAB },
  storePricingPlans: { label: "Tienda: Planes", icon: "fas fa-tags", field: "pricingPlans", tab: STORE_SERVICES_TAB },
  storeFaqs: { label: "Tienda: Preguntas frecuentes", icon: "fas fa-question-circle", field: "faqs", tab: STORE_SERVICES_TAB },
  storeTeam: { label: "Tienda: Equipo", icon: "fas fa-users", field: "teamMembers", tab: STORE_TEAM_TAB },
  storeTestimonials: { label: "Tienda: Testimonios", icon: "fas fa-comment-dots", field: "testimonials", tab: STORE_TEAM_TAB },
};
Object.entries(STORE_SECTION_TYPES).forEach(([type, def]) => {
  SECTION_TYPES[type] = { ...def, create: () => ({}) };
});

// Secciones que muestran contenido de otro módulo del panel (no de Configurar
// tienda): "promoBanners" = los banners de promociones del Inicio (módulo
// Banners), mismos que en el sitio web. Sin campos propios además del título.
export const MODULE_SECTION_TYPES = {
  promoBanners: { label: "Banners de promociones", icon: "fas fa-rectangle-ad", path: "/admin/promo-banners", pathLabel: "Banners" },
};
Object.entries(MODULE_SECTION_TYPES).forEach(([type, def]) => {
  SECTION_TYPES[type] = { ...def, create: () => ({}) };
});

// Elementos que la app mostrará de una sección de tienda: los activos
// (métricas no tienen isActive, cuentan todas). Mismo criterio que el backend.
export const countActiveStoreItems = (storeConfig, type) => {
  const items = storeConfig?.[STORE_SECTION_TYPES[type]?.field];
  return Array.isArray(items) ? items.filter((item) => item && item.isActive !== false).length : 0;
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
// `promoCount`: banners vigentes del Inicio (null si no se pudieron consultar).
export const summarizeSection = (section, productsById, storeConfig, promoCount = null) => {
  if (section.type === "promoBanners") {
    if (promoCount === null) return "Banners de promociones del Inicio";
    return promoCount ? `${promoCount} banner(s) vigente(s) del Inicio` : "Sin banners vigentes para el Inicio — no se mostrará";
  }
  if (STORE_SECTION_TYPES[section.type]) {
    const count = countActiveStoreItems(storeConfig, section.type);
    return count ? `${count} elemento(s) activo(s) en la tienda` : "Sin elementos activos en la tienda — no se mostrará";
  }
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
