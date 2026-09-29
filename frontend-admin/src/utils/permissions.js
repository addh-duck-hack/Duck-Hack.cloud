// Módulos del panel sujetos a los permisos por tienda (contratados + por rol).
// Mismo catálogo y orden que PERMISSION_MODULES en
// packages/core-api/lib/permissions.js — el backend es quien decide y hace
// cumplir; esto solo dice qué entrada(s) del menú abre cada módulo.
// Panel y "Configurar App" no están aquí: son siempre solo super_admin.
export const MODULE_NAV = [
  { key: "storeConfig", items: [{ path: "/admin/store-config", label: "Configurar tienda" }] },
  { key: "products", items: [{ path: "/admin/products", label: "Productos" }] },
  { key: "inventory", items: [{ path: "/admin/inventory", label: "Inventario" }] },
  { key: "orders", items: [{ path: "/admin/orders", label: "Pedidos" }] },
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

// Primera pantalla a la que puede entrar quien no es super_admin (el índice
// /admin es el Panel, solo super_admin). Pedidos primero si lo tiene, como antes.
export const firstAllowedPath = (can) => {
  if (can("orders")) return "/admin/orders";
  const first = MODULE_NAV.find((module) => can(module.key));
  return first ? first.items[0].path : null;
};
