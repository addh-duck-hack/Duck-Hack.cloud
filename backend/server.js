const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();
const cors = require("cors");
const helmet = require("helmet");
const { sendError } = require("./utils/httpResponses");
const { resolveUploadsDir } = require("./utils/uploads");
const { modules: coreApiModules, auth } = require("@duck-hack/core-api");
const AgencyClient = require("./models/agencyClient.model");
const { getRunningContainersCount } = require("./utils/portainerClient");

// Auth/Users vive ahora en @duck-hack/core-api (packages/core-api/modules/auth.js)
// — verifyToken/authorizeRoles se arman acá con createAuthMiddleware(sendError)
// (mismo criterio de inyección que el resto del paquete, ver su README.md),
// ROLES/STAFF_ROLES/validateJwtEnvConfig son estáticos.
const { verifyToken, authorizeRoles } = auth.createAuthMiddleware(sendError);
const { ROLES, STAFF_ROLES, validateJwtEnvConfig } = auth;

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json());

const PORT = process.env.PORT || 5000;
validateJwtEnvConfig();
const mongoGlobalUrl = (process.env.MONGO_URL_GLOBAL || "").trim();
if (!mongoGlobalUrl) {
  throw new Error("MONGO_URL_GLOBAL es obligatorio y no puede estar vacío.");
}
const configuredCorsOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, "")) // tolera slash final por error de tipeo en el .env
  .filter(Boolean);

if (configuredCorsOrigins.length === 0) {
  throw new Error("CORS_ALLOWED_ORIGINS es obligatorio y no puede estar vacío.");
}

const allowedCorsOrigins = new Set(configuredCorsOrigins);

const corsOptions = {
  origin: (origin, callback) => {
    // Permite herramientas sin origen (curl/postman/server-to-server)
    if (!origin) return callback(null, true);
    if (allowedCorsOrigins.has(origin)) return callback(null, true);
    console.warn(`CORS rechazado para origin="${origin}". Permitidos: ${configuredCorsOrigins.join(", ")}`);
    return callback(new Error("CORS_ORIGIN_NOT_ALLOWED"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

// Conectar a MongoDB (una sola conexión por instancia/tienda)
mongoose.connect(mongoGlobalUrl)
  .then(() => console.log("Conectado a MongoDB"))
  .catch((err) => console.error("Error al conectar a MongoDB", err));

// Importar y usar rutas — solo lo que NO se movió a @duck-hack/core-api:
// AgencyClient/Accounting/Invoices/Infra son herramienta interna de
// Duck-Hack (facturación/monitoreo de la propia agencia), deliberadamente
// no candidatas a compartirse entre tiendas (ver packages/core-api/README.md).
const agencyClientRoutes = require("./routes/agencyClient.routes");
const infraRoutes = require("./routes/infra.routes");
const accountingRoutes = require("./routes/accounting.routes");
const invoicesRoutes = require("./routes/invoices.routes");

app.use(cors(corsOptions));
app.use(
  helmet({
    // API-only backend: CSP se gestiona en frontends.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hsts: process.env.NODE_ENV === "production",
  })
);
app.use("/api/agency-clients", agencyClientRoutes);
app.use("/api/infra", infraRoutes);
app.use("/api/accounting", accountingRoutes);
app.use("/api/invoices", invoicesRoutes);

// Módulos de @duck-hack/core-api (auth, mail, uploads, store-config,
// productos, inventario, pedidos — ver packages/core-api/README.md) —
// código compartido entre tiendas, montado acá con las piezas de esta
// instancia (conexión Mongo, auth, formato de error).
coreApiModules.forEach((mod) =>
  mod.registerRoutes(app, {
    mongooseConnection: mongoose.connection,
    verifyToken,
    authorizeRoles,
    ROLES,
    STAFF_ROLES,
    sendError,
    // Solo lo usa modules/storeConfig.js (GET /public) para recalcular
    // métricas en vivo — AgencyClient/Portainer son herramienta interna de
    // Duck-Hack, no viajan con el módulo. Si no se provee, esas métricas
    // simplemente conservan su último valor guardado (ver el propio módulo).
    resolveLiveMetricSources: {
      active_clients: () => AgencyClient.countDocuments({ isActive: { $ne: false } }),
      active_containers: () => getRunningContainersCount(),
    },
  })
);

// Servir la carpeta uploads como estática
const uploadsDir = resolveUploadsDir();
if (!uploadsDir) {
  throw new Error("No hay un directorio de uploads con permisos de escritura.");
}
app.use('/uploads', express.static(uploadsDir));

app.use((err, req, res, next) => {
  if (err?.message === "CORS_ORIGIN_NOT_ALLOWED") {
    return sendError(res, 403, "CORS_ORIGIN_NOT_ALLOWED", "Origen no permitido por la política CORS.");
  }
  return next(err);
});

app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);
  return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error interno del servidor");
});

app.use((req, res) => {
  return sendError(res, 404, "ROUTE_NOT_FOUND", "Ruta no encontrada");
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
