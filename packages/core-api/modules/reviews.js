// Reseñas (`/api/reviews`, clave de permisos `reviews`). Fase 1 del Roadmap
// de cotizaciones (Obsidian "Fase 1 - Tienda P2"). El modelo es genérico
// (`target.kind`): hoy solo "product"; la reseña post-cita del salón (Fase 4)
// reutiliza el mismo modelo con "appointment".
//
// - Quién califica: un cliente con sesión que tenga un pedido entregado o
//   recogido con ese producto (ligado a su cuenta o con su mismo correo,
//   igual que GET /api/orders/mine). Una reseña por cliente y producto; puede
//   editarla y vuelve a moderación.
// - Moderación: toda reseña entra "pending" y solo se publica al aprobarla en
//   el admin. Al cambiar lo publicado se recalculan Product.ratingAvg /
//   ratingCount (salen en /api/products/public).
// - Públicas: solo aprobadas, con el nombre corto del cliente ("Ana G.").
// - Reseña post-cita (Fase 4, `target.kind: "appointment"`): una por cita
//   completada; la califica la clienta con el enlace de su cita
//   (X-Appointment-Token, el correo de modules/appointments.js) o con sesión.
//   Puede ser invitada (`customer` nulo). Guarda una foto de servicios y
//   especialista. Moderación igual que las de producto; aprobada, el staff
//   puede "Publicar como testimonio" (copia a StoreConfig.testimonials con
//   `fromReview`, sin duplicar).
const express = require("express");
const mongoose = require("mongoose");
const { sanitizeDoc, asTrimmedString, asFiniteNumber, isValidObjectId, getOrCreateModel } = require("../lib/moduleHelpers");
const { createModuleAuthorizer } = require("../lib/permissions");
const { createRateLimiter } = require("../lib/rateLimit");
const { extractBearerToken } = require("../lib/authMiddleware");
const { verifyAccessToken, verifyAppointmentAccessToken } = require("../lib/jwt");

const TARGET_KINDS = ["product", "appointment"];
const REVIEW_STATUSES = ["pending", "approved", "rejected"];
// Estados del pedido en los que el cliente ya tiene el producto.
const RECEIVED_STATUSES = ["delivered", "picked_up"];
const MAX_COMMENT = 1000;
const MAX_PUBLIC_LIMIT = 50;

