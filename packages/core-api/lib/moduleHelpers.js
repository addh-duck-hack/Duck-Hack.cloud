// Helpers mínimos compartidos por los módulos de este paquete. Duplican a
// propósito un puñado de utilidades que también existen en
// backend/middleware/validationMiddleware.js y en cada *.routes.js — este
// paquete no debe importar nada de la app que lo consume (ver README.md,
// sección "Scope boundary"), así que lo poco que necesita vive aquí.
const mongoose = require("mongoose");

const sanitizeDoc = (doc) => {
  if (!doc) return null;
  const obj = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  delete obj.__v;
  return obj;
};

// sendError se recibe por parámetro (viene de ctx, ver README.md) en vez de
// importarse — es la app consumidora quien decide el formato de error.
const handleMongooseError = (sendError, res, error, fallbackMessage) => {
  if (error?.name === "ValidationError") {
    const messages = Object.values(error.errors || {}).map((e) => e.message);
    return sendError(res, 400, "VALIDATION_ERROR", "Error de validación", messages);
  }
  if (error?.code === 11000) {
    return sendError(res, 409, "DUPLICATE_KEY", "Conflicto de unicidad.");
  }
  return sendError(res, 500, "INTERNAL_SERVER_ERROR", fallbackMessage);
};

const asTrimmedString = (value) => (typeof value === "string" ? value.trim() : "");

const asFiniteNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

// Registra el modelo en la conexión dada si no existe ya — evita el error
// "Cannot overwrite model once compiled" si registerRoutes llegara a correr
// más de una vez sobre la misma conexión (hot-reload en dev, tests).
const getOrCreateModel = (connection, name, schema) => connection.models[name] || connection.model(name, schema);

module.exports = {
  sanitizeDoc,
  handleMongooseError,
  asTrimmedString,
  asFiniteNumber,
  isValidObjectId,
  getOrCreateModel,
};
