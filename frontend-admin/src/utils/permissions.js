// Módulos del panel sujetos a los permisos por tienda (contratados + por rol).
// Mismo catálogo y orden que PERMISSION_MODULES en
// packages/core-api/lib/permissions.js — el backend es quien decide y hace
// cumplir; esto solo dice qué entrada(s) del menú abre cada módulo.
// "Permisos" no está aquí: es siempre solo super_admin.
export const MODULE_NAV = [
  { key: "panel", items: [{ path: "/admin", label: "Panel", end: true }] },
  { key: "storeConfig", items: [{ path: "/admin/store-config", label: "Configurar tienda" }] },
  { key: "appConfig", items: [{ path: "/admin/app-config", label: "Configurar App" }] },
  {
    key: "products",
    items: [
      { path: "/admin/products", label: "Productos" },
      { path: "/admin/categories", label: "Categorías" },
    ],
  },
  { key: "inventory", items: [{ path: "/admin/inventory", label: "Inventario" }] },
  { key: "orders", items: [{ path: "/admin/orders", label: "Pedidos" }] },
  { key: "coupons", items: [{ path: "/admin/coupons", label: "Cupones" }] },
  { key: "reviews", items: [{ path: "/admin/reviews", label: "Reseñas" }] },
  { key: "media", items: [{ path: "/admin/media", label: "Medios" }] },
  { key: "users", items: [{ path: "/admin/users", label: "Usuarios" }] },
  { key: "agencyClients", items: [{ path: "/admin/agency-clients", label: "Clientes" }] },
  {
    key: "accounting",
    items: [
      { path: "/admin/accounting", label: "Contabilidad", end: true },
      { path: "/admin/accounting/transactions", label: "Movimientos" },
    ],
  },
  { key: "invoices", items: [{ path: "/admin/invoices", label: "Facturación" }] },
];

// Primera pantalla de quien no tiene el Panel (el índice /admin): Pedidos si lo
// tiene, como antes; si no, su primer módulo permitido; null = ninguno.
export const firstAllowedPath = (can) => {
  if (can("orders")) return "/admin/orders";
  const first = MODULE_NAV.find((module) => module.key !== "panel" && can(module.key));
  return first ? first.items[0].path : null;
};
