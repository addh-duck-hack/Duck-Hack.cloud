// Permisos por tienda: módulos contratados + qué puede cada rol (ver
// lib/permissions.js, donde vive la lógica y los middlewares que usan los
// demás módulos). Rutas:
//   GET /api/permissions/me — cualquier staff: sus módulos, para armar el menú
//                             y las rutas del panel.
//   GET/PUT /api/permissions — solo super_admin: la configuración completa.
const express = require("express");
const {
  PERMISSION_MODULES,
  MODULE_KEYS,
  CONFIGURABLE_ROLES,
  DEFAULT_PERMISSIONS,
  storePermissionsSchema,
  loadPermissions,
  savePermissions,
  modulesForRole,
} = require("../lib/permissions");
const { getOrCreateModel } = require("../lib/moduleHelpers");

// Arreglo de claves de módulo conocidas, o mensaje de error.
const validateKeys = (value, field) => {
  if (!Array.isArray(value)) return `${field} debe ser un arreglo.`;
  const unknown = value.filter((key) => !MODULE_KEYS.includes(key));
  if (unknown.length > 0) return `${field} tiene módulos desconocidos: ${unknown.join(", ")}.`;
  return null;
};

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, authorizeRoles, ROLES, STAFF_ROLES, sendError } = ctx;
  getOrCreateModel(mongooseConnection, "StorePermissions", storePermissionsSchema);
  const router = express.Router();

  router.use(verifyToken);

  router.get("/me", authorizeRoles(...STAFF_ROLES), async (req, res) => {
    try {
      const config = await loadPermissions(mongooseConnection);
      return res.status(200).json({ role: req.user.role, modules: modulesForRole(config, req.user.role) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al obtener tus permisos.");
    }
  });

  router.use(authorizeRoles(ROLES.SUPER_ADMIN));

  const respondConfig = (res, config, extra = {}) =>
    res.status(200).json({
      ...extra,
      ...config,
      catalog: PERMISSION_MODULES,
      configurableRoles: CONFIGURABLE_ROLES,
      defaults: DEFAULT_PERMISSIONS,
    });

  router.get("/", async (req, res) => {
    try {
      return respondConfig(res, await loadPermissions(mongooseConnection));
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al obtener los permisos.");
    }
  });

  router.put("/", async (req, res) => {
    const { enabledModules, roles } = req.body || {};
    const enabledError = validateKeys(enabledModules, "enabledModules");
    if (enabledError) return sendError(res, 400, "VALIDATION_ERROR", enabledError);
    if (!roles || typeof roles !== "object" || Array.isArray(roles)) {
      return sendError(res, 400, "VALIDATION_ERROR", "roles debe ser un objeto { store_admin: [...], collaborator: [...] }.");
    }
    const unknownRoles = Object.keys(roles).filter((role) => !CONFIGURABLE_ROLES.includes(role));
    if (unknownRoles.length > 0) {
      return sendError(res, 400, "VALIDATION_ERROR", `Solo se configuran los roles ${CONFIGURABLE_ROLES.join(", ")} (super_admin siempre ve todo).`);
    }
    for (const role of CONFIGURABLE_ROLES) {
      const roleError = validateKeys(roles[role], `roles.${role}`);
      if (roleError) return sendError(res, 400, "VALIDATION_ERROR", roleError);
    }

    try {
      const config = await savePermissions(mongooseConnection, {
        enabledModules,
        roles: Object.fromEntries(CONFIGURABLE_ROLES.map((role) => [role, MODULE_KEYS.filter((k) => roles[role].includes(k))])),
      });
      return respondConfig(res, config, { message: "Permisos guardados." });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al guardar los permisos.");
    }
  });

  app.use("/api/permissions", router);
}

module.exports = {
  name: "permissions",
  registerRoutes,
  models: { StorePermissions: storePermissionsSchema },
};
