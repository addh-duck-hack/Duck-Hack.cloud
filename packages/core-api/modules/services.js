// Catálogo de servicios (`/api/services`, clave de permisos `services`; Fase 2
// del Roadmap de cotizaciones, Obsidian "Fase 2 - Citas"). Módulo propio y
// vendible sin Citas: la Propuesta 1 del salón lo usa para la sección de
// precios y los botones "Agendar por WhatsApp"; Citas (modules/appointments)
// lo lee para la duración, el precio y quién hace cada servicio.
//
// Categorías: las de modules/categories.js con `kind: "service"` (se
// administran con este mismo permiso).
//
// Una cita puede llevar varios servicios: su duración es la suma de
// `durationMin` y el tiempo entre citas, el mayor `bufferMin` de los elegidos.
// `deposit` (anticipo) se captura ya y se cobra en la Fase 5.
const express = require("express");
const mongoose = require("mongoose");
const {
  sanitizeDoc,
  handleMongooseError,
  asTrimmedString,
  asFiniteNumber,
  isValidObjectId,
  getOrCreateModel,
} = require("../lib/moduleHelpers");
const { createModuleAuthorizer } = require("../lib/permissions");
const { findCategoryByRef, toPublicCategory } = require("./categories");

const DEPOSIT_TYPES = ["none", "fixed", "percent"];
const MAX_DURATION_MIN = 600;
const MAX_BUFFER_MIN = 240;

const serviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
    // HTML básico (el storefront lo sanitiza, igual que Product.description).
    description: { type: String, trim: true, maxlength: 5000, default: "" },
    durationMin: { type: Number, required: true, min: 5, max: MAX_DURATION_MIN },
    // Tiempo libre después del servicio (limpieza, preparar la estación).
    bufferMin: { type: Number, min: 0, max: MAX_BUFFER_MIN, default: 0 },
    price: { type: Number, required: true, min: 0 },
    // "Desde $X": el precio final depende (largo de cabello, diseño…).
    priceFrom: { type: Boolean, default: false },
    image: { type: String, trim: true, maxlength: 300, default: "" },
    // false = solo se agenda por teléfono/mostrador o WhatsApp.
    bookableOnline: { type: Boolean, default: true },
    deposit: {
      type: { type: String, enum: DEPOSIT_TYPES, default: "none" },
      value: { type: Number, min: 0, default: 0 },
    },
    sortOrder: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
serviceSchema.index({ isActive: 1, sortOrder: 1, name: 1 });
serviceSchema.index({ category: 1 });

