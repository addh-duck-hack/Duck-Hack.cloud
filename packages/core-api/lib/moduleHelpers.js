// Helpers mínimos compartidos por los módulos de este paquete. Duplican a
// propósito un puñado de utilidades que también existen en
// backend/middleware/validationMiddleware.js y en cada *.routes.js — este
// paquete no debe importar nada de la app que lo consume (ver README.md,
// sección "Scope boundary"), así que lo poco que necesita vive aquí.
const mongoose = require("mongoose");
const { describeValidationError } = require("./validationMessages");

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
    const { message, details } = describeValidationError(error);
    return sendError(res, 400, "VALIDATION_ERROR", message, details);
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

// Crea un documento con folio consecutivo (`field` = máximo + 1, índice
// único). Si dos altas toman el mismo número a la vez, la segunda choca con
// el índice y se reintenta con el siguiente.
const createWithFolio = async (Model, field, data, attempts = 5) => {
  for (let i = 0; ; i += 1) {
    const last = await Model.findOne({ [field]: { $ne: null } }).sort({ [field]: -1 }).select(field).lean();
    try {
      return await Model.create({ ...data, [field]: (last?.[field] || 0) + 1 });
    } catch (error) {
      if (error?.code !== 11000 || !error?.keyPattern?.[field] || i >= attempts - 1) throw error;
    }
  }
};

module.exports = {
  createWithFolio,
  sanitizeDoc,
  handleMongooseError,
  asTrimmedString,
  asFiniteNumber,
  isValidObjectId,
  getOrCreateModel,
};
