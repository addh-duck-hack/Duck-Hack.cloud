const jwt = require("jsonwebtoken");

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

// Middleware para verificar el token JWT
const verifyToken = (req, res, next) => {
  const authHeader = req.header("Authorization");
  const token = extractBearerToken(authHeader);

  if (!token) {
    return res.status(401).json({ message: "Acceso denegado. Token Bearer requerido." });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    if (!isValidRole(verified.role)) {
      return res.status(401).json({ message: "Token con rol inválido." });
    }
    req.user = {
      ...verified,
      role: verified.role,
    };
    next();
  } catch (error) {
    return res.status(401).json({ message: "Token no válido o expirado." });
  }
};

const authorizeRoles = (...allowedRoles) => {
  const invalidRoles = allowedRoles.filter((role) => !isValidRole(role));
  const validAllowedRoles = allowedRoles.filter(isValidRole);

  return (req, res, next) => {
    if (invalidRoles.length > 0) {
      return res.status(500).json({ message: "Configuración RBAC inválida en el servidor." });
    }

    if (!req.user) {
      return res.status(401).json({ message: "No autenticado." });
    }

    const userRole = req.user.role;
    if (!validAllowedRoles.includes(userRole)) {
      return res.status(403).json({ message: "No tienes permisos para realizar esta acción." });
    }

    next();
  };
};

const authorizeSelfOrRoles = (idParam, ...allowedRoles) => {
  const roleCheckMiddleware = authorizeRoles(...allowedRoles);

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado." });
    }

    const requestedId = req.params[idParam];
    if (requestedId && String(req.user.id) === String(requestedId)) {
      return next();
    }

    return roleCheckMiddleware(req, res, next);
  };
};

module.exports = {
  verifyToken,
  authorizeRoles,
  authorizeSelfOrRoles,
  isValidRole,
  ROLES,
  STAFF_ROLES,
};
