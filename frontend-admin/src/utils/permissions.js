// Módulos del panel sujetos a los permisos por tienda (contratados + por rol).
// Mismo catálogo y orden que PERMISSION_MODULES en
// packages/core-api/lib/permissions.js — el backend es quien decide y hace
// cumplir; esto solo dice qué entrada(s) del menú abre cada módulo.
// "Permisos" no está aquí: es siempre solo super_admin.
export const MODULE_NAV = [
  { key: "panel", items: [{ path: "/admin", label: "Panel", end: true }] },
  { key: "storeConfig", items: [{ path: "/admin/store-config", label: "Configurar tienda" }] },
  { key: "appConfig", items: [{ path: "/admin/app-config", label: "Configurar App" }] },
  // `managers`: solo super_admin / store_admin (dentro del módulo, una
  // collaborator solo maneja lo suyo; ver modules/appointments.js).
  {
    key: "appointments",
    items: [
      { path: "/admin/appointments", label: "Agenda" },
      { path: "/admin/specialists", label: "Especialistas", managers: true },
      { path: "/admin/time-blocks", label: "Bloqueos" },
      { path: "/admin/appointment-settings", label: "Ajustes de agenda", managers: true },
    ],
  },
  // Sin pantalla propia: su sección vive en "Ajustes de agenda".
  { key: "reminders", items: [] },
  {
    key: "services",
    items: [
      { path: "/admin/services", label: "Servicios" },
      { path: "/admin/service-categories", label: "Categorías" },
    ],
  },
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
  { key: "abandonedCart", items: [{ path: "/admin/abandoned-cart", label: "Carrito abandonado" }] },
  { key: "reviews", items: [{ path: "/admin/reviews", label: "Reseñas" }] },
  { key: "loyalty", items: [{ path: "/admin/loyalty", label: "Lealtad" }] },
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

// Grupos del menú lateral (AdminShell.jsx): cada grupo junta las entradas de
// varios módulos. Un grupo del que el usuario solo ve una entrada se muestra
// como enlace suelto; sin `label`, sus entradas van sueltas siempre. `superOnly`
// son entradas que no son módulo asignable (solo super_admin). `bottom` = va
// abajo, en la sección de sesión (junto a "Cerrar sesión"), no en la navegación.
export const NAV_GROUPS = [
  { id: "panel", modules: ["panel"] },
  { id: "config", label: "Configuración", icon: "fa-solid fa-gear", modules: ["storeConfig", "appConfig"] },
  { id: "services", label: "Servicios", icon: "fa-solid fa-spa", modules: ["appointments", "services"] },
  {
    id: "store",
    label: "Tienda",
    icon: "fa-solid fa-store",
    modules: ["products", "inventory", "orders", "coupons", "abandonedCart", "reviews"],
  },
  // Lealtad sirve a la tienda (puntos) y al salón (sellos): enlace suelto.
  { id: "loyalty", modules: ["loyalty"] },
  { id: "media", modules: ["media"] },
  {
    id: "users",
    label: "Usuarios",
    icon: "fa-solid fa-users",
    modules: ["users"],
    superOnly: [{ path: "/admin/permissions", label: "Permisos" }],
    bottom: true,
  },
  { id: "agency", label: "Agencia", icon: "fa-solid fa-briefcase", modules: ["agencyClients", "accounting", "invoices"] },
];

const isManagerRole = (role) => role === "super_admin" || role === "store_admin";

// Entradas de un módulo que este rol ve (sin las `managers` si no lo es).
const visibleItems = (key, role) =>
  (MODULE_NAV.find((module) => module.key === key)?.items || []).filter((item) => !item.managers || isManagerRole(role));

// Menú ya filtrado por permisos: [{ id, label, icon, items }], sin grupos vacíos.
export const navGroupsFor = (can, isSuperAdmin, role) =>
  NAV_GROUPS.map((group) => ({
    ...group,
    items: [
      ...group.modules.flatMap((key) => (can(key) ? visibleItems(key, role) : [])),
      ...(isSuperAdmin ? group.superOnly || [] : []),
    ],
  })).filter((group) => group.items.length > 0);

// Primera pantalla de quien no tiene el Panel (el índice /admin): Pedidos si lo
// tiene, como antes; si no, su primer módulo permitido; null = ninguno.
export const firstAllowedPath = (can, role) => {
  if (can("orders")) return "/admin/orders";
  for (const module of MODULE_NAV) {
    if (module.key === "panel" || !can(module.key)) continue;
    const [first] = visibleItems(module.key, role);
    if (first) return first.path;
  }
  return null;
};
