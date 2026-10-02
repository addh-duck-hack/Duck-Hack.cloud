// Permisos por tienda (el panel se vende a varios clientes: cada tienda
// contrata módulos y el super_admin — solo Duck-Hack — decide qué ve cada rol).
// Dos capas, guardadas en un singleton por despliegue (modelo
// StorePermissions, rutas en modules/permissions.js):
//   1. enabledModules: módulos contratados por la tienda.
//   2. roles: qué módulos puede usar store_admin y qué collaborator.
// Acceso = módulo contratado Y permitido para el rol. super_admin siempre
// pasa; customer nunca (no es staff). Apagar un módulo no borra lo que tenían
// los roles: al volver a contratarlo, reaparece igual.
//
// Sin documento guardado aplica DEFAULT_PERMISSIONS = el comportamiento que
// había antes (todo contratado; store_admin todo menos Panel y Configurar App;
// collaborator solo catálogo/pedidos/medios), así que una tienda ya desplegada
// no cambia al actualizar.
//
// "Permisos" (esta configuración) no es un módulo: siempre solo super_admin,
// si no un rol podría darse a sí mismo cualquier módulo.
const mongoose = require("mongoose");
const { ROLES } = require("./authMiddleware");
const { getOrCreateModel } = require("./moduleHelpers");

// Orden = orden del menú del panel (frontend-admin/src/utils/permissions.js).
const PERMISSION_MODULES = [
  { key: "panel", label: "Panel (uso e infraestructura del servidor)" },
  { key: "storeConfig", label: "Configurar tienda" },
  { key: "appConfig", label: "Configurar App" },
  { key: "products", label: "Productos" },
  { key: "inventory", label: "Inventario" },
  { key: "orders", label: "Pedidos" },
  { key: "coupons", label: "Cupones" },
  { key: "media", label: "Medios" },
  { key: "users", label: "Usuarios" },
  { key: "agencyClients", label: "Clientes" },
  { key: "accounting", label: "Contabilidad y movimientos" },
  { key: "invoices", label: "Facturación" },
];
const MODULE_KEYS = PERMISSION_MODULES.map((m) => m.key);
const CONFIGURABLE_ROLES = [ROLES.STORE_ADMIN, ROLES.COLLABORATOR];

const DEFAULT_PERMISSIONS = Object.freeze({
  enabledModules: [...MODULE_KEYS],
  roles: {
    [ROLES.STORE_ADMIN]: MODULE_KEYS.filter((key) => key !== "panel" && key !== "appConfig"),
    [ROLES.COLLABORATOR]: ["products", "inventory", "orders", "media"],
  },
});

// Rango para las reglas de Usuarios: nadie (salvo super_admin) ve, crea,
// edita ni asigna una cuenta de rango mayor al suyo.
const ROLE_RANK = {
  [ROLES.CUSTOMER]: 0,
  [ROLES.COLLABORATOR]: 1,
  [ROLES.STORE_ADMIN]: 2,
  [ROLES.SUPER_ADMIN]: 3,
};
const roleRank = (role) => ROLE_RANK[role] ?? -1;

const storePermissionsSchema = new mongoose.Schema(
  {
    singletonKey: { type: String, default: "default", unique: true, immutable: true },
    enabledModules: { type: [String], default: undefined },
    roles: {
      [ROLES.STORE_ADMIN]: { type: [String], default: undefined },
      [ROLES.COLLABORATOR]: { type: [String], default: undefined },
    },
  },
  { timestamps: true, minimize: false }
);

const getModel = (connection) => getOrCreateModel(connection, "StorePermissions", storePermissionsSchema);

// Solo claves conocidas y sin repetir, en el orden del catálogo.
const normalizeKeys = (keys) => MODULE_KEYS.filter((key) => Array.isArray(keys) && keys.includes(key));

// Config efectiva: lo guardado, completando con los defaults lo que falte.
const withDefaults = (doc) => ({
  enabledModules: Array.isArray(doc?.enabledModules) ? normalizeKeys(doc.enabledModules) : [...DEFAULT_PERMISSIONS.enabledModules],
  roles: Object.fromEntries(
    CONFIGURABLE_ROLES.map((role) => [
      role,
      Array.isArray(doc?.roles?.[role]) ? normalizeKeys(doc.roles[role]) : [...DEFAULT_PERMISSIONS.roles[role]],
    ])
  ),
  updatedAt: doc?.updatedAt || null,
});

