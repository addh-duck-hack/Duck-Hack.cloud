// Módulos del panel sujetos a los permisos por tienda (contratados + por rol).
// Mismo catálogo y orden que PERMISSION_MODULES en
// packages/core-api/lib/permissions.js — el backend es quien decide y hace
// cumplir; esto solo dice qué entrada(s) del menú abre cada módulo.
// "Permisos" no está aquí: es siempre solo super_admin.
export const MODULE_NAV = [
  { key: "panel", items: [{ path: "/admin/server", label: "Servidor" }] },
  { key: "storeConfig", items: [{ path: "/admin/store-config", label: "Configurar tienda" }] },
  { key: "appConfig", items: [{ path: "/admin/app-config", label: "Configurar App" }] },
  // `managers`: solo super_admin / store_admin (dentro del módulo, una
  // collaborator solo maneja lo suyo; ver modules/appointments.js).
  {
    key: "appointments",
    items: [
      { path: "/admin/appointments", label: "Agenda" },
      { path: "/admin/appointment-list", label: "Citas" },
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
  { key: "promoBanner", items: [{ path: "/admin/promo-banners", label: "Banners" }] },
  { key: "abandonedCart", items: [{ path: "/admin/abandoned-cart", label: "Carrito abandonado" }] },
  { key: "wishlist", items: [{ path: "/admin/wishlist", label: "Lista de deseos" }] },
  { key: "reviews", items: [{ path: "/admin/reviews", label: "Reseñas" }] },
  { key: "loyalty", items: [{ path: "/admin/loyalty", label: "Lealtad" }] },
  { key: "giftCards", items: [{ path: "/admin/gift-cards", label: "Tarjetas de regalo" }] },
  { key: "reports", items: [{ path: "/admin/reports", label: "Reportes" }] },
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
  // Inicio (Dashboard.jsx): para todo el staff, sin clave de permisos.
  { id: "home", icon: "fa-solid fa-house", modules: [], always: [{ path: "/admin", label: "Inicio", end: true, badge: "news" }] },
  { id: "panel", icon: "fa-solid fa-server", modules: ["panel"] },
  { id: "config", label: "Configuración", icon: "fa-solid fa-gear", modules: ["storeConfig", "appConfig"] },
  { id: "services", label: "Servicios", icon: "fa-solid fa-spa", modules: ["appointments", "services"] },
  {
    id: "store",
    label: "Tienda",
    icon: "fa-solid fa-store",
    modules: ["products", "inventory", "orders", "coupons", "promoBanner", "abandonedCart", "wishlist", "reviews"],
  },
  // Lealtad, tarjetas de regalo y reportes sirven a la tienda y al salón: enlaces sueltos.
  { id: "loyalty", icon: "fa-solid fa-award", modules: ["loyalty"] },
  { id: "giftCards", icon: "fa-solid fa-gift", modules: ["giftCards"] },
  { id: "reports", icon: "fa-solid fa-chart-column", modules: ["reports"] },
  { id: "media", icon: "fa-solid fa-photo-film", modules: ["media"] },
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
      ...(group.always || []),
      ...group.modules.flatMap((key) => (can(key) ? visibleItems(key, role) : [])),
      ...(isSuperAdmin ? group.superOnly || [] : []),
    ],
  })).filter((group) => group.items.length > 0);

