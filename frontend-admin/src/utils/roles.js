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

// Qué ve cada rol ya no se define aquí: son los permisos por tienda
// (módulos contratados + por rol) que configura el super_admin, ver
// utils/permissions.js y hooks/usePermissions.jsx.

// Rango para Usuarios — mismo que roleRank en packages/core-api/lib/permissions.js:
// salvo super_admin, nadie crea ni asigna un rol mayor al suyo.
const ROLE_RANK = {
  [ROLES.CUSTOMER]: 0,
  [ROLES.COLLABORATOR]: 1,
  [ROLES.STORE_ADMIN]: 2,
  [ROLES.SUPER_ADMIN]: 3,
};

export const assignableRolesFor = (actorRole) =>
  Object.values(ROLES).filter(
    (role) => actorRole === ROLES.SUPER_ADMIN || (ROLE_RANK[role] ?? 99) <= (ROLE_RANK[actorRole] ?? -1)
  );

export const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]: "Super admin",
  [ROLES.STORE_ADMIN]: "Administrador de tienda",
  [ROLES.COLLABORATOR]: "Colaborador",
  [ROLES.CUSTOMER]: "Cliente",
};