// Caché en memoria por conexión: los permisos se consultan en cada request de
// staff. Se invalida al guardar (un backend = un proceso por tienda); el TTL
// cubre cambios hechos directo en la BD.
const CACHE_TTL_MS = 60 * 1000;
const cache = new WeakMap();

const loadPermissions = async (connection) => {
  const hit = cache.get(connection);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const doc = await getModel(connection).findOne({ singletonKey: "default" }).lean();
  const value = withDefaults(doc);
  cache.set(connection, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
};

const savePermissions = async (connection, { enabledModules, roles }) => {
  const doc = await getModel(connection)
    .findOneAndUpdate(
      { singletonKey: "default" },
      { $set: { enabledModules: normalizeKeys(enabledModules), roles } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    )
    .lean();
  cache.delete(connection);
  return withDefaults(doc);
};

// Módulos que puede usar un rol con la config dada.
const modulesForRole = (config, role) => {
  if (role === ROLES.SUPER_ADMIN) return [...MODULE_KEYS];
  const allowed = config.roles[role] || [];
  return config.enabledModules.filter((key) => allowed.includes(key));
};

// Middlewares — van DESPUÉS de verifyToken (usan req.user). Mismo criterio de
// inyección que lib/authMiddleware.js: sendError y la conexión los pone quien
// los usa (los módulos de core-api con ctx; backend/routes/* con
// mongoose.connection).
const createModuleAuthorizer = ({ mongooseConnection, sendError }) => {
  // ¿Puede `role` usar `key`? Sí si lo tiene (contratado + permitido a su rol)
  // o si tiene alguno de `alsoBy` (módulos que necesitan consultarlo, ej.
  // Pedidos lee productos). Con requireContract, ese acceso indirecto solo
  // vale si `key` está contratado: una tienda que no pagó Facturación no ve
  // facturas por ningún lado.
  const canUse = async (role, key, { alsoBy = [], requireContract = true } = {}) => {
    if (role === ROLES.SUPER_ADMIN) return true;
    const config = await loadPermissions(mongooseConnection);
    const allowed = modulesForRole(config, role);
    if (allowed.includes(key)) return true;
    if (requireContract && !config.enabledModules.includes(key)) return false;
    return alsoBy.some((other) => allowed.includes(other));
  };

  const deny = (res) => sendError(res, 403, "MODULE_NOT_ALLOWED", "No tienes acceso a este módulo.");

  const authorizeModule = (key, options) => async (req, res, next) => {
    if (!req.user) return sendError(res, 401, "AUTHENTICATION_REQUIRED", "No autenticado.");
    try {
      return (await canUse(req.user.role, key, options)) ? next() : deny(res);
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "No fue posible verificar los permisos.");
    }
  };

  // Para routers completos: lecturas (GET/HEAD) aceptan también `readAlso`;
  // cualquier escritura exige el módulo propio.
  const authorizeModuleAccess = ({ module: key, readAlso = [], requireContract = true }) => async (req, res, next) => {
    const isRead = req.method === "GET" || req.method === "HEAD";
    return authorizeModule(key, isRead ? { alsoBy: readAlso, requireContract } : undefined)(req, res, next);
  };

  // El propio usuario, o quien tenga el módulo (ej. perfil propio vs. Usuarios).
  const authorizeSelfOrModule = (idParam, key) => async (req, res, next) => {
    if (!req.user) return sendError(res, 401, "AUTHENTICATION_REQUIRED", "No autenticado.");
    if (String(req.user.id) === String(req.params?.[idParam])) return next();
    return authorizeModule(key)(req, res, next);
  };

  // Para chequeos dentro de un handler (ej. PDF de pedido: staff con Pedidos o el dueño).
  const hasModule = (role, key, options) => canUse(role, key, options);

  return { authorizeModule, authorizeModuleAccess, authorizeSelfOrModule, hasModule };
};

module.exports = {
  PERMISSION_MODULES,
  MODULE_KEYS,
  CONFIGURABLE_ROLES,
  DEFAULT_PERMISSIONS,
  roleRank,
  storePermissionsSchema,
  loadPermissions,
  savePermissions,
  modulesForRole,
  createModuleAuthorizer,
};
