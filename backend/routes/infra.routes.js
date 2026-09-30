const express = require("express");
const router = express.Router();
const { sendError } = require("../utils/httpResponses");
// Auth y permisos viven en @duck-hack/core-api (modules/auth.js,
// lib/permissions.js) — se arman con sendError y la conexión de esta instancia.
const mongoose = require("mongoose");
const { auth, permissions } = require("@duck-hack/core-api");
const { verifyToken } = auth.createAuthMiddleware(sendError);
const { authorizeModule } = permissions.createModuleAuthorizer({ mongooseConnection: mongoose.connection, sendError });
const { getServerMetrics, PortainerConfigError, PortainerRequestError } = require("../utils/portainerClient");

// Herramientas de infraestructura del servidor — confidencial: módulo "panel"
// de los permisos por tienda (packages/core-api/lib/permissions.js). Por
// default ningún rol además de super_admin lo tiene: son URLs y uso del
// servidor de Duck-Hack, no datos que un cliente suela necesitar.
const INFRA_TARGETS = [
  { id: "portainer", label: "Portainer", url: "https://portainer.server.duck-hack.cloud" },
  { id: "npm", label: "NGINX Proxy Manager", url: "https://npm.server.duck-hack.cloud" },
  { id: "deploy", label: "Panel de deploy", url: "https://deploy.server.duck-hack.cloud" },
  { id: "ftp", label: "Servidor FTP", url: "https://ftp.server.duck-hack.cloud" },
  { id: "mongo", label: "MongoDB", url: "https://mongo.duck-hack.cloud" },
  { id: "pma", label: "PHP My Admin", url: "https://pma.server.duck-hack.cloud" },
];

const CHECK_TIMEOUT_MS = 5000;
// 502/503/504: el proxy (nginx-proxy-manager) respondió pero no pudo alcanzar
// el servicio real detrás — es una señal más fuerte de "está abajo" que un
// 401/403 (el servicio sí responde, solo exige login) o un 404.
const GATEWAY_ERROR_STATUSES = new Set([502, 503, 504]);

const checkTarget = async (target) => {
  const startedAt = Date.now();
  try {
    const response = await fetch(target.url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    const isGatewayError = GATEWAY_ERROR_STATUSES.has(response.status);
    return {
      ...target,
      status: isGatewayError ? "down" : "up",
      httpStatus: response.status,
      reason: isGatewayError ? "gateway_error" : undefined,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ...target,
      status: "down",
      reason: error?.name === "TimeoutError" ? "timeout" : "unreachable",
      latencyMs: Date.now() - startedAt,
    };
  }
};

router.get("/status", verifyToken, authorizeModule("panel"), async (req, res) => {
  try {
    const items = await Promise.all(INFRA_TARGETS.map(checkTarget));
    return res.status(200).json({ items, checkedAt: new Date().toISOString() });
  } catch (error) {
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al verificar el estado de la infraestructura.");
  }
});

// Uso de recursos del VPS (CPU/memoria/disco/red), aproximado sumando el uso
// de todos los contenedores del host vía la API de Portainer. Ver
// utils/portainerClient.js para las fórmulas y limitaciones (disco = solo
// footprint de Docker, red = acumulado desde que arrancó cada contenedor).
router.get("/metrics", verifyToken, authorizeModule("panel"), async (req, res) => {
  try {
    const metrics = await getServerMetrics();
    return res.status(200).json(metrics);
  } catch (error) {
    if (error instanceof PortainerConfigError) {
      return sendError(res, 501, "PORTAINER_NOT_CONFIGURED", error.message);
    }
    if (error instanceof PortainerRequestError) {
      return sendError(res, 502, "PORTAINER_UNREACHABLE", "No fue posible consultar Portainer.", error.message);
    }
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al obtener métricas del servidor.");
  }
});

module.exports = router;
