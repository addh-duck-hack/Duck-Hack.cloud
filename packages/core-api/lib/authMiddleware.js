// Copia fiel de backend/middleware/authMiddleware.js (ahora eliminado), con
// un solo cambio estructural: los middlewares que responden error
// (verifyToken/authorizeRoles/authorizeSelf/authorizeSelfOrRoles) se arman
// con createAuthMiddleware(sendError) en vez de importar sendError directo
// (mismo criterio de inyección que el resto de este paquete, ver
// lib/moduleHelpers.js) — necesario porque, a diferencia de los demás
// módulos, estas piezas también las usan directamente los archivos de
// backend/ que quedaron fuera de core-api (AgencyClient, Accounting,
// Invoices, Infra), no solo el propio módulo `auth`.
const { verifyAccessToken } = require("./jwt");

const ROLES = Object.freeze({
  SUPER_ADMIN: "super_admin",
  STORE_ADMIN: "store_admin",
  CATALOG_MANAGER: "catalog_manager",
  ORDER_MANAGER: "order_manager",
  CUSTOMER: "customer",
});

const ALLOWED_ROLES = Object.values(ROLES);
const STAFF_ROLES = Object.freeze([
  ROLES.SUPER_ADMIN,
  ROLES.STORE_ADMIN,
  ROLES.CATALOG_MANAGER,
  ROLES.ORDER_MANAGER,
]);

const isValidRole = (role) => ALLOWED_ROLES.includes(role);

const extractBearerToken = (authHeader = "") => {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
};

const createAuthMiddleware = (sendError) => {
  const verifyToken = (req, res, next) => {
    const authHeader = req.header("Authorization");
    const token = extractBearerToken(authHeader);

    if (!token) {
      return sendError(res, 401, "TOKEN_REQUIRED", "Acceso denegado. Token Bearer requerido.");
    }

    try {
      const verified = verifyAccessToken(token);
      if (!isValidRole(verified.role)) {
        return sendError(res, 401, "TOKEN_INVALID_ROLE", "Token con rol inválido.");
      }
      req.user = {
        ...verified,
        role: verified.role,
      };
      next();
    } catch (error) {
      return sendError(res, 401, "TOKEN_INVALID_OR_EXPIRED", "Token no válido o expirado.");
    }
  };

  const authorizeRoles = (...allowedRoles) => {
    const invalidRoles = allowedRoles.filter((role) => !isValidRole(role));
    const validAllowedRoles = allowedRoles.filter(isValidRole);

    return (req, res, next) => {
      if (invalidRoles.length > 0) {
        return sendError(res, 500, "RBAC_CONFIGURATION_INVALID", "Configuración RBAC inválida en el servidor.");
      }

      if (!req.user) {
        return sendError(res, 401, "AUTHENTICATION_REQUIRED", "No autenticado.");
      }

      const userRole = req.user.role;
      if (!validAllowedRoles.includes(userRole)) {
        return sendError(res, 403, "FORBIDDEN", "No tienes permisos para realizar esta acción.");
      }

      next();
    };
  };

  const authorizeSelfOrRoles = (idParam, ...allowedRoles) => {
    const roleCheckMiddleware = authorizeRoles(...allowedRoles);

    return (req, res, next) => {
      if (!req.user) {
        return sendError(res, 401, "AUTHENTICATION_REQUIRED", "No autenticado.");
      }

      const requestedId = req.params[idParam];
      if (requestedId && String(req.user.id) === String(requestedId)) {
        return next();
      }

      return roleCheckMiddleware(req, res, next);
    };
  };

  const authorizeSelf = (idParam) => {
    return (req, res, next) => {
      if (!req.user) {
        return sendError(res, 401, "AUTHENTICATION_REQUIRED", "No autenticado.");
      }

      const requestedId = req.params[idParam];
      if (!requestedId || String(req.user.id) !== String(requestedId)) {
        return sendError(res, 403, "FORBIDDEN", "No tienes permisos para realizar esta acción.");
      }

      return next();
    };
  };

  return { verifyToken, authorizeRoles, authorizeSelfOrRoles, authorizeSelf };
};

module.exports = {
  createAuthMiddleware,
  isValidRole,
  ROLES,
  STAFF_ROLES,
};
