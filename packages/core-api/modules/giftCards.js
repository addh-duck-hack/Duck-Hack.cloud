// Tarjetas de regalo (`/api/gift-cards`, clave de permisos `giftCards`; Fase
// 5.2 del Roadmap de cotizaciones, Obsidian "Fase 5 - Dinero").
//
// Una tarjeta es saldo en pesos que se usa en partes: en el checkout de la
// tienda (`giftCardCode` en POST /api/orders/public), en el salón (la
// recepción la canjea desde el admin al cobrar la cita) o para pagar el
// anticipo de una cita (POST /api/appointments/public/:id/deposit-gift-card).
// Lógica compartida (códigos, cargo y abono atómicos) en lib/giftCards.js.
//
// Ciclo de vida:
// - Compra en el sitio → `pending_payment`. Quien compra recibe los datos
//   SPEI y sube su comprobante (lib/paymentProofs.js) con el token de la
//   compra (X-Gift-Card-Token) o su sesión. El staff lo aprueba → `active`:
//   vigencia desde ese día y correo a quien la recibe con la tarjeta en PDF
//   (ctx.generateGiftCardPdf, backend/utils/giftCardPdf.js), con copia a
//   quien la compró.
// - Venta en mostrador (staff) → `active` desde el alta.
// - Saldo en 0 → `used` (vuelve a `active` si se le regresa saldo); vencida
//   → `expired` (tarea diaria "gift-card-expiry"); `cancelled` a mano.
const express = require("express");
const mongoose = require("mongoose");
const { PassThrough } = require("stream");
const { sanitizeDoc, handleMongooseError, asTrimmedString, asFiniteNumber, isValidObjectId, getOrCreateModel } = require("../lib/moduleHelpers");
const { createModuleAuthorizer, isModuleContracted } = require("../lib/permissions");
const { createRateLimiter } = require("../lib/rateLimit");
const { extractBearerToken, ROLES } = require("../lib/authMiddleware");
const { verifyAccessToken, signGiftCardAccessToken, verifyGiftCardAccessToken } = require("../lib/jwt");
const { normalizeMxPhone } = require("../lib/phone");
const { notify } = require("../lib/notify");
const { giftCardEmailTemplate, storeSpeiAccount } = require("../lib/emailTemplates");
const { createPaymentProofUploadMiddlewares } = require("../lib/uploads");
const { paymentProofSchema, proofRecordFrom, findProof, streamProofFile, discardProofFile } = require("../lib/paymentProofs");
const { round2, generateCode, normalizeCode, isExpired, findUsableCard, debitCard, creditCard } = require("../lib/giftCards");

const STATUSES = ["pending_payment", "active", "used", "expired", "cancelled"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PROOFS = 10;
const MOVEMENT_TYPES = ["purchase", "redeem", "refund", "adjust", "expire", "cancel"];

const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  suggestedAmounts: [300, 500, 1000],
  minAmount: 100,
  maxAmount: 10000,
  allowCustomAmount: true,
  validityMonths: 12,
});

