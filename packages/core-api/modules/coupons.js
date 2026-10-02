// Cupones de descuento (`/api/coupons`, clave de permisos `coupons`). Las
// reglas de validación y de usos viven en lib/coupons.js; aquí el modelo, la
// administración y la vista previa pública para la canasta.
//
// - POST /validate (público, rate-limited): ¿sirve este código para esta
//   canasta? Solo es una vista previa: el checkout vuelve a validar y es el
//   que fija el descuento (modules/orders.js#POST /public).
// - CRUD de staff. Un cupón que ya se usó en pedidos no se borra (409): se
//   desactiva, para que los pedidos conserven de dónde salió su descuento.
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
const { createRateLimiter } = require("../lib/rateLimit");
const { normalizeCode, resolveCoupon } = require("../lib/coupons");

const COUPON_TYPES = ["amount", "percent", "free_shipping"];
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,29}$/;

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true, unique: true, match: CODE_PATTERN },
    // Nota interna (no se muestra al cliente).
    description: { type: String, trim: true, maxlength: 200 },
    type: { type: String, enum: COUPON_TYPES, required: true },
    // amount: pesos; percent: 1–100; free_shipping: no se usa (0).
    value: { type: Number, min: 0, default: 0 },
    minPurchase: { type: Number, min: 0, default: null },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    maxUses: { type: Number, min: 1, default: null },
    maxUsesPerCustomer: { type: Number, min: 1, default: null },
    // Lo maneja lib/coupons.js (pedidos que lo usan, sin contar cancelados).
    usedCount: { type: Number, min: 0, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Normaliza el payload de alta/edición. En una edición solo se valida lo que
// viene; la coherencia entre campos (fechas, valor según el tipo) se revisa
// con el resultado combinado en validateCombined.
const validatePayload = (sendError) => (req, res, next) => {
  const payload = req.body || {};
  const isCreate = req.method === "POST";
  const out = {};

  if (isCreate || payload.code !== undefined) {
    const code = normalizeCode(payload.code);
    if (!CODE_PATTERN.test(code)) {
      return sendError(res, 400, "VALIDATION_ERROR", "El código lleva de 3 a 30 letras, números, guiones o guion bajo (sin espacios).");
    }
    out.code = code;
  }
  if (isCreate || payload.type !== undefined) {
    if (!COUPON_TYPES.includes(payload.type)) {
      return sendError(res, 400, "VALIDATION_ERROR", `type debe ser uno de: ${COUPON_TYPES.join(", ")}.`);
    }
    out.type = payload.type;
  }
  const optionalNumber = (field, { integer = false, min = 0 } = {}) => {
    if (payload[field] === undefined) return null;
    if (payload[field] === null || payload[field] === "") {
      out[field] = null;
      return null;
    }
    const num = asFiniteNumber(payload[field]);
    if (num === null || num < min || (integer && !Number.isInteger(num))) {
      return `${field} debe ser ${integer ? "un entero" : "un número"} mayor o igual a ${min}.`;
    }
    out[field] = num;
    return null;
  };
  const numberError =
    optionalNumber("value") ||
    optionalNumber("minPurchase") ||
    optionalNumber("maxUses", { integer: true, min: 1 }) ||
    optionalNumber("maxUsesPerCustomer", { integer: true, min: 1 });
  if (numberError) return sendError(res, 400, "VALIDATION_ERROR", numberError);

  for (const field of ["startsAt", "endsAt"]) {
    if (payload[field] === undefined) continue;
    if (payload[field] === null || payload[field] === "") {
      out[field] = null;
      continue;
    }
    const date = new Date(payload[field]);
    if (Number.isNaN(date.getTime())) return sendError(res, 400, "VALIDATION_ERROR", `${field} no es una fecha válida.`);
    out[field] = date;
  }
  if (payload.description !== undefined) out.description = asTrimmedString(payload.description).slice(0, 200);
  if (payload.isActive !== undefined) out.isActive = Boolean(payload.isActive);

  // usedCount nunca se acepta del cliente.
  req.body = out;
  return next();
};

// Reglas entre campos, sobre el cupón ya combinado (alta o edición).
const validateCombined = (coupon) => {
  if (coupon.type === "amount" && !(coupon.value > 0)) return "Un cupón de monto fijo necesita un valor mayor a 0.";
  if (coupon.type === "percent" && !(coupon.value > 0 && coupon.value <= 100)) return "Un cupón de porcentaje necesita un valor de 1 a 100.";
  if (coupon.startsAt && coupon.endsAt && new Date(coupon.endsAt) <= new Date(coupon.startsAt)) {
    return "La fecha de fin debe ser posterior a la de inicio.";
  }
  if (coupon.maxUses && coupon.maxUsesPerCustomer && coupon.maxUsesPerCustomer > coupon.maxUses) {
    return "El límite por cliente no puede ser mayor que el límite total.";
  }
  return null;
};

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, sendError } = ctx;
  const Coupon = getOrCreateModel(mongooseConnection, "Coupon", couponSchema);
  const router = express.Router();

  // ---- pública: vista previa del cupón en la canasta ----
  const validateRateLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 30,
    code: "RATE_LIMIT_COUPON_EXCEEDED",
    message: "Demasiados intentos de cupón. Intenta de nuevo en unos minutos.",
    sendError,
  });
  router.post("/validate", validateRateLimiter, async (req, res) => {
    try {
      const subtotal = asFiniteNumber(req.body?.subtotal);
      const result = await resolveCoupon(mongooseConnection, req.body?.code, {
        subtotal: subtotal ?? 0,
        customerEmail: req.body?.customerEmail,
        deliveryMethod: req.body?.deliveryMethod,
      });
      if (result.error) return sendError(res, result.error.status, result.error.code, result.error.message);
      const { coupon, discount, freeShipping } = result;
      return res.status(200).json({
        valid: true,
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        discount,
        freeShipping,
        message: freeShipping ? "¡Tu envío es gratis!" : `Ahorras $${discount.toLocaleString("es-MX")}.`,
      });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al validar el cupón.");
    }
  });

  // ---- staff ----
  router.use(verifyToken);
  const canManage = createModuleAuthorizer({ mongooseConnection, sendError }).authorizeModule("coupons");
  router.use(canManage);

  const ensureCoupon = async (req, res, next) => {
    if (!isValidObjectId(req.params.id)) return sendError(res, 400, "INVALID_OBJECT_ID", "id no válido");
    const coupon = await Coupon.findById(req.params.id).catch(() => null);
    if (!coupon) return sendError(res, 404, "COUPON_NOT_FOUND", "Cupón no encontrado.");
    req.coupon = coupon;
    return next();
  };

  router.get("/", async (req, res) => {
    try {
      const coupons = await Coupon.find().sort({ createdAt: -1 }).lean();
      return res.status(200).json({ items: coupons.map(sanitizeDoc) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar cupones.");
    }
  });

  router.post("/", validatePayload(sendError), async (req, res) => {
    try {
      const combinedError = validateCombined({ value: 0, ...req.body });
      if (combinedError) return sendError(res, 400, "VALIDATION_ERROR", combinedError);
      const coupon = await Coupon.create({ ...req.body, value: req.body.type === "free_shipping" ? 0 : req.body.value });
      return res.status(201).json({ message: "Cupón creado.", coupon: sanitizeDoc(coupon) });
    } catch (error) {
      if (error?.code === 11000) return sendError(res, 409, "COUPON_CODE_TAKEN", `Ya existe un cupón con el código "${req.body.code}".`);
      return handleMongooseError(sendError, res, error, "Error al crear el cupón.");
    }
  });

  router.get("/:id", ensureCoupon, (req, res) => res.status(200).json(sanitizeDoc(req.coupon)));

  router.put("/:id", ensureCoupon, validatePayload(sendError), async (req, res) => {
    try {
      const combined = { ...req.coupon.toObject(), ...req.body };
      const combinedError = validateCombined(combined);
      if (combinedError) return sendError(res, 400, "VALIDATION_ERROR", combinedError);
      Object.assign(req.coupon, req.body);
      if (req.coupon.type === "free_shipping") req.coupon.value = 0;
      await req.coupon.save();
      return res.status(200).json({ message: "Cupón actualizado.", coupon: sanitizeDoc(req.coupon) });
    } catch (error) {
      if (error?.code === 11000) return sendError(res, 409, "COUPON_CODE_TAKEN", `Ya existe un cupón con el código "${req.body.code}".`);
      return handleMongooseError(sendError, res, error, "Error al actualizar el cupón.");
    }
  });

  router.delete("/:id", ensureCoupon, async (req, res) => {
    try {
      const Order = mongooseConnection.models.Order;
      const inUse = Order ? await Order.exists({ "discount.coupon": req.coupon._id }) : null;
      if (inUse) {
        return sendError(res, 409, "COUPON_IN_USE", "Este cupón ya se usó en pedidos: desactívalo en lugar de borrarlo.");
      }
      await req.coupon.deleteOne();
      return res.status(200).json({ message: "Cupón eliminado." });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al eliminar el cupón.");
    }
  });

  app.use("/api/coupons", router);
}

module.exports = {
  name: "coupons",
  registerRoutes,
  models: { Coupon: couponSchema },
};
