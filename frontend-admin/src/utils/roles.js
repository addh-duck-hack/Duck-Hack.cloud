// Fuente única de los roles de staff para el panel — mismo enum que
// packages/core-api/lib/authMiddleware.js (backend), replicado acá porque el
// frontend no puede importar del backend. Antes cada archivo (App.jsx,
// Login.jsx, AdminShell.jsx, AdminMenu.jsx) traía su propia copia a mano de
// estos arrays y se desincronizaban (ver git blame de AdminMenu.jsx) — ahora
// todos importan de aquí.
export const ROLES = {
  SUPER_ADMIN: "super_admin",
  STORE_ADMIN: "store_admin",
  COLLABORATOR: "collaborator",
  CUSTOMER: "customer",
};

// Cualquier rol de staff (todo menos customer) — quién puede loguear al panel.
export const STAFF_ROLES = [ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN, ROLES.COLLABORATOR];

// Grupos de permisos por sección del panel — un solo lugar que consumen tanto
// App.jsx (qué ruta renderiza qué) como AdminShell.jsx (qué aparece en el riel).
export const STORE_CONFIG_ROLES = [ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN];
// Clientes / Contabilidad / Movimientos / Facturación — información
// interna de Duck-Hack, confidencial; collaborator no entra.
export const AGENCY_ROLES = [ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN];
export const CATALOG_ROLES = [ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN, ROLES.COLLABORATOR];
export const ORDER_ROLES = [ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN, ROLES.COLLABORATOR];

export const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]: "Super admin",
  [ROLES.STORE_ADMIN]: "Administrador de tienda",
  [ROLES.COLLABORATOR]: "Colaborador",
  [ROLES.CUSTOMER]: "Cliente",
};
