const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();
const cors = require("cors");
const { sendError } = require("./utils/httpResponses");

const app = express();
app.set("trust proxy", 1);
app.use(express.json());

const PORT = process.env.PORT || 5000;
const configuredCorsOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
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
    return callback(new Error("CORS_ORIGIN_NOT_ALLOWED"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

// Conectar a MongoDB
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("Conectado a MongoDB"))
  .catch((err) => console.error("Error al conectar a MongoDB", err));

// Importar y usar rutas
const userRoutes = require("./routes/user.routes");
const mailRoutes = require("./routes/mail.routes");
const uploadRoutes = require("./routes/upload.routes");

app.use(cors(corsOptions));
app.use("/api/users", userRoutes);
app.use("/api/mail", mailRoutes);
app.use("/api/uploads", uploadRoutes);
// Servir la carpeta uploads como estática
app.use('/uploads', express.static('uploads'));

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