const reviewSchema = new mongoose.Schema(
  {
    target: {
      kind: { type: String, enum: TARGET_KINDS, required: true },
      id: { type: mongoose.Schema.Types.ObjectId, required: true },
    },
    // Nulo solo en reseñas de cita de invitadas.
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // Foto del nombre al calificar (si la cuenta cambia de nombre o se borra,
    // la reseña se sigue viendo igual).
    customerName: { type: String, trim: true, maxlength: 120 },
    customerEmail: { type: String, trim: true, lowercase: true, maxlength: 160, default: "" },
    // Reseña de cita: foto de lo que se hizo (si la cita cambia o se borra,
    // la reseña se sigue entendiendo).
    appointmentInfo: {
      type: new mongoose.Schema(
        {
          appointmentNumber: Number,
          services: [String],
          specialist: { type: mongoose.Schema.Types.ObjectId, default: null },
          specialistName: String,
          start: Date,
        },
        { _id: false }
      ),
      default: undefined,
    },
    // Pedido con el que el cliente recibió el producto (referencia para el
    // admin; no se expone en lo público).
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: MAX_COMMENT, default: "" },
    status: { type: String, enum: REVIEW_STATUSES, default: "pending" },
    // Motivo de rechazo: lo ve el cliente en su reseña, no se publica.
    rejectionReason: { type: String, trim: true, maxlength: 300, default: "" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
reviewSchema.index({ customer: 1, "target.kind": 1, "target.id": 1 }, { unique: true });
reviewSchema.index({ "target.kind": 1, "target.id": 1, status: 1, createdAt: -1 });
reviewSchema.index({ status: 1, createdAt: -1 });
// Una reseña por cita (sea quien sea quien califique).
reviewSchema.index({ "target.id": 1 }, { unique: true, partialFilterExpression: { "target.kind": "appointment" } });

// "Ana María González" → "Ana G." (lo público nunca lleva el nombre completo).
const shortName = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Cliente";
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
};

const round1 = (value) => Math.round(value * 10) / 10;

// Payload del cliente: { rating, comment }.
const validateReviewPayload = (sendError) => (req, res, next) => {
  const payload = req.body || {};
  const rating = asFiniteNumber(payload.rating);
  if (rating === null || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return sendError(res, 400, "VALIDATION_ERROR", "Elige de 1 a 5 estrellas.");
  }
  const comment = asTrimmedString(payload.comment);
  if (comment.length > MAX_COMMENT) {
    return sendError(res, 400, "VALIDATION_ERROR", `El comentario puede tener hasta ${MAX_COMMENT} caracteres.`);
  }
  req.body = { rating, comment, product: payload.product, appointment: payload.appointment };
  return next();
};

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, sendError } = ctx;
  const Review = getOrCreateModel(mongooseConnection, "Review", reviewSchema);
  const router = express.Router();

  // Promedio y conteo de lo aprobado → Product.ratingAvg / ratingCount.
  const recalculateProductRating = async (productId) => {
    const Product = mongooseConnection.models.Product;
    if (!Product || !productId) return;
    const [stats] = await Review.aggregate([
      { $match: { "target.kind": "product", "target.id": new mongoose.Types.ObjectId(String(productId)), status: "approved" } },
      { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);
    await Product.updateOne(
      { _id: productId },
      { $set: { ratingAvg: stats ? round1(stats.avg) : 0, ratingCount: stats ? stats.count : 0 } }
    );
  };

  // Pedido entregado/recogido del cliente que incluye el producto (o null).
  const findReceivingOrder = async (userId, productId) => {
    const Order = mongooseConnection.models.Order;
    const User = mongooseConnection.models.User;
    if (!Order) return null;
    const me = User && (await User.findById(userId).select("email").lean());
    const owner = me?.email ? { $or: [{ customer: userId }, { customerEmail: me.email }] } : { customer: userId };
    return Order.findOne({ ...owner, status: { $in: RECEIVED_STATUSES }, "items.product": productId })
      .sort({ createdAt: -1 })
      .select("_id orderNumber")
      .lean();
  };

  // Vista del cliente de su propia reseña (con estado y motivo de rechazo).
  const ownView = (review) => ({
    _id: review._id,
    product: review.target.id,
    rating: review.rating,
    comment: review.comment,
    status: review.status,
    rejectionReason: review.status === "rejected" ? review.rejectionReason : "",
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  });

  const publicView = (review) => ({
    _id: review._id,
    rating: review.rating,
    comment: review.comment,
    customerName: shortName(review.customerName),
    createdAt: review.createdAt,
  });

  // ---- públicas ----
  // GET /public?product=&page=&limit= → reseñas aprobadas + resumen
  // (promedio, conteo y cuántas de cada estrella).
  router.get("/public", async (req, res) => {
    try {
      const productId = req.query.product;
      if (!isValidObjectId(productId)) return sendError(res, 400, "VALIDATION_ERROR", "product no válido.");
      const match = { "target.kind": "product", "target.id": new mongoose.Types.ObjectId(String(productId)), status: "approved" };
      const limit = Math.min(Math.max(Math.floor(asFiniteNumber(req.query.limit) || 10), 1), MAX_PUBLIC_LIMIT);
      const page = Math.max(Math.floor(asFiniteNumber(req.query.page) || 1), 1);

      const [items, byRating] = await Promise.all([
        Review.find(match).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        Review.aggregate([{ $match: match }, { $group: { _id: "$rating", count: { $sum: 1 } } }]),
      ]);
      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      let total = 0;
      let sum = 0;
      for (const row of byRating) {
        distribution[row._id] = row.count;
        total += row.count;
        sum += row._id * row.count;
      }
      return res.status(200).json({
        items: items.map(publicView),
        total,
        page,
        limit,
        summary: { average: total ? round1(sum / total) : 0, count: total, distribution },
      });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar las reseñas.");
    }
  });

  const createRateLimiterForReviews = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 20,
    code: "RATE_LIMIT_REVIEWS_EXCEEDED",
    message: "Demasiadas reseñas seguidas. Intenta de nuevo más tarde.",
    sendError,
  });

  // ---- reseña post-cita (invitada con el enlace o clienta con sesión) ----
  // Mismo criterio que GET /api/appointments/public/:id: el token de la cita
  // (X-Appointment-Token) o la dueña con sesión (cuenta ligada o mismo correo).
  const loadAppointmentFor = async (req, res, appointmentId) => {
    const Appointment = mongooseConnection.models.Appointment;
    if (!isValidObjectId(appointmentId)) {
      sendError(res, 400, "VALIDATION_ERROR", "appointment no válido.");
      return null;
    }
    const appointment = Appointment ? await Appointment.findById(appointmentId).lean() : null;
    if (!appointment) {
      sendError(res, 404, "APPOINTMENT_NOT_FOUND", "Cita no encontrada.");
      return null;
    }
    const accessToken = req.header("X-Appointment-Token");
    if (accessToken) {
      try {
        if (verifyAppointmentAccessToken(accessToken).aid !== String(appointment._id)) throw new Error("otra cita");
        return appointment;
      } catch {
        sendError(res, 401, "APPOINTMENT_TOKEN_INVALID", "El enlace de la cita no es válido o ya venció.");
        return null;
      }
    }
    const bearer = extractBearerToken(req.header("Authorization"));
    if (!bearer) {
      sendError(res, 401, "TOKEN_REQUIRED", "Inicia sesión o usa el enlace de tu cita.");
      return null;
    }
    let decoded;
    try {
      decoded = verifyAccessToken(bearer);
    } catch {
      sendError(res, 401, "TOKEN_INVALID_OR_EXPIRED", "Token no válido o expirado.");
      return null;
    }
    const User = mongooseConnection.models.User;
    const me = User ? await User.findById(decoded.id).select("email").lean() : null;
    const isOwner =
      (appointment.customer && String(appointment.customer) === String(decoded.id)) ||
      (me?.email && me.email === appointment.customerEmail);
    if (!isOwner) {
      sendError(res, 404, "APPOINTMENT_NOT_FOUND", "Cita no encontrada.");
      return null;
    }
    return appointment;
  };

  const appointmentReviewView = (review) => ({
    _id: review._id,
    appointment: review.target.id,
    rating: review.rating,
    comment: review.comment,
    status: review.status,
    rejectionReason: review.status === "rejected" ? review.rejectionReason : "",
    createdAt: review.createdAt,
  });

  const appointmentSummary = (a) => ({
    _id: a._id,
    appointmentNumber: a.appointmentNumber,
    status: a.status,
    start: a.start,
    services: (a.services || []).map((sv) => sv.name),
    specialistName: a.specialistName,
  });

  // ¿Puede calificar esta cita? { canReview, reason?, review, appointment }.
  router.get("/appointment/:id", async (req, res) => {
    try {
      const appointment = await loadAppointmentFor(req, res, req.params.id);
      if (!appointment) return undefined;
      const review = await Review.findOne({ "target.kind": "appointment", "target.id": appointment._id }).lean();
      const completed = appointment.status === "completed";
      return res.status(200).json({
        canReview: completed && !review,
        reason: review ? "Ya calificaste esta cita." : completed ? undefined : "Podrás calificar tu cita cuando se complete.",
        review: review ? appointmentReviewView(review) : null,
        appointment: appointmentSummary(appointment),
      });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar la cita.");
    }
  });

  // Calificar una cita completada: { appointment, rating, comment }.
  router.post("/appointment", createRateLimiterForReviews, validateReviewPayload(sendError), async (req, res) => {
    try {
      const appointment = await loadAppointmentFor(req, res, req.body.appointment);
      if (!appointment) return undefined;
      if (appointment.status !== "completed") {
        return sendError(res, 409, "APPOINTMENT_NOT_COMPLETED", "Podrás calificar tu cita cuando se complete.");
      }
      // La reseña queda en la cuenta de la clienta: la ligada a la cita o la
      // de su mismo correo (aunque haya agendado como invitada).
      const User = mongooseConnection.models.User;
      let customer = appointment.customer || null;
      if (!customer && appointment.customerEmail && User) {
        customer = (await User.findOne({ email: appointment.customerEmail, role: "customer" }).select("_id").lean())?._id || null;
      }
      const review = await Review.create({
        target: { kind: "appointment", id: appointment._id },
        customer,
        customerName: appointment.customerName,
        customerEmail: appointment.customerEmail || "",
        appointmentInfo: {
          appointmentNumber: appointment.appointmentNumber,
          services: (appointment.services || []).map((sv) => sv.name),
          specialist: appointment.specialist || null,
          specialistName: appointment.specialistName || "",
          start: appointment.start,
        },
        rating: req.body.rating,
        comment: req.body.comment,
      });
      return res.status(201).json({ message: "¡Gracias por calificar tu cita!", review: appointmentReviewView(review) });
    } catch (error) {
      if (error?.code === 11000) return sendError(res, 409, "REVIEW_EXISTS", "Ya calificaste esta cita.");
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al guardar la reseña.");
    }
  });

  // ---- cliente con sesión ----
  router.use(verifyToken);

  // ¿Puede calificar este producto? { eligible, reason?, review? } — `review`
  // es la suya si ya calificó (para editarla).
  router.get("/eligibility", async (req, res) => {
    try {
      const productId = req.query.product;
      if (!isValidObjectId(productId)) return sendError(res, 400, "VALIDATION_ERROR", "product no válido.");
      const existing = await Review.findOne({ customer: req.user.id, "target.kind": "product", "target.id": productId }).lean();
      if (existing) return res.status(200).json({ eligible: true, review: ownView(existing) });
      const order = await findReceivingOrder(req.user.id, productId);
      if (!order) {
        return res.status(200).json({ eligible: false, reason: "Puedes calificar este producto cuando recibas un pedido que lo incluya." });
      }
      return res.status(200).json({ eligible: true, review: null });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al revisar si puedes calificar.");
    }
  });

  // Mis reseñas (para "Calificar" / "Ya calificaste" en Mis pedidos).
  router.get("/mine", async (req, res) => {
    try {
      const reviews = await Review.find({ customer: req.user.id, "target.kind": "product" }).sort({ createdAt: -1 }).lean();
      return res.status(200).json({ items: reviews.map(ownView) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar tus reseñas.");
    }
  });

  // Calificar un producto: { product, rating, comment }.
  router.post("/", createRateLimiterForReviews, validateReviewPayload(sendError), async (req, res) => {
    try {
      const { product: productId, rating, comment } = req.body;
      if (!isValidObjectId(productId)) return sendError(res, 400, "VALIDATION_ERROR", "product no válido.");
      const Product = mongooseConnection.models.Product;
      const product = Product && (await Product.findById(productId).select("_id").lean());
      if (!product) return sendError(res, 404, "PRODUCT_NOT_FOUND", "Producto no encontrado.");

      const order = await findReceivingOrder(req.user.id, productId);
      if (!order) {
        return sendError(res, 403, "REVIEW_NOT_ELIGIBLE", "Puedes calificar este producto cuando recibas un pedido que lo incluya.");
      }
      const User = mongooseConnection.models.User;
      const me = User && (await User.findById(req.user.id).select("name").lean());
      const review = await Review.create({
        target: { kind: "product", id: product._id },
        customer: req.user.id,
        customerName: me?.name || "",
        order: order._id,
        rating,
        comment,
      });
      return res.status(201).json({ message: "¡Gracias! Tu reseña se publicará cuando la tienda la revise.", review: ownView(review) });
    } catch (error) {
      if (error?.code === 11000) {
        return sendError(res, 409, "REVIEW_EXISTS", "Ya calificaste este producto: puedes editar tu reseña.");
      }
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al guardar la reseña.");
    }
  });

  // Editar mi reseña: vuelve a moderación (si estaba publicada, deja de
  // contar en el promedio hasta que la aprueben otra vez).
  router.put("/mine/:id", validateReviewPayload(sendError), async (req, res) => {
    try {
      if (!isValidObjectId(req.params.id)) return sendError(res, 400, "INVALID_OBJECT_ID", "id no válido");
      const review = await Review.findOne({ _id: req.params.id, customer: req.user.id });
      if (!review) return sendError(res, 404, "REVIEW_NOT_FOUND", "Reseña no encontrada.");
      const wasApproved = review.status === "approved";
      review.rating = req.body.rating;
      review.comment = req.body.comment;
      review.status = "pending";
      review.rejectionReason = "";
      review.reviewedBy = null;
      review.reviewedAt = null;
      await review.save();
      if (wasApproved) await recalculateProductRating(review.target.id);
      return res.status(200).json({ message: "Reseña actualizada: se publicará cuando la tienda la revise.", review: ownView(review) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al actualizar la reseña.");
    }
  });

  // ---- staff (moderación) ----
  const canModerate = createModuleAuthorizer({ mongooseConnection, sendError }).authorizeModule("reviews");

  const ensureReview = async (req, res, next) => {
    if (!isValidObjectId(req.params.id)) return sendError(res, 400, "INVALID_OBJECT_ID", "id no válido");
    const review = await Review.findById(req.params.id).catch(() => null);
    if (!review) return sendError(res, 404, "REVIEW_NOT_FOUND", "Reseña no encontrada.");
    req.review = review;
    return next();
  };

  // Reseñas ya publicadas como testimonio (StoreConfig.testimonials.fromReview).
  const testimonialReviewIds = async () => {
    const StoreConfig = mongooseConnection.models.StoreConfig;
    const config = StoreConfig ? await StoreConfig.findOne({ singletonKey: "default" }).select("testimonials.fromReview").lean() : null;
    return new Set((config?.testimonials || []).map((t) => t.fromReview && String(t.fromReview)).filter(Boolean));
  };

  // GET /?kind=product|appointment&status=&product= — las de producto con el
  // nombre del producto y el folio del pedido; las de cita con su foto de
  // servicios y especialista. `pendingByKind` = pendientes de cada tipo.
  router.get("/", canModerate, async (req, res) => {
    try {
      const kind = req.query.kind === "appointment" ? "appointment" : "product";
      const filter = { "target.kind": kind };
      if (REVIEW_STATUSES.includes(req.query.status)) filter.status = req.query.status;
      if (isValidObjectId(req.query.product)) filter["target.id"] = req.query.product;
      const reviews = await Review.find(filter)
        .sort({ createdAt: -1 })
        .limit(500)
        .populate("order", "orderNumber")
        .populate("customer", "email")
        .lean();
      const Product = mongooseConnection.models.Product;
      const productIds = kind === "product" ? [...new Set(reviews.map((r) => String(r.target.id)))] : [];
      const products = Product && productIds.length ? await Product.find({ _id: { $in: productIds } }).select("name images").lean() : [];
      const byId = new Map(products.map((p) => [String(p._id), p]));
      const [counts, pending, published] = await Promise.all([
        Review.aggregate([{ $match: { "target.kind": kind } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
        Review.aggregate([{ $match: { status: "pending" } }, { $group: { _id: "$target.kind", count: { $sum: 1 } } }]),
        testimonialReviewIds(),
      ]);
      return res.status(200).json({
        items: reviews.map((r) => {
          const product = kind === "product" ? byId.get(String(r.target.id)) : null;
          return {
            ...sanitizeDoc(r),
            product: product ? { _id: product._id, name: product.name, image: product.images?.[0] || "" } : null,
            isTestimonial: published.has(String(r._id)),
          };
        }),
        counts: Object.fromEntries(REVIEW_STATUSES.map((s) => [s, counts.find((c) => c._id === s)?.count || 0])),
        pendingByKind: Object.fromEntries(TARGET_KINDS.map((k) => [k, pending.find((c) => c._id === k)?.count || 0])),
      });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar las reseñas.");
    }
  });

  // Aprobar / rechazar: { status: "approved" | "rejected", rejectionReason? }.
  router.put("/:id", canModerate, ensureReview, async (req, res) => {
    try {
      const status = req.body?.status;
      if (!["approved", "rejected"].includes(status)) {
        return sendError(res, 400, "VALIDATION_ERROR", "status debe ser approved o rejected.");
      }
      const { review } = req;
      const changesPublished = (review.status === "approved") !== (status === "approved");
      review.status = status;
      review.rejectionReason = status === "rejected" ? asTrimmedString(req.body?.rejectionReason).slice(0, 300) : "";
      review.reviewedBy = req.user.id;
      review.reviewedAt = new Date();
      await review.save();
      if (changesPublished && review.target.kind === "product") await recalculateProductRating(review.target.id);
      return res.status(200).json({ message: status === "approved" ? "Reseña publicada." : "Reseña rechazada.", review: sanitizeDoc(review) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al moderar la reseña.");
    }
  });

  // Publicar como testimonio: copia nombre corto, comentario y estrellas a
  // StoreConfig.testimonials (al final, activo). Solo aprobadas; una vez por
  // reseña (si se borra el testimonio en "Configurar tienda", se puede volver
  // a publicar).
  router.post("/:id/testimonial", canModerate, ensureReview, async (req, res) => {
    try {
      const { review } = req;
      if (review.status !== "approved") {
        return sendError(res, 409, "REVIEW_NOT_APPROVED", "Primero aprueba la reseña.");
      }
      const StoreConfig = mongooseConnection.models.StoreConfig;
      const config = StoreConfig ? await StoreConfig.findOne({ singletonKey: "default" }).select("testimonials").lean() : null;
      if (!config) return sendError(res, 409, "STORE_CONFIG_MISSING", "Primero guarda la configuración de la tienda.");
      let rubro = "";
      if (review.target.kind === "appointment") {
        rubro = (review.appointmentInfo?.services || []).join(" + ");
      } else {
        const product = await mongooseConnection.models.Product?.findById(review.target.id).select("name").lean();
        rubro = product?.name || "";
      }
      const sortOrder = (config.testimonials || []).reduce((max, t) => Math.max(max, (t.sortOrder || 0) + 1), 0);
      const testimonial = {
        name: shortName(review.customerName),
        rubro: rubro.slice(0, 120),
        description: (review.comment || "").slice(0, 500),
        rating: review.rating,
        sortOrder,
        isActive: true,
        fromReview: review._id,
      };
      // Condicionado a que no esté ya: dos clics seguidos no la duplican.
      const result = await StoreConfig.updateOne(
        { singletonKey: "default", "testimonials.fromReview": { $ne: review._id } },
        { $push: { testimonials: testimonial } }
      );
      if (!result.modifiedCount) return sendError(res, 409, "TESTIMONIAL_EXISTS", "Esta reseña ya está en los testimonios.");
      return res.status(201).json({ message: "Publicada en los testimonios del sitio.", testimonial });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al publicar el testimonio.");
    }
  });

  router.delete("/:id", canModerate, ensureReview, async (req, res) => {
    try {
      const { review } = req;
      await review.deleteOne();
      if (review.status === "approved" && review.target.kind === "product") await recalculateProductRating(review.target.id);
      return res.status(200).json({ message: "Reseña eliminada." });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al eliminar la reseña.");
    }
  });

  app.use("/api/reviews", router);
}

module.exports = {
  name: "reviews",
  registerRoutes,
  models: { Review: reviewSchema },
};