const validatePayload = (sendError) => (req, res, next) => {
  const payload = req.body || {};
  const isCreate = req.method === "POST";
  const out = {};

  if (isCreate || payload.name !== undefined) {
    const name = asTrimmedString(payload.name);
    if (!name || name.length > 120) return sendError(res, 400, "VALIDATION_ERROR", "name es requerido (máx. 120 caracteres).");
    out.name = name;
  }

  const integerIn = (field, min, max, label) => {
    const num = asFiniteNumber(payload[field]);
    if (num === null || !Number.isInteger(num) || num < min || num > max) return `${label} debe ser un entero de ${min} a ${max}.`;
    out[field] = num;
    return null;
  };
  if (isCreate || payload.durationMin !== undefined) {
    const error = integerIn("durationMin", 5, MAX_DURATION_MIN, "durationMin (minutos)");
    if (error) return sendError(res, 400, "VALIDATION_ERROR", error);
  }
  if (payload.bufferMin !== undefined) {
    const error = integerIn("bufferMin", 0, MAX_BUFFER_MIN, "bufferMin (minutos)");
    if (error) return sendError(res, 400, "VALIDATION_ERROR", error);
  }
  if (isCreate || payload.price !== undefined) {
    const price = asFiniteNumber(payload.price);
    if (price === null || price < 0) return sendError(res, 400, "VALIDATION_ERROR", "price debe ser un número >= 0.");
    out.price = price;
  }
  if (payload.sortOrder !== undefined) {
    const sortOrder = asFiniteNumber(payload.sortOrder);
    if (sortOrder === null || sortOrder < 0) return sendError(res, 400, "VALIDATION_ERROR", "sortOrder debe ser un número >= 0.");
    out.sortOrder = Math.floor(sortOrder);
  }

  if (payload.category !== undefined) {
    if (payload.category === null || payload.category === "") out.category = null;
    else if (!isValidObjectId(payload.category)) return sendError(res, 400, "VALIDATION_ERROR", "category no válida.");
    else out.category = payload.category;
  }

  if (payload.deposit !== undefined) {
    const deposit = payload.deposit || {};
    const type = deposit.type || "none";
    if (!DEPOSIT_TYPES.includes(type)) {
      return sendError(res, 400, "VALIDATION_ERROR", `deposit.type debe ser uno de: ${DEPOSIT_TYPES.join(", ")}.`);
    }
    const value = type === "none" ? 0 : asFiniteNumber(deposit.value);
    if (value === null || value < 0 || (type === "percent" && value > 100) || (type !== "none" && value === 0)) {
      return sendError(
        res,
        400,
        "VALIDATION_ERROR",
        type === "percent" ? "El anticipo en porcentaje va de 1 a 100." : "El anticipo fijo debe ser mayor a 0."
      );
    }
    out.deposit = { type, value };
  }

  if (payload.description !== undefined) out.description = asTrimmedString(payload.description).slice(0, 5000);
  if (payload.image !== undefined) out.image = asTrimmedString(payload.image).slice(0, 300);
  for (const flag of ["priceFrom", "bookableOnline", "isActive"]) {
    if (payload[flag] !== undefined) out[flag] = Boolean(payload[flag]);
  }

  req.body = out;
  return next();
};