const settingsSchema = new mongoose.Schema(
  {
    singletonKey: { type: String, default: "default", unique: true, immutable: true },
    // false = el sitio no vende (las ya vendidas se siguen canjeando).
    enabled: { type: Boolean, default: DEFAULT_SETTINGS.enabled },
    suggestedAmounts: { type: [Number], default: () => [...DEFAULT_SETTINGS.suggestedAmounts] },
    minAmount: { type: Number, min: 1, default: DEFAULT_SETTINGS.minAmount },
    maxAmount: { type: Number, min: 1, default: DEFAULT_SETTINGS.maxAmount },
    allowCustomAmount: { type: Boolean, default: DEFAULT_SETTINGS.allowCustomAmount },
    // Meses desde que se activa; 0 = no vence.
    validityMonths: { type: Number, min: 0, max: 60, default: DEFAULT_SETTINGS.validityMonths },
    lastNumber: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const movementSchema = new mongoose.Schema(
  {
    type: { type: String, enum: MOVEMENT_TYPES, required: true },
    // + abono / − cargo.
    delta: { type: Number, required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", default: null },
    note: { type: String, trim: true, maxlength: 200, default: "" },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const giftCardSchema = new mongoose.Schema(
  {
    number: { type: Number, index: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    amount: { type: Number, required: true, min: 1 },
    balance: { type: Number, required: true, min: 0 },
    status: { type: String, enum: STATUSES, default: "pending_payment" },
    source: { type: String, enum: ["web", "staff"], default: "web" },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    buyerName: { type: String, required: true, trim: true, maxlength: 120 },
    buyerEmail: { type: String, trim: true, lowercase: true, maxlength: 160, default: "" },
    buyerPhone: { type: String, trim: true, maxlength: 10, default: "" },
    recipientName: { type: String, trim: true, maxlength: 120, default: "" },
    recipientEmail: { type: String, trim: true, lowercase: true, maxlength: 160, default: "" },
    message: { type: String, trim: true, maxlength: 300, default: "" },
    activatedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    // Venta en mostrador: cómo pagó (efectivo, tarjeta…).
    paymentNote: { type: String, trim: true, maxlength: 200, default: "" },
    paymentProofs: { type: [paymentProofSchema], default: [] },
    movements: { type: [movementSchema], default: [] },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, trim: true, maxlength: 300, default: "" },
  },
  { timestamps: true }
);
giftCardSchema.index({ status: 1, expiresAt: 1 });
giftCardSchema.index({ buyerEmail: 1, createdAt: -1 });
giftCardSchema.index({ recipientEmail: 1, createdAt: -1 });

const getSettings = async (connection) => {
  const Settings = connection.models.GiftCardSettings;
  const doc = Settings ? await Settings.findOne({ singletonKey: "default" }).lean() : null;
  const out = { ...DEFAULT_SETTINGS, suggestedAmounts: [...DEFAULT_SETTINGS.suggestedAmounts] };
  if (doc) for (const key of Object.keys(DEFAULT_SETTINGS)) if (doc[key] !== undefined && doc[key] !== null) out[key] = doc[key];
  return out;
};

const validateSettingsPayload = (sendError) => (req, res, next) => {
  const p = req.body || {};
  const out = {};
  for (const flag of ["enabled", "allowCustomAmount"]) if (p[flag] !== undefined) out[flag] = Boolean(p[flag]);
  for (const [field, min, max] of [["minAmount", 1, 100000], ["maxAmount", 1, 100000], ["validityMonths", 0, 60]]) {
    if (p[field] === undefined) continue;
    const n = asFiniteNumber(p[field]);
    if (n === null || n < min || n > max || (field === "validityMonths" && !Number.isInteger(n))) {
      return sendError(res, 400, "VALIDATION_ERROR", `${field} debe ser un número de ${min} a ${max}.`);
    }
    out[field] = n;
  }
  if (p.suggestedAmounts !== undefined) {
    if (!Array.isArray(p.suggestedAmounts) || p.suggestedAmounts.length > 8) {
      return sendError(res, 400, "VALIDATION_ERROR", "suggestedAmounts debe ser una lista de hasta 8 montos.");
    }
    const amounts = p.suggestedAmounts.map(asFiniteNumber);
    if (amounts.some((n) => n === null || n <= 0)) return sendError(res, 400, "VALIDATION_ERROR", "Los montos sugeridos deben ser mayores a 0.");
    out.suggestedAmounts = [...new Set(amounts.map(round2))].sort((a, b) => a - b);
  }
  req.body = out;
  return next();
};

// Corre una tarea por conexión (registerJobs → lib/scheduler.js).
const expiryRunners = new WeakMap();

const addMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, sendError, generateGiftCardPdf } = ctx;
  const Settings = getOrCreateModel(mongooseConnection, "GiftCardSettings", settingsSchema);
  const GiftCard = getOrCreateModel(mongooseConnection, "GiftCard", giftCardSchema);
  const router = express.Router();
  const authorizer = createModuleAuthorizer({ mongooseConnection, sendError });

  const nextNumber = async () => {
    const doc = await Settings.findOneAndUpdate({ singletonKey: "default" }, { $inc: { lastNumber: 1 } }, { new: true, upsert: true }).lean();
    return doc.lastNumber;
  };

  // Código único (reintenta si choca, muy improbable).
  const uniqueCode = async () => {
    for (let i = 0; i < 5; i += 1) {
      const code = generateCode();
      if (!(await GiftCard.exists({ code }))) return code;
    }
    throw new Error("No fue posible generar un código único.");
  };

  const loadStore = async () => {
    const StoreConfig = mongooseConnection.models.StoreConfig;
    return StoreConfig ? StoreConfig.findOne({ singletonKey: "default" }).lean() : null;
  };

  const brandingOf = (config) => {
    const backend = (process.env.BACKEND_PUBLIC_URL || "").replace(/\/+$/, "");
    return {
      storeName: config?.storeName || "Duck-Hack",
      logoUrl: backend && config?.logoUrl ? `${backend}/${String(config.logoUrl).replace(/^\/+/, "")}` : undefined,
      accent: config?.theme?.accentColor,
    };
  };

  const formatDay = (date) =>
    date ? new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", dateStyle: "long" }).format(new Date(date)) : "";

  // Página de la compra en el storefront (contrato: FRONTEND_URL/tarjeta-regalo/<id>?token=…).
  const purchaseUrl = (card) => {
    const base = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");
    if (!base) return null;
    return `${base}/tarjeta-regalo/${card._id}?token=${encodeURIComponent(signGiftCardAccessToken({ giftCardId: card._id }))}`;
  };
  const adminUrl = () => {
    const base = (process.env.ADMIN_URL || "").replace(/\/+$/, "");
    return base ? `${base}/#/admin/gift-cards` : null;
  };
  const businessEmail = (config) => config?.contactEmail || process.env.CONTACT_EMAIL_TO || process.env.EMAIL_USER;

  const renderPdf = (card, storeConfig) =>
    new Promise((resolve, reject) => {
      if (!generateGiftCardPdf) return resolve(null);
      const chunks = [];
      const stream = new PassThrough();
      stream.on("data", (c) => chunks.push(c));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
      try {
        generateGiftCardPdf(card, storeConfig, stream);
      } catch (error) {
        reject(error);
      }
      return undefined;
    });

  // Correos (best-effort: nunca tumban la respuesta).
  const sendEmails = async (card, kinds, { reason } = {}) => {
    const config = await loadStore();
    const branding = brandingOf(config);
    const expiresText = formatDay(card.expiresAt);
    const shopUrl = (process.env.FRONTEND_URL || "").replace(/\/+$/, "") || null;
    const send = async (to, kind, attachments) => {
      if (!to) return;
      const { subject, html, text } = giftCardEmailTemplate({
        kind,
        card,
        branding,
        expiresText,
        pageUrl: kind.startsWith("business") ? adminUrl() : purchaseUrl(card),
        spei: storeSpeiAccount(config),
        reason,
        shopUrl,
      });
      await notify({ channel: "email", to, subject, text, html, ...(attachments ? { attachments } : {}) });
    };
    for (const kind of kinds) {
      if (kind === "delivered") {
        const pdf = await renderPdf(card, config).catch(() => null);
        const attachments = pdf ? [{ filename: `tarjeta-regalo-${card.number}.pdf`, content: pdf, contentType: "application/pdf" }] : undefined;
        const recipient = card.recipientEmail || card.buyerEmail;
        await send(recipient, card.recipientEmail ? "delivered" : "buyer_copy", attachments);
        if (card.recipientEmail && card.buyerEmail && card.buyerEmail !== card.recipientEmail) await send(card.buyerEmail, "buyer_copy", attachments);
      } else if (kind === "business_new" || kind === "business_proof") {
        await send(businessEmail(config), kind);
      } else {
        await send(card.buyerEmail, kind);
      }
    }
  };
  const notifyCard = (card, kinds, extra) =>
    sendEmails(card, kinds, extra).catch((error) => console.error(`No fue posible enviar los correos de la tarjeta #${card.number}:`, error.message));

  // Activa una tarjeta pagada: vigencia desde hoy, movimiento de compra y correos.
  const activate = async (card, { by } = {}) => {
    const settings = await getSettings(mongooseConnection);
    const now = new Date();
    card.status = "active";
    card.activatedAt = now;
    card.expiresAt = settings.validityMonths > 0 ? addMonths(now, settings.validityMonths) : null;
    card.balance = card.amount;
    card.movements.push({ type: "purchase", delta: card.amount, note: card.source === "staff" ? "Venta en mostrador" : "Pago confirmado", by: by || null, at: now });
    card.deliveredAt = now;
    await card.save();
    notifyCard(card, ["delivered"]);
    return card;
  };

  // Lo que ve quien compró (sin datos de revisión ni código hasta que se active).
  const publicView = (card, spei) => ({
    _id: card._id,
    number: card.number,
    status: card.status,
    amount: card.amount,
    balance: ["active", "used", "expired"].includes(card.status) ? card.balance : undefined,
    code: ["active", "used", "expired"].includes(card.status) ? card.code : undefined,
    buyerName: card.buyerName,
    recipientName: card.recipientName,
    recipientEmail: card.recipientEmail,
    message: card.message,
    expiresAt: card.expiresAt,
    createdAt: card.createdAt,
    payment: card.status === "pending_payment" ? { spei, concept: `Tarjeta ${card.number}` } : null,
    paymentProofs: (card.paymentProofs || []).map((p) => ({ _id: p._id, status: p.status, uploadedAt: p.uploadedAt, rejectReason: p.status === "rejected" ? p.rejectReason : undefined })),
    canUploadProof: card.status === "pending_payment" && (card.paymentProofs || []).length < MAX_PROOFS,
  });

  const publicPayload = async (card) => publicView(card, card.status === "pending_payment" ? storeSpeiAccount(await loadStore()) : null);

  const optionalCustomer = (req) => {
    const token = extractBearerToken(req.header("Authorization"));
    if (!token) return null;
    try {
      const decoded = verifyAccessToken(token);
      return decoded.role === ROLES.CUSTOMER ? decoded.id : null;
    } catch {
      return null;
    }
  };

  const purchaseLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 10,
    code: "RATE_LIMIT_GIFT_CARDS_EXCEEDED",
    message: "Demasiados intentos. Intenta de nuevo en unos minutos.",
    sendError,
  });
  const checkLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 30,
    code: "RATE_LIMIT_GIFT_CARD_CHECK_EXCEEDED",
    message: "Demasiadas consultas de tarjetas. Intenta de nuevo en unos minutos.",
    sendError,
  });
  const proofLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    code: "RATE_LIMIT_PAYMENT_PROOF_EXCEEDED",
    message: "Demasiados comprobantes enviados. Intenta de nuevo en unos minutos.",
    sendError,
  });
  const proofUpload = createPaymentProofUploadMiddlewares({ fieldName: "file", sendError });

  // ================= Públicas =================

  // Lo que el storefront necesita para la página de compra.
  router.get("/public/settings", async (req, res) => {
    try {
      const settings = await getSettings(mongooseConnection);
      const contracted = await isModuleContracted(mongooseConnection, "giftCards");
      const spei = storeSpeiAccount(await loadStore());
      return res.status(200).json({
        // Se vende si el módulo está contratado, encendido y hay a dónde transferir.
        available: contracted && settings.enabled && Boolean(spei),
        suggestedAmounts: settings.suggestedAmounts,
        minAmount: settings.minAmount,
        maxAmount: settings.maxAmount,
        allowCustomAmount: settings.allowCustomAmount,
        validityMonths: settings.validityMonths,
      });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar las tarjetas de regalo.");
    }
  });

  // POST /public — comprar: { amount, buyerName, buyerEmail, buyerPhone?,
  // recipientName?, recipientEmail?, message? } + Bearer opcional.
  router.post("/public", purchaseLimiter, async (req, res) => {
    try {
      const settings = await getSettings(mongooseConnection);
      const config = await loadStore();
      const spei = storeSpeiAccount(config);
      if (!(await isModuleContracted(mongooseConnection, "giftCards")) || !settings.enabled || !spei) {
        return sendError(res, 409, "GIFT_CARDS_NOT_AVAILABLE", "Por ahora no vendemos tarjetas de regalo en línea.");
      }
      const p = req.body || {};
      const amount = round2(asFiniteNumber(p.amount));
      const allowed = settings.allowCustomAmount ? amount >= settings.minAmount && amount <= settings.maxAmount : settings.suggestedAmounts.includes(amount);
      if (!(amount > 0) || !allowed) {
        return sendError(
          res,
          400,
          "INVALID_AMOUNT",
          settings.allowCustomAmount
            ? `El monto debe ser de $${settings.minAmount} a $${settings.maxAmount}.`
            : `Elige uno de los montos: ${settings.suggestedAmounts.map((n) => `$${n}`).join(", ")}.`
        );
      }
      const contact = validateContact(p, { requireBuyerEmail: true });
      if (contact.error) return sendError(res, 400, "VALIDATION_ERROR", contact.error);
      const card = await GiftCard.create({
        number: await nextNumber(),
        code: await uniqueCode(),
        amount,
        balance: 0,
        status: "pending_payment",
        source: "web",
        buyer: optionalCustomer(req),
        ...contact.data,
      });
      notifyCard(card, ["pending_payment", "business_new"]);
      return res.status(201).json({
        message: "Tu tarjeta quedó apartada: transfiere el monto y sube tu comprobante para activarla.",
        giftCard: publicView(card, spei),
        giftCardAccessToken: signGiftCardAccessToken({ giftCardId: card._id }),
      });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al apartar la tarjeta de regalo.");
    }
  });

  // POST /check — saldo de un código (checkout y "consulta tu saldo").
  router.post("/check", checkLimiter, async (req, res) => {
    try {
      const found = await findUsableCard(mongooseConnection, req.body?.code);
      if (found.error) return sendError(res, found.error.status, found.error.code, found.error.message);
      return res.status(200).json({ code: found.card.code, balance: found.card.balance, expiresAt: found.card.expiresAt });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar la tarjeta.");
    }
  });

  // Quien compró: con el token de la compra (X-Gift-Card-Token) o su sesión
  // (cuenta ligada o mismo correo). Deja req.giftCard.
  const resolveBuyerAccess = async (req, res, next) => {
    try {
      if (!isValidObjectId(req.params.id)) return sendError(res, 400, "INVALID_OBJECT_ID", "id no válido");
      const card = await GiftCard.findById(req.params.id);
      if (!card) return sendError(res, 404, "GIFT_CARD_NOT_FOUND", "Tarjeta no encontrada.");
      const token = req.header("X-Gift-Card-Token");
      if (token) {
        try {
          const decoded = verifyGiftCardAccessToken(token);
          if (decoded.gid !== String(card._id)) throw new Error("otra tarjeta");
        } catch {
          return sendError(res, 401, "GIFT_CARD_TOKEN_INVALID", "El enlace de la tarjeta no es válido o ya venció.");
        }
        req.giftCard = card;
        return next();
      }
      const bearer = extractBearerToken(req.header("Authorization"));
      if (!bearer) return sendError(res, 401, "TOKEN_REQUIRED", "Inicia sesión o usa el enlace de tu compra.");
      let decoded;
      try {
        decoded = verifyAccessToken(bearer);
      } catch {
        return sendError(res, 401, "TOKEN_INVALID_OR_EXPIRED", "Token no válido o expirado.");
      }
      const User = mongooseConnection.models.User;
      const me = User ? await User.findById(decoded.id).select("email").lean() : null;
      const isOwner = (card.buyer && String(card.buyer) === String(decoded.id)) || (me?.email && me.email === card.buyerEmail);
      if (!isOwner) return sendError(res, 404, "GIFT_CARD_NOT_FOUND", "Tarjeta no encontrada.");
      req.giftCard = card;
      return next();
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar la tarjeta.");
    }
  };

  router.get("/public/:id", resolveBuyerAccess, async (req, res) => res.status(200).json({ giftCard: await publicPayload(req.giftCard) }));

  const ensureAwaitingPayment = (req, res, next) => {
    if (req.giftCard.status !== "pending_payment") return sendError(res, 409, "GIFT_CARD_NOT_AWAITING_PAYMENT", "Esta tarjeta ya no espera su pago.");
    if ((req.giftCard.paymentProofs || []).length >= MAX_PROOFS) {
      return sendError(res, 409, "TOO_MANY_PAYMENT_PROOFS", `Esta tarjeta ya tiene ${MAX_PROOFS} comprobantes; comunícate con nosotros.`);
    }
    return next();
  };

  router.post(
    "/public/:id/payment-proof",
    proofLimiter,
    resolveBuyerAccess,
    ensureAwaitingPayment,
    proofUpload.uploadMiddleware,
    proofUpload.sanitizeAndStoreMiddleware,
    async (req, res) => {
      try {
        const card = req.giftCard;
        card.paymentProofs.push(proofRecordFrom(req.savedProof, { uploadedBy: "customer" }));
        await card.save();
        notifyCard(card, ["business_proof"]);
        return res.status(201).json({ message: "Recibimos tu comprobante. Te avisaremos en cuanto activemos la tarjeta.", giftCard: await publicPayload(card) });
      } catch (error) {
        await discardProofFile(req.savedProof?.fileName);
        return handleMongooseError(sendError, res, error, "Error al guardar el comprobante.");
      }
    }
  );

  // PDF de la tarjeta para quien compró (solo activa).
  const sendPdf = async (res, card) => {
    if (!["active", "used", "expired"].includes(card.status)) return sendError(res, 409, "GIFT_CARD_NOT_ACTIVE", "La tarjeta todavía no está activa.");
    if (!generateGiftCardPdf) return sendError(res, 501, "PDF_NOT_AVAILABLE", "La tarjeta en PDF no está disponible.");
    const config = await loadStore();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="tarjeta-regalo-${card.number}.pdf"`);
    res.setHeader("Cache-Control", "private, no-store");
    generateGiftCardPdf(card, config, res);
    return undefined;
  };
  router.get("/public/:id/pdf", resolveBuyerAccess, (req, res) => sendPdf(res, req.giftCard));

  // Con sesión: las que compré y las que me regalaron (por correo).
  router.get("/mine", verifyToken, async (req, res) => {
    try {
      const User = mongooseConnection.models.User;
      const me = User ? await User.findById(req.user.id).select("email").lean() : null;
      const or = [{ buyer: req.user.id }];
      if (me?.email) or.push({ buyerEmail: me.email }, { recipientEmail: me.email });
      const cards = await GiftCard.find({ $or: or }).sort({ createdAt: -1 }).limit(100);
      return res.status(200).json({
        items: cards.map((c) => ({
          ...publicView(c, null),
          role: me?.email && c.recipientEmail === me.email && c.buyerEmail !== me.email ? "received" : "bought",
        })),
      });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar tus tarjetas.");
    }
  });

  // ================= Staff =================
  const staff = express.Router();
  staff.use(verifyToken);
  // Canjear y consultar por código también desde la Agenda (cobrar la cita).
  const canRedeem = authorizer.authorizeModule("giftCards", { alsoBy: ["appointments", "orders"] });
  const canManage = authorizer.authorizeModule("giftCards");

  staff.get("/settings", canManage, async (req, res) => res.status(200).json(await getSettings(mongooseConnection)));
  staff.put("/settings", canManage, validateSettingsPayload(sendError), async (req, res) => {
    try {
      const current = await getSettings(mongooseConnection);
      const next = { ...current, ...req.body };
      if (next.minAmount > next.maxAmount) return sendError(res, 400, "VALIDATION_ERROR", "El monto mínimo no puede ser mayor al máximo.");
      await Settings.updateOne({ singletonKey: "default" }, { $set: req.body }, { upsert: true, runValidators: true });
      return res.status(200).json({ message: "Ajustes guardados.", settings: await getSettings(mongooseConnection) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al guardar los ajustes.");
    }
  });

  // GET /?status=&q= (código, folio, nombre o correo).
  staff.get("/", canManage, async (req, res) => {
    try {
      const filter = {};
      if (req.query.status) {
        const statuses = String(req.query.status).split(",").filter((st) => STATUSES.includes(st));
        if (statuses.length) filter.status = { $in: statuses };
      }
      const q = asTrimmedString(req.query.q).slice(0, 100);
      if (q) {
        const code = normalizeCode(q);
        const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        filter.$or = [
          ...(code ? [{ code }] : []),
          ...(/^\d+$/.test(q) ? [{ number: Number(q) }] : []),
          { buyerName: rx },
          { buyerEmail: rx },
          { recipientName: rx },
          { recipientEmail: rx },
        ];
      }
      const items = await GiftCard.find(filter).sort({ createdAt: -1 }).limit(500).select("-movements -paymentProofs").lean();
      const pendingReview = await GiftCard.countDocuments({ status: "pending_payment", "paymentProofs.status": "pending" });
      return res.status(200).json({ items: items.map(sanitizeDoc), pendingReview });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar las tarjetas.");
    }
  });

  // GET /lookup?code= — saldo y estado para canjear desde la agenda o el mostrador.
  staff.get("/lookup", canRedeem, async (req, res) => {
    const code = normalizeCode(req.query.code);
    const card = code ? await GiftCard.findOne({ code }).select("-paymentProofs").lean() : null;
    if (!card) return sendError(res, 404, "GIFT_CARD_NOT_FOUND", "No encontramos esa tarjeta.");
    return res.status(200).json({
      _id: card._id,
      number: card.number,
      code: card.code,
      status: isExpired(card) && card.status === "active" ? "expired" : card.status,
      balance: card.balance,
      amount: card.amount,
      expiresAt: card.expiresAt,
      recipientName: card.recipientName,
    });
  });

  // POST / — venta en mostrador: queda activa. { amount, buyerName,
  // buyerEmail?, buyerPhone?, recipientName?, recipientEmail?, message?, paymentNote? }
  staff.post("/", canManage, async (req, res) => {
    try {
      const p = req.body || {};
      const amount = round2(asFiniteNumber(p.amount));
      if (!(amount > 0) || amount > 100000) return sendError(res, 400, "INVALID_AMOUNT", "Escribe un monto válido.");
      const contact = validateContact(p, { requireBuyerEmail: false });
      if (contact.error) return sendError(res, 400, "VALIDATION_ERROR", contact.error);
      const card = new GiftCard({
        number: await nextNumber(),
        code: await uniqueCode(),
        amount,
        balance: 0,
        source: "staff",
        paymentNote: asTrimmedString(p.paymentNote).slice(0, 200),
        ...contact.data,
      });
      await activate(card, { by: req.user.id });
      return res.status(201).json({ message: "Tarjeta vendida y activada.", giftCard: sanitizeDoc(card) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al vender la tarjeta.");
    }
  });

  const ID = "/:id([0-9a-fA-F]{24})";
  const loadCard = async (req, res, next) => {
    const card = await GiftCard.findById(req.params.id).catch(() => null);
    if (!card) return sendError(res, 404, "GIFT_CARD_NOT_FOUND", "Tarjeta no encontrada.");
    req.giftCard = card;
    return next();
  };

  staff.get(ID, canManage, loadCard, async (req, res) => {
    await req.giftCard.populate([{ path: "movements.order", select: "orderNumber" }, { path: "movements.appointment", select: "appointmentNumber" }, { path: "movements.by", select: "name" }]);
    return res.status(200).json(sanitizeDoc(req.giftCard));
  });

  staff.get(`${ID}/pdf`, canManage, loadCard, (req, res) => sendPdf(res, req.giftCard));

  staff.post(`${ID}/payment-proof`, canManage, loadCard, (req, res, next) => ensureAwaitingPayment(req, res, next), proofUpload.uploadMiddleware, proofUpload.sanitizeAndStoreMiddleware, async (req, res) => {
    try {
      req.giftCard.paymentProofs.push(proofRecordFrom(req.savedProof, { uploadedBy: "staff", userId: req.user.id }));
      await req.giftCard.save();
      return res.status(201).json({ message: "Comprobante agregado.", giftCard: sanitizeDoc(req.giftCard) });
    } catch (error) {
      await discardProofFile(req.savedProof?.fileName);
      return handleMongooseError(sendError, res, error, "Error al guardar el comprobante.");
    }
  });

  staff.get(`${ID}/payment-proofs/:proofId([0-9a-fA-F]{24})/file`, canManage, loadCard, async (req, res) => {
    const proof = findProof(req.giftCard, req.params.proofId);
    if (!proof) return sendError(res, 404, "PAYMENT_PROOF_NOT_FOUND", "Comprobante no encontrado.");
    const sent = await streamProofFile(res, proof);
    if (!sent) return sendError(res, 404, "PAYMENT_PROOF_FILE_NOT_FOUND", "El archivo del comprobante ya no existe.");
    return undefined;
  });

  // { decision: approve | reject, reason } — aprobar activa la tarjeta y la envía.
  staff.post(`${ID}/payment-proofs/:proofId([0-9a-fA-F]{24})/review`, canManage, loadCard, async (req, res) => {
    try {
      const card = req.giftCard;
      const decision = asTrimmedString(req.body?.decision);
      const reason = asTrimmedString(req.body?.reason).slice(0, 500);
      if (!["approve", "reject"].includes(decision)) return sendError(res, 400, "VALIDATION_ERROR", 'decision debe ser "approve" o "reject".');
      if (decision === "reject" && !reason) return sendError(res, 400, "VALIDATION_ERROR", "Escribe el motivo del rechazo (se le envía a quien compró).");
      const proof = findProof(card, req.params.proofId);
      if (!proof) return sendError(res, 404, "PAYMENT_PROOF_NOT_FOUND", "Comprobante no encontrado.");
      if (proof.status !== "pending") return sendError(res, 409, "PAYMENT_PROOF_ALREADY_REVIEWED", "Este comprobante ya fue revisado.");
      proof.status = decision === "approve" ? "approved" : "rejected";
      proof.reviewedBy = req.user.id;
      proof.reviewedAt = new Date();
      if (decision === "reject") {
        proof.rejectReason = reason;
        await card.save();
        notifyCard(card, ["proof_rejected"], { reason });
        return res.status(200).json({ message: "Comprobante rechazado.", giftCard: sanitizeDoc(card) });
      }
      if (card.status === "pending_payment") await activate(card, { by: req.user.id });
      else await card.save();
      return res.status(200).json({ message: "Pago aprobado: la tarjeta quedó activa y se envió.", giftCard: sanitizeDoc(card) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al revisar el comprobante.");
    }
  });

  // POST /:id/redeem { amount, note?, appointment? } — canje en el salón o en mostrador.
  const redeemHandler = async (req, res, card) => {
    const amount = round2(asFiniteNumber(req.body?.amount));
    if (!(amount > 0)) return sendError(res, 400, "INVALID_AMOUNT", "Escribe cuánto se cobra con la tarjeta.");
    const appointment = req.body?.appointment && isValidObjectId(req.body.appointment) ? req.body.appointment : null;
    if (isExpired(card) && card.status === "active") return sendError(res, 409, "GIFT_CARD_EXPIRED", "Esta tarjeta ya venció.");
    if (card.status !== "active") {
      return sendError(res, 409, "GIFT_CARD_NOT_ACTIVE", card.status === "used" ? "Esta tarjeta ya no tiene saldo." : "Esta tarjeta no está activa.");
    }
    if (amount > card.balance) {
      return sendError(res, 409, "GIFT_CARD_INSUFFICIENT", `La tarjeta solo tiene $${card.balance.toLocaleString("es-MX")} de saldo.`);
    }
    const updated = await debitCard(mongooseConnection, card._id, amount, {
      appointment,
      note: asTrimmedString(req.body?.note).slice(0, 200) || "Canje en el local",
      by: req.user.id,
    });
    if (!updated) return sendError(res, 409, "GIFT_CARD_INSUFFICIENT", "La tarjeta ya no alcanza (pudo usarse al mismo tiempo). Revisa el saldo.");
    return res.status(200).json({ message: `Se cobraron $${amount.toLocaleString("es-MX")}. Saldo: $${updated.balance.toLocaleString("es-MX")}.`, giftCard: sanitizeDoc(updated) });
  };
  staff.post(`${ID}/redeem`, canRedeem, loadCard, (req, res) => redeemHandler(req, res, req.giftCard).catch(() => sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al canjear la tarjeta.")));
  // POST /redeem { code, amount, note?, appointment? } — lo mismo por código (desde la agenda).
  staff.post("/redeem", canRedeem, async (req, res) => {
    try {
      const code = normalizeCode(req.body?.code);
      const card = code ? await GiftCard.findOne({ code }) : null;
      if (!card) return sendError(res, 404, "GIFT_CARD_NOT_FOUND", "No encontramos esa tarjeta.");
      return redeemHandler(req, res, card);
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al canjear la tarjeta.");
    }
  });

  // POST /:id/adjust { delta, note } — corrección de saldo (+/−), con motivo.
  staff.post(`${ID}/adjust`, canManage, loadCard, async (req, res) => {
    try {
      const card = req.giftCard;
      const delta = round2(asFiniteNumber(req.body?.delta));
      const note = asTrimmedString(req.body?.note).slice(0, 200);
      if (!delta) return sendError(res, 400, "VALIDATION_ERROR", "Escribe cuánto sumar o restar.");
      if (!note) return sendError(res, 400, "VALIDATION_ERROR", "Escribe el motivo del ajuste.");
      if (!["active", "used", "expired"].includes(card.status)) return sendError(res, 409, "GIFT_CARD_NOT_ACTIVE", "Solo se ajustan tarjetas activadas.");
      const updated =
        delta > 0
          ? await creditCard(mongooseConnection, card._id, delta, { type: "adjust", note, by: req.user.id })
          : await debitCard(mongooseConnection, card._id, -delta, { type: "adjust", note, by: req.user.id });
      if (!updated) return sendError(res, 409, "GIFT_CARD_INSUFFICIENT", "No hay saldo suficiente para restar eso (o la tarjeta venció).");
      return res.status(200).json({ message: "Saldo ajustado.", giftCard: sanitizeDoc(updated) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al ajustar la tarjeta.");
    }
  });

  // POST /:id/extend { expiresAt | null } — cambiar la vigencia (reactiva una vencida con saldo).
  staff.post(`${ID}/extend`, canManage, loadCard, async (req, res) => {
    try {
      const card = req.giftCard;
      if (!["active", "used", "expired"].includes(card.status)) return sendError(res, 409, "GIFT_CARD_NOT_ACTIVE", "Solo tarjetas activadas.");
      const raw = req.body?.expiresAt;
      const expiresAt = raw === null || raw === "" ? null : new Date(raw);
      if (expiresAt && (Number.isNaN(+expiresAt) || +expiresAt <= Date.now())) return sendError(res, 400, "VALIDATION_ERROR", "La nueva vigencia debe ser una fecha futura.");
      card.expiresAt = expiresAt;
      if (card.status === "expired") card.status = card.balance > 0 ? "active" : "used";
      await card.save();
      return res.status(200).json({ message: "Vigencia actualizada.", giftCard: sanitizeDoc(card) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al cambiar la vigencia.");
    }
  });

  // POST /:id/cancel { reason } — anula la tarjeta (sin pagar, o con saldo que ya no se reconoce).
  staff.post(`${ID}/cancel`, canManage, loadCard, async (req, res) => {
    try {
      const card = req.giftCard;
      if (card.status === "cancelled") return sendError(res, 409, "GIFT_CARD_CANCELLED", "La tarjeta ya está cancelada.");
      const reason = asTrimmedString(req.body?.reason).slice(0, 300);
      if (card.balance > 0) card.movements.push({ type: "cancel", delta: -card.balance, note: reason || "Cancelada", by: req.user.id });
      card.balance = 0;
      card.status = "cancelled";
      card.cancelledAt = new Date();
      card.cancelReason = reason;
      await card.save();
      return res.status(200).json({ message: "Tarjeta cancelada.", giftCard: sanitizeDoc(card) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al cancelar la tarjeta.");
    }
  });

  // POST /:id/resend { recipientEmail? } — reenviar la tarjeta (y corregir el correo).
  staff.post(`${ID}/resend`, canManage, loadCard, async (req, res) => {
    try {
      const card = req.giftCard;
      if (!["active", "used"].includes(card.status)) return sendError(res, 409, "GIFT_CARD_NOT_ACTIVE", "Solo se reenvían tarjetas activas.");
      if (req.body?.recipientEmail !== undefined) {
        const email = asTrimmedString(req.body.recipientEmail).toLowerCase();
        if (email && !EMAIL_REGEX.test(email)) return sendError(res, 400, "VALIDATION_ERROR", "El correo no es válido.");
        card.recipientEmail = email;
      }
      if (!card.recipientEmail && !card.buyerEmail) return sendError(res, 400, "VALIDATION_ERROR", "La tarjeta no tiene a qué correo enviarse.");
      card.deliveredAt = new Date();
      await card.save();
      await sendEmails(card, ["delivered"]);
      return res.status(200).json({ message: "Tarjeta reenviada.", giftCard: sanitizeDoc(card) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "No fue posible reenviar la tarjeta.");
    }
  });

  // ---- Vencimiento (tarea diaria) ----
  const runExpiry = async ({ now = new Date() } = {}) => {
    if (!(await isModuleContracted(mongooseConnection, "giftCards"))) return { skipped: "not_contracted" };
    const result = await GiftCard.updateMany({ status: { $in: ["active", "used"] }, expiresAt: { $ne: null, $lte: now } }, { $set: { status: "expired" } });
    return { expired: result.modifiedCount };
  };
  expiryRunners.set(mongooseConnection, runExpiry);

  router.use(staff);
  app.use("/api/gift-cards", router);
}

// Datos de quien compra y de quien recibe.
function validateContact(p, { requireBuyerEmail }) {
  const buyerName = asTrimmedString(p.buyerName);
  if (!buyerName || buyerName.length > 120) return { error: "Escribe el nombre de quien regala." };
  const buyerEmail = asTrimmedString(p.buyerEmail).toLowerCase();
  if ((requireBuyerEmail || buyerEmail) && (!EMAIL_REGEX.test(buyerEmail) || buyerEmail.length > 160)) return { error: "Escribe un correo válido de quien regala." };
  const buyerPhone = p.buyerPhone ? normalizeMxPhone(p.buyerPhone) : "";
  if (buyerPhone && !/^\d{10}$/.test(buyerPhone)) return { error: "El teléfono debe tener 10 dígitos." };
  const recipientName = asTrimmedString(p.recipientName);
  if (recipientName.length > 120) return { error: "El nombre de quien recibe es muy largo." };
  const recipientEmail = asTrimmedString(p.recipientEmail).toLowerCase();
  if (recipientEmail && (!EMAIL_REGEX.test(recipientEmail) || recipientEmail.length > 160)) return { error: "El correo de quien recibe no es válido." };
  const message = asTrimmedString(p.message);
  if (message.length > 300) return { error: "El mensaje puede tener hasta 300 caracteres." };
  return { data: { buyerName, buyerEmail, buyerPhone, recipientName, recipientEmail, message } };
}

function registerJobs(scheduler, ctx) {
  const runExpiry = expiryRunners.get(ctx.mongooseConnection);
  if (runExpiry) scheduler.register("gift-card-expiry", 24 * 60 * 60 * 1000, runExpiry);
}

module.exports = {
  name: "giftCards",
  registerRoutes,
  registerJobs,
  models: { GiftCardSettings: settingsSchema, GiftCard: giftCardSchema },
  getSettings,
};