// Respuesta pública: lo que el storefront/app necesita para mostrar y agendar.
const toPublicService = (service) => ({
  _id: service._id,
  name: service.name,
  category: service.category && service.category.name ? toPublicCategory(service.category) : null,
  description: service.description || "",
  durationMin: service.durationMin,
  price: service.price,
  priceFrom: Boolean(service.priceFrom),
  image: service.image || "",
  bookableOnline: service.bookableOnline !== false,
  sortOrder: service.sortOrder || 0,
});

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, sendError } = ctx;
  const Service = getOrCreateModel(mongooseConnection, "Service", serviceSchema);
  const router = express.Router();

  const validateObjectIdParam = (req, res, next) =>
    isValidObjectId(req.params.id) ? next() : sendError(res, 400, "INVALID_OBJECT_ID", "id no válido");

  // Orden del catálogo: por categoría (su sortOrder) y luego por el del
  // servicio; los que no tienen categoría, al final.
  const sortForCatalog = (items) =>
    items.sort((a, b) => {
      const ca = a.category ? a.category.sortOrder ?? 0 : Number.MAX_SAFE_INTEGER;
      const cb = b.category ? b.category.sortOrder ?? 0 : Number.MAX_SAFE_INTEGER;
      return ca - cb || (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name, "es");
    });

  // ---- públicas: solo activos (y con categoría activa, si tienen) ----
  // ?category= (id o slug) filtra; ?bookable=true deja solo los que se agendan en línea.
  router.get("/public", async (req, res) => {
    try {
      const filter = { isActive: true };
      if (req.query.category) {
        const category = await findCategoryByRef(mongooseConnection, req.query.category, { kind: "service" });
        if (!category || category.isActive === false) return res.status(200).json({ items: [] });
        filter.category = category._id;
      }
      if (req.query.bookable === "true") filter.bookableOnline = { $ne: false };
      const services = await Service.find(filter).populate("category", "name slug description image featured sortOrder isActive").lean();
      const visible = services.filter((s) => !s.category || s.category.isActive !== false);
      return res.status(200).json({ items: sortForCatalog(visible).map(toPublicService) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar los servicios.");
    }
  });

  router.get("/public/:id", validateObjectIdParam, async (req, res) => {
    try {
      const service = await Service.findOne({ _id: req.params.id, isActive: true })
        .populate("category", "name slug description image featured sortOrder isActive")
        .lean();
      if (!service || service.category?.isActive === false) return sendError(res, 404, "SERVICE_NOT_FOUND", "Servicio no encontrado.");
      return res.status(200).json(toPublicService(service));
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar el servicio.");
    }
  });

  // ---- staff ----
  router.use(verifyToken);
  const { authorizeModule } = createModuleAuthorizer({ mongooseConnection, sendError });
  // Citas lee el catálogo (alta manual, especialistas) aunque no se haya
  // contratado Servicios por separado.
  const canRead = authorizeModule("services", { alsoBy: ["appointments"], requireContract: false });
  const canWrite = authorizeModule("services");

  const resolveCategory = async (categoryId) => {
    if (!categoryId) return null;
    const Category = mongooseConnection.models.Category;
    const exists = Category ? await Category.exists({ _id: categoryId, kind: "service" }) : null;
    return exists ? null : "La categoría elegida no existe (debe ser una categoría de servicios).";
  };

  const ensureService = async (req, res, next) => {
    const service = await Service.findById(req.params.id).catch(() => null);
    if (!service) return sendError(res, 404, "SERVICE_NOT_FOUND", "Servicio no encontrado.");
    req.service = service;
    return next();
  };

  router.get("/", canRead, async (req, res) => {
    try {
      const filter = {};
      if (req.query.isActive === "true") filter.isActive = true;
      if (req.query.isActive === "false") filter.isActive = false;
      if (isValidObjectId(req.query.category)) filter.category = req.query.category;
      const services = await Service.find(filter).populate("category", "name slug sortOrder isActive").lean();
      return res.status(200).json({ items: sortForCatalog(services).map(sanitizeDoc) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar los servicios.");
    }
  });

  router.post("/", canWrite, validatePayload(sendError), async (req, res) => {
    try {
      const categoryError = await resolveCategory(req.body.category);
      if (categoryError) return sendError(res, 400, "CATEGORY_NOT_FOUND", categoryError);
      const service = await Service.create(req.body);
      return res.status(201).json({ message: "Servicio creado.", service: sanitizeDoc(service) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al crear el servicio.");
    }
  });

  router.get("/:id", validateObjectIdParam, canRead, ensureService, (req, res) => res.status(200).json(sanitizeDoc(req.service)));

  router.put("/:id", validateObjectIdParam, canWrite, ensureService, validatePayload(sendError), async (req, res) => {
    try {
      if (req.body.category !== undefined) {
        const categoryError = await resolveCategory(req.body.category);
        if (categoryError) return sendError(res, 400, "CATEGORY_NOT_FOUND", categoryError);
      }
      Object.assign(req.service, req.body);
      await req.service.save();
      return res.status(200).json({ message: "Servicio actualizado.", service: sanitizeDoc(req.service) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al actualizar el servicio.");
    }
  });

  // Un servicio que ya está en citas (o que hace alguna especialista) no se
  // borra: se desactiva, para que las citas conserven de dónde salieron.
  router.delete("/:id", validateObjectIdParam, canWrite, ensureService, async (req, res) => {
    try {
      const { Appointment, Specialist } = mongooseConnection.models;
      const inAppointments = Appointment ? await Appointment.exists({ "services.service": req.service._id }) : null;
      if (inAppointments) {
        return sendError(res, 409, "SERVICE_IN_USE", "Este servicio ya está en citas: desactívalo en lugar de borrarlo.");
      }
      await req.service.deleteOne();
      if (Specialist) await Specialist.updateMany({ services: req.service._id }, { $pull: { services: req.service._id } });
      return res.status(200).json({ message: "Servicio eliminado." });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al eliminar el servicio.");
    }
  });

  app.use("/api/services", router);
}

module.exports = {
  name: "services",
  registerRoutes,
  models: { Service: serviceSchema },
  toPublicService,
};
