// Contabilidad de la tienda (`/api/store-accounting`, clave de permisos
// `storeAccounting`). Distinta de la contabilidad de la agencia
// (backend/routes/accounting.routes.js, clave `accounting`), que es la
// herramienta interna de Duck-Hack: esta se vende a cada tienda.
//
// - Movimientos manuales (gastos/ingresos con categoría libre) y saldo inicial.
// - Proveedores y compras: una compra recibida sube el inventario
//   (lib/stockMovements.js, crea el registro si no existía); pagada genera su
//   gasto (StoreTransaction source "purchase", editable solo desde la compra).
// - Ingresos automáticos DERIVADOS, no copiados: el libro y el resumen los
//   calculan al vuelo desde sus fuentes, así siempre cuadran con Reportes y no
//   hace falta enganchar cada módulo:
//     · pedidos pagados (lib/reportQueries.js#PAID_STATUSES, por fecha de
//       alta, como Reportes) — monto = `total` cobrado; lo pagado con tarjeta
//       de regalo ya entró como ingreso al venderse la tarjeta;
//     · tarjetas de regalo activadas (pagadas) y no canceladas, por activatedAt;
//     · anticipos de cita validados (depositPaidAt), sin la parte pagada con
//       tarjeta de regalo;
//     · abonos de mayoreo (modules/wholesale.js), si `wholesale` está contratado.
//   Cada fuente se omite si su módulo no está montado o contratado.
// Fechas en la zona horaria de la agenda (lib/reportQueries.js#timezoneOf).
const express = require("express");
const mongoose = require("mongoose");
const {
  sanitizeDoc,
  handleMongooseError,
  asTrimmedString,
  asFiniteNumber,
  isValidObjectId,
  getOrCreateModel,
  createWithFolio,
} = require("../lib/moduleHelpers");
const { createModuleAuthorizer, isModuleContracted } = require("../lib/permissions");
const { parseMxPhone } = require("../lib/phone");
const { adjustStock } = require("../lib/stockMovements");
const { MAX_LINES, round2, loadProducts, resolveProductLine, parseQuantity, parseMoney } = require("../lib/lineItems");
const { PAID_STATUSES, DAY, localMidnight, localDate, periodKey, timezoneOf, toCsv } = require("../lib/reportQueries");

const PAYMENT_METHODS = ["cash", "transfer", "card", "other"];
const TX_SOURCES = ["manual", "opening_balance", "purchase"];
const PURCHASE_STATUSES = ["draft", "received", "cancelled"];
const DERIVED_SOURCES = {
  orders: "Ventas en línea y mostrador",
  giftCards: "Tarjetas de regalo",
  deposits: "Anticipos de citas",
  wholesale: "Abonos de mayoreo",
};
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RFC_PATTERN = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const DEFAULT_PURCHASE_CATEGORY = "Compras";
// Sugerencias para el campo libre de categoría (más las que la tienda ya usó).
const SUGGESTED_CATEGORIES = ["Compras", "Renta", "Sueldos", "Luz", "Agua", "Gas", "Internet y teléfono", "Envíos", "Publicidad", "Mantenimiento", "Comisiones bancarias", "Impuestos", "Otros"];

const storeTransactionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["income", "expense"], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    date: { type: Date, required: true },
    category: { type: String, trim: true, maxlength: 80, default: "" },
    description: { type: String, trim: true, maxlength: 300, default: "" },
    paymentMethod: { type: String, enum: [...PAYMENT_METHODS, ""], default: "" },
    source: { type: String, enum: TX_SOURCES, default: "manual" },
    sourceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);
storeTransactionSchema.index({ date: -1 });
storeTransactionSchema.index({ source: 1, sourceId: 1 });

const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    contactName: { type: String, trim: true, maxlength: 120, default: "" },
    email: { type: String, trim: true, lowercase: true, maxlength: 160, default: "" },
    phone: { type: String, trim: true, default: "" },
    rfc: { type: String, trim: true, uppercase: true, maxlength: 13, default: "" },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
supplierSchema.index({ name: 1 });

const purchaseItemSchema = new mongoose.Schema(
  {
    // Opcional: insumos que no se venden (bolsas, filtros…) no llevan
    // producto y solo cuentan como gasto.
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    variant: { type: mongoose.Schema.Types.ObjectId, default: null },
    description: { type: String, required: true, trim: true, maxlength: 200 },
    quantity: { type: Number, required: true, min: 0.001 },
    unitCost: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const purchaseSchema = new mongoose.Schema(
  {
    folio: { type: Number, unique: true, sparse: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", required: true },
    supplierName: { type: String, trim: true, default: "" },
    date: { type: Date, required: true },
    // Folio/factura del proveedor, para cruzar con su comprobante.
    reference: { type: String, trim: true, maxlength: 80, default: "" },
    category: { type: String, trim: true, maxlength: 80, default: DEFAULT_PURCHASE_CATEGORY },
    items: { type: [purchaseItemSchema], default: [] },
    total: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: PURCHASE_STATUSES, default: "draft" },
    receivedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    paymentMethod: { type: String, enum: [...PAYMENT_METHODS, ""], default: "" },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);
purchaseSchema.index({ supplier: 1, date: -1 });
purchaseSchema.index({ status: 1, paidAt: 1 });

// AAAA-MM-DD o ISO → Date; vacío → fallback; inválido → undefined.
const parseDate = (value, fallback = null) => {
  if (value === undefined || value === null || value === "") return fallback;
  const date = new Date(DATE_PATTERN.test(String(value)) ? `${value}T12:00:00` : value);
  return Number.isNaN(+date) ? undefined : date;
};

const validateSupplierPayload = (sendError) => (req, res, next) => {
  const p = req.body || {};
  const out = {};
  if (req.method === "POST" || p.name !== undefined) {
    out.name = asTrimmedString(p.name);
    if (!out.name) return sendError(res, 400, "VALIDATION_ERROR", "El nombre del proveedor es obligatorio.");
    if (out.name.length > 120) return sendError(res, 400, "VALIDATION_ERROR", "El nombre admite hasta 120 caracteres.");
  }
  for (const [key, max] of [["contactName", 120], ["notes", 1000]]) {
    if (p[key] === undefined) continue;
    out[key] = asTrimmedString(p[key]);
    if (out[key].length > max) return sendError(res, 400, "VALIDATION_ERROR", `${key} admite hasta ${max} caracteres.`);
  }
  if (p.email !== undefined) {
    out.email = asTrimmedString(p.email).toLowerCase();
    if (out.email && !EMAIL_PATTERN.test(out.email)) return sendError(res, 400, "VALIDATION_ERROR", "El correo no es válido.");
  }
  if (p.phone !== undefined) {
    const parsed = parseMxPhone(p.phone);
    if (parsed.error) return sendError(res, 400, "VALIDATION_ERROR", parsed.error);
    out.phone = parsed.value;
  }
  if (p.rfc !== undefined) {
    out.rfc = asTrimmedString(p.rfc).toUpperCase();
    if (out.rfc && !RFC_PATTERN.test(out.rfc)) return sendError(res, 400, "VALIDATION_ERROR", "El RFC no es válido.");
  }
  if (p.isActive !== undefined) out.isActive = Boolean(p.isActive);
  req.body = out;
  return next();
};

const validateTransactionPayload = (sendError) => (req, res, next) => {
  const p = req.body || {};
  const isCreate = req.method === "POST";
  const out = {};
  if (isCreate || p.type !== undefined) {
    if (!["income", "expense"].includes(p.type)) return sendError(res, 400, "VALIDATION_ERROR", "El tipo debe ser ingreso o gasto.");
    out.type = p.type;
  }
  if (isCreate || p.amount !== undefined) {
    const amount = parseMoney(p.amount, "El monto");
    if (amount.error || amount.value < 0.01) return sendError(res, 400, "VALIDATION_ERROR", amount.error || "El monto debe ser mayor a 0.");
    out.amount = amount.value;
  }
  if (isCreate || p.date !== undefined) {
    const date = parseDate(p.date, isCreate ? new Date() : null);
    if (!date) return sendError(res, 400, "VALIDATION_ERROR", "La fecha no es válida.");
    out.date = date;
  }
  if (p.category !== undefined) {
    out.category = asTrimmedString(p.category);
    if (out.category.length > 80) return sendError(res, 400, "VALIDATION_ERROR", "La categoría admite hasta 80 caracteres.");
  }
  if (p.description !== undefined) {
    out.description = asTrimmedString(p.description);
    if (out.description.length > 300) return sendError(res, 400, "VALIDATION_ERROR", "La descripción admite hasta 300 caracteres.");
  }
  if (p.paymentMethod !== undefined) {
    if (p.paymentMethod && !PAYMENT_METHODS.includes(p.paymentMethod)) return sendError(res, 400, "VALIDATION_ERROR", "Forma de pago no válida.");
    out.paymentMethod = p.paymentMethod || "";
  }
  req.body = out;
  return next();
};

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, sendError } = ctx;
  const Transaction = getOrCreateModel(mongooseConnection, "StoreTransaction", storeTransactionSchema);
  const Supplier = getOrCreateModel(mongooseConnection, "Supplier", supplierSchema);
  const Purchase = getOrCreateModel(mongooseConnection, "Purchase", purchaseSchema);

  const router = express.Router();
  router.use(verifyToken);
  router.use(createModuleAuthorizer({ mongooseConnection, sendError }).authorizeModule("storeAccounting"));

  const validateObjectIdParam = (paramName) => (req, res, next) => {
    if (!isValidObjectId(req.params?.[paramName])) return sendError(res, 400, "INVALID_OBJECT_ID", `${paramName} no válido`);
    return next();
  };

  const loadDoc = (Model, key, code, label) => async (req, res, next) => {
    try {
      const doc = await Model.findById(req.params.id);
      if (!doc) return sendError(res, 404, code, `${label} no encontrado.`);
      req[key] = doc;
      return next();
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", `Error al consultar: ${label.toLowerCase()}.`);
    }
  };
  const loadTransaction = loadDoc(Transaction, "transaction", "TRANSACTION_NOT_FOUND", "Movimiento");
  const loadSupplier = loadDoc(Supplier, "supplier", "SUPPLIER_NOT_FOUND", "Proveedor");
  const loadPurchase = loadDoc(Purchase, "purchase", "PURCHASE_NOT_FOUND", "Compra");

  // ---- ingresos derivados ----

  // Fuentes activas: modelo montado y módulo contratado.
  const activeSources = async () => {
    const { Order, GiftCard, Appointment, WholesaleSale } = mongooseConnection.models;
    const [orders, giftCards, appointments, wholesale] = await Promise.all(
      ["orders", "giftCards", "appointments", "wholesale"].map((key) => isModuleContracted(mongooseConnection, key))
    );
    return {
      orders: orders && Order ? Order : null,
      giftCards: giftCards && GiftCard ? GiftCard : null,
      deposits: appointments && Appointment ? Appointment : null,
      wholesale: wholesale && WholesaleSale ? WholesaleSale : null,
    };
  };

  // Renglones de ingreso automático en [start, end):
  // { date, source, amount, description, refKind, refId }.
  const derivedIncome = async (start, end) => {
    const src = await activeSources();
    const rows = [];
    if (src.orders) {
      const orders = await src.orders.find({ createdAt: { $gte: start, $lt: end }, status: { $in: PAID_STATUSES }, total: { $gt: 0 } })
        .select("orderNumber total createdAt customerName paymentMethod")
        .lean();
      for (const o of orders) {
        rows.push({ date: o.createdAt, source: "orders", amount: round2(o.total), description: `Pedido #${o.orderNumber ?? ""} · ${o.customerName || ""}`.trim(), refKind: "Order", refId: o._id });
      }
    }
    if (src.giftCards) {
      const cards = await src.giftCards.find({ activatedAt: { $gte: start, $lt: end }, status: { $ne: "cancelled" } })
        .select("number amount activatedAt buyerName")
        .lean();
      for (const c of cards) {
        rows.push({ date: c.activatedAt, source: "giftCards", amount: round2(c.amount), description: `Tarjeta de regalo #${c.number ?? ""} · ${c.buyerName || ""}`.trim(), refKind: "GiftCard", refId: c._id });
      }
    }
    if (src.deposits) {
      const appts = await src.deposits.find({ depositPaidAt: { $gte: start, $lt: end }, depositAmount: { $gt: 0 } })
        .select("appointmentNumber depositAmount depositPaidAt depositGiftCard customerName")
        .lean();
      for (const a of appts) {
        const amount = round2(a.depositAmount - (a.depositGiftCard?.amount || 0));
        if (amount <= 0) continue;
        rows.push({ date: a.depositPaidAt, source: "deposits", amount, description: `Anticipo cita #${a.appointmentNumber ?? ""} · ${a.customerName || ""}`.trim(), refKind: "Appointment", refId: a._id });
      }
    }
    if (src.wholesale) {
      const payments = await src.wholesale.aggregate([
        { $match: { "payments.paidAt": { $gte: start, $lt: end } } },
        { $unwind: "$payments" },
        { $match: { "payments.paidAt": { $gte: start, $lt: end } } },
        { $project: { folio: 1, customerName: 1, payment: "$payments" } },
      ]);
      for (const p of payments) {
        rows.push({ date: p.payment.paidAt, source: "wholesale", amount: round2(p.payment.amount), description: `Abono mayoreo #${p.folio ?? ""} · ${p.customerName || ""}`.trim(), paymentMethod: p.payment.method, refKind: "WholesaleSale", refId: p._id });
      }
    }
    return rows;
  };

  // Suma de ingresos derivados antes de `date` (para el saldo acumulado).
  const derivedIncomeBefore = async (date) => {
    const src = await activeSources();
    const sum = async (Model, match, field) => {
      if (!Model) return 0;
      const [row] = await Model.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: field } } }]);
      return row?.total || 0;
    };
    const parts = await Promise.all([
      sum(src.orders, { createdAt: { $lt: date }, status: { $in: PAID_STATUSES } }, "$total"),
      sum(src.giftCards, { activatedAt: { $lt: date }, status: { $ne: "cancelled" } }, "$amount"),
      sum(src.deposits, { depositPaidAt: { $lt: date }, depositAmount: { $gt: 0 } }, { $max: [0, { $subtract: ["$depositAmount", { $ifNull: ["$depositGiftCard.amount", 0] }] }] }),
      src.wholesale
        ? src.wholesale
            .aggregate([{ $unwind: "$payments" }, { $match: { "payments.paidAt": { $lt: date } } }, { $group: { _id: null, total: { $sum: "$payments.amount" } } }])
            .then(([row]) => row?.total || 0)
        : 0,
    ]);
    return round2(parts.reduce((s, x) => s + x, 0));
  };

  // from/to (AAAA-MM-DD, zona de la agenda) → { start, end, tz } o { error }.
  const parseRange = async (query, maxDays = 366) => {
    const tz = await timezoneOf(mongooseConnection);
    const today = localDate(new Date(), tz);
    const to = DATE_PATTERN.test(query.to || "") ? query.to : today;
    const from = DATE_PATTERN.test(query.from || "") ? query.from : `${to.slice(0, 7)}-01`;
    if (from > to) return { error: "La fecha inicial debe ser antes que la final." };
    const start = localMidnight(from, tz);
    const end = new Date(+localMidnight(to, tz) + DAY);
    if ((end - start) / DAY > maxDays + 1) return { error: `El rango puede ser de hasta ${maxDays} días.` };
    return { from, to, start, end, tz };
  };

  // Libro: movimientos guardados + ingresos derivados, por fecha descendente.
  const buildLedger = async (start, end) => {
    const [stored, derived] = await Promise.all([
      Transaction.find({ date: { $gte: start, $lt: end } }).populate("by", "name").lean(),
      derivedIncome(start, end),
    ]);
    const rows = [
      ...stored.map((t) => ({ ...sanitizeDoc(t), editable: t.source === "manual" || t.source === "opening_balance", automatic: false })),
      ...derived.map((d) => ({ _id: `${d.refKind}:${d.refId}:${+new Date(d.date)}`, type: "income", category: DERIVED_SOURCES[d.source], editable: false, automatic: true, ...d })),
    ];
    rows.sort((a, b) => new Date(b.date) - new Date(a.date));
    return rows;
  };

  // ---- libro y movimientos manuales ----

  router.get("/ledger", async (req, res) => {
    try {
      const range = await parseRange(req.query);
      if (range.error) return sendError(res, 400, "VALIDATION_ERROR", range.error);
      let rows = await buildLedger(range.start, range.end);
      if (["income", "expense"].includes(req.query.type)) rows = rows.filter((r) => r.type === req.query.type);
      if (req.query.automatic === "true") rows = rows.filter((r) => r.automatic);
      if (req.query.automatic === "false") rows = rows.filter((r) => !r.automatic);
      const category = asTrimmedString(req.query.category);
      if (category) rows = rows.filter((r) => r.category === category);
      // Totales sin el saldo inicial (no es ingreso ni gasto del periodo).
      const flows = rows.filter((r) => r.source !== "opening_balance");
      const income = round2(flows.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0));
      const expense = round2(flows.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0));
      return res.status(200).json({ from: range.from, to: range.to, totals: { income, expense, net: round2(income - expense) }, rows });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al armar los movimientos.");
    }
  });

  router.get("/export", async (req, res) => {
    try {
      const range = await parseRange(req.query);
      if (range.error) return sendError(res, 400, "VALIDATION_ERROR", range.error);
      const rows = await buildLedger(range.start, range.end);
      const fmt = (d) => localDate(d, range.tz);
      const csv = toCsv([
        ["Fecha", "Tipo", "Categoría", "Descripción", "Monto", "Forma de pago", "Origen"],
        ...rows
          .slice()
          .reverse()
          .map((r) => [fmt(r.date), r.type === "income" ? "Ingreso" : "Gasto", r.category, r.description, r.type === "income" ? r.amount : -r.amount, r.paymentMethod || "", r.automatic ? "Automático" : r.source === "purchase" ? "Compra" : "Manual"]),
      ]);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="contabilidad-${range.from}-a-${range.to}.csv"`);
      return res.status(200).send(csv);
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al exportar los movimientos.");
    }
  });

  router.get("/categories", async (req, res) => {
    try {
      const used = (await Transaction.distinct("category")).filter(Boolean);
      const purchaseCats = (await Purchase.distinct("category")).filter(Boolean);
      const categories = [...new Set([...SUGGESTED_CATEGORIES, ...used, ...purchaseCats])].sort((a, b) => a.localeCompare(b, "es"));
      return res.status(200).json({ categories });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar las categorías.");
    }
  });

  router.post("/transactions", validateTransactionPayload(sendError), async (req, res) => {
    try {
      const tx = await Transaction.create({ ...req.body, source: "manual", by: req.user?.id || null });
      return res.status(201).json({ message: "Movimiento registrado.", transaction: sanitizeDoc(tx) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al registrar el movimiento.");
    }
  });

  const ensureManual = (req, res, next) => {
    if (req.transaction.source !== "manual") {
      return sendError(res, 409, "TRANSACTION_NOT_EDITABLE", req.transaction.source === "purchase" ? "Este gasto viene de una compra: edítalo desde la compra." : "Este movimiento no se edita aquí.");
    }
    return next();
  };

  router.put("/transactions/:id", validateObjectIdParam("id"), loadTransaction, ensureManual, validateTransactionPayload(sendError), async (req, res) => {
    try {
      req.transaction.set(req.body);
      await req.transaction.save();
      return res.status(200).json({ message: "Movimiento actualizado.", transaction: sanitizeDoc(req.transaction) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al actualizar el movimiento.");
    }
  });

  router.delete("/transactions/:id", validateObjectIdParam("id"), loadTransaction, ensureManual, async (req, res) => {
    await req.transaction.deleteOne();
    return res.status(200).json({ message: "Movimiento eliminado." });
  });

  // Saldo inicial (idempotente: uno solo, se reemplaza). Monto con signo:
  // negativo = la tienda arrancó debiendo.
  router.get("/opening-balance", async (req, res) => {
    const tx = await Transaction.findOne({ source: "opening_balance" }).lean();
    return res.status(200).json({ openingBalance: tx ? sanitizeDoc({ ...tx, signedAmount: tx.type === "income" ? tx.amount : -tx.amount }) : null });
  });

  router.post("/opening-balance", async (req, res) => {
    try {
      const amount = asFiniteNumber(req.body?.amount);
      const date = parseDate(req.body?.date, new Date());
      if (amount === null) return sendError(res, 400, "VALIDATION_ERROR", "El saldo inicial debe ser un número.");
      if (!date) return sendError(res, 400, "VALIDATION_ERROR", "La fecha no es válida.");
      if (Math.abs(amount) < 0.01) {
        await Transaction.deleteMany({ source: "opening_balance" });
        return res.status(200).json({ message: "Saldo inicial eliminado.", openingBalance: null });
      }
      const tx = await Transaction.findOneAndUpdate(
        { source: "opening_balance" },
        { $set: { type: amount >= 0 ? "income" : "expense", amount: round2(Math.abs(amount)), date, category: "Saldo inicial", description: "Saldo inicial", by: req.user?.id || null } },
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
      );
      return res.status(200).json({ message: "Saldo inicial guardado.", openingBalance: sanitizeDoc(tx) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al guardar el saldo inicial.");
    }
  });

  // ---- resumen ----

  // Por mes del año: ingresos por fuente, gastos por categoría, neto y saldo
  // acumulado; más por cobrar (mayoreo) y por pagar (compras recibidas sin pagar).
  router.get("/summary", async (req, res) => {
    try {
      const tz = await timezoneOf(mongooseConnection);
      const currentYear = Number(localDate(new Date(), tz).slice(0, 4));
      const year = /^\d{4}$/.test(String(req.query.year || "")) ? Number(req.query.year) : currentYear;
      const start = localMidnight(`${year}-01-01`, tz);
      const end = localMidnight(`${year + 1}-01-01`, tz);

      const [stored, derived, storedBefore, derivedBefore] = await Promise.all([
        Transaction.find({ date: { $gte: start, $lt: end } }).lean(),
        derivedIncome(start, end),
        Transaction.aggregate([{ $match: { date: { $lt: start } } }, { $group: { _id: "$type", total: { $sum: "$amount" } } }]),
        derivedIncomeBefore(start),
      ]);
      const before = Object.fromEntries(storedBefore.map((r) => [r._id, r.total]));
      let balance = round2((before.income || 0) - (before.expense || 0) + derivedBefore);

      const months = Array.from({ length: 12 }, (_, i) => ({
        month: `${year}-${String(i + 1).padStart(2, "0")}`,
        income: 0,
        expense: 0,
        incomeBySource: { orders: 0, giftCards: 0, deposits: 0, wholesale: 0, manual: 0 },
        expenseByCategory: {},
      }));
      const monthOf = (date) => months[Number(periodKey(date, tz, "month").slice(5, 7)) - 1];
      for (const d of derived) {
        const m = monthOf(d.date);
        m.income = round2(m.income + d.amount);
        m.incomeBySource[d.source] = round2(m.incomeBySource[d.source] + d.amount);
      }
      const categories = {};
      for (const t of stored) {
        // El saldo inicial no es ingreso/gasto del mes: se suma al saldo de arranque.
        if (t.source === "opening_balance") {
          balance = round2(balance + (t.type === "income" ? t.amount : -t.amount));
          continue;
        }
        const m = monthOf(t.date);
        if (t.type === "income") {
          m.income = round2(m.income + t.amount);
          m.incomeBySource.manual = round2(m.incomeBySource.manual + t.amount);
        } else {
          const cat = t.category || "Sin categoría";
          m.expense = round2(m.expense + t.amount);
          m.expenseByCategory[cat] = round2((m.expenseByCategory[cat] || 0) + t.amount);
          categories[cat] = round2((categories[cat] || 0) + t.amount);
        }
      }
      const openingBalance = balance;
      for (const m of months) {
        m.net = round2(m.income - m.expense);
        balance = round2(balance + m.net);
        m.closingBalance = balance;
      }

      const { WholesaleSale } = mongooseConnection.models;
      const [receivable, payable] = await Promise.all([
        WholesaleSale && (await isModuleContracted(mongooseConnection, "wholesale"))
          ? WholesaleSale.aggregate([{ $match: { status: "delivered", balance: { $gt: 0.004 } } }, { $group: { _id: null, total: { $sum: "$balance" } } }]).then(([r]) => round2(r?.total || 0))
          : null,
        Purchase.aggregate([{ $match: { status: "received", paidAt: null } }, { $group: { _id: null, total: { $sum: "$total" } } }]).then(([r]) => round2(r?.total || 0)),
      ]);

      const totals = months.reduce(
        (acc, m) => ({ income: round2(acc.income + m.income), expense: round2(acc.expense + m.expense) }),
        { income: 0, expense: 0 }
      );
      return res.status(200).json({
        year,
        openingBalance,
        months,
        totals: { ...totals, net: round2(totals.income - totals.expense) },
        expenseByCategory: Object.entries(categories).map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total),
        // El saldo "hoy" incluye años posteriores al consultado si los hay.
        currentBalance: year === currentYear ? balance : null,
        receivable,
        payable,
        sources: DERIVED_SOURCES,
      });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al calcular el resumen.");
    }
  });

  // ---- proveedores ----

  router.get("/suppliers", async (req, res) => {
    try {
      const filter = {};
      if (req.query.active === "true") filter.isActive = true;
      const suppliers = await Supplier.find(filter).sort({ name: 1 }).lean();
      const pending = await Purchase.aggregate([
        { $match: { status: "received", paidAt: null } },
        { $group: { _id: "$supplier", payable: { $sum: "$total" } } },
      ]);
      const payableBy = new Map(pending.map((r) => [String(r._id), round2(r.payable)]));
      return res.status(200).json({ suppliers: suppliers.map((s) => ({ ...sanitizeDoc(s), payable: payableBy.get(String(s._id)) || 0 })) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar los proveedores.");
    }
  });

  router.post("/suppliers", validateSupplierPayload(sendError), async (req, res) => {
    try {
      const supplier = await Supplier.create(req.body);
      return res.status(201).json({ message: "Proveedor registrado.", supplier: sanitizeDoc(supplier) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al registrar el proveedor.");
    }
  });

  router.get("/suppliers/:id", validateObjectIdParam("id"), loadSupplier, async (req, res) => {
    const purchases = await Purchase.find({ supplier: req.supplier._id }).sort({ date: -1 }).limit(200).select("-items").lean();
    return res.status(200).json({ ...sanitizeDoc(req.supplier), purchases: purchases.map(sanitizeDoc) });
  });

  router.put("/suppliers/:id", validateObjectIdParam("id"), loadSupplier, validateSupplierPayload(sendError), async (req, res) => {
    try {
      req.supplier.set(req.body);
      await req.supplier.save();
      return res.status(200).json({ message: "Proveedor actualizado.", supplier: sanitizeDoc(req.supplier) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al actualizar el proveedor.");
    }
  });

  router.delete("/suppliers/:id", validateObjectIdParam("id"), loadSupplier, async (req, res) => {
    if (await Purchase.exists({ supplier: req.supplier._id })) {
      return sendError(res, 409, "SUPPLIER_HAS_PURCHASES", "El proveedor tiene compras registradas: desactívalo en lugar de borrarlo.");
    }
    await req.supplier.deleteOne();
    return res.status(200).json({ message: "Proveedor eliminado." });
  });

  // ---- compras ----

  // Renglones → { items, total } o { error }. Con producto, la descripción
  // por defecto es el nombre (y variante) del catálogo.
  const buildPurchaseLines = async (rawItems) => {
    if (!Array.isArray(rawItems) || rawItems.length === 0) return { error: "La compra necesita al menos un renglón." };
    if (rawItems.length > MAX_LINES) return { error: `La compra admite hasta ${MAX_LINES} renglones.` };
    const withProduct = rawItems.filter((r) => r?.product);
    const productsById = await loadProducts(mongooseConnection, withProduct);
    const items = [];
    for (const [index, raw] of rawItems.entries()) {
      let product = null;
      let variant = null;
      let description = asTrimmedString(raw?.description);
      if (raw?.product) {
        const line = resolveProductLine(productsById, raw, index);
        if (line.error) return line;
        product = line.value.product;
        variant = line.value.variant;
        if (!description) description = [line.value.productName, line.value.variantLabel].filter(Boolean).join(" · ");
      }
      if (!description) return { error: `El renglón ${index + 1} necesita un producto o una descripción.` };
      if (description.length > 200) return { error: `La descripción del renglón ${index + 1} admite hasta 200 caracteres.` };
      const quantity = parseQuantity(raw.quantity, index);
      if (quantity.error) return quantity;
      const unitCost = parseMoney(raw.unitCost, `El costo del renglón ${index + 1}`);
      if (unitCost.error) return unitCost;
      items.push({ product, variant, description, quantity: quantity.value, unitCost: unitCost.value, subtotal: round2(quantity.value * unitCost.value) });
    }
    return { items, total: round2(items.reduce((s, i) => s + i.subtotal, 0)) };
  };

  // Deja el gasto de la compra igual que la compra (o lo borra si no está
  // pagada o se canceló).
  const syncPurchaseExpense = async (purchase) => {
    if (!purchase.paidAt || purchase.status === "cancelled" || purchase.total <= 0) {
      await Transaction.deleteMany({ source: "purchase", sourceId: purchase._id });
      return;
    }
    await Transaction.findOneAndUpdate(
      { source: "purchase", sourceId: purchase._id },
      {
        $set: {
          type: "expense",
          amount: purchase.total,
          date: purchase.paidAt,
          category: purchase.category || DEFAULT_PURCHASE_CATEGORY,
          description: `Compra #${purchase.folio} · ${purchase.supplierName}${purchase.reference ? ` (${purchase.reference})` : ""}`,
          paymentMethod: purchase.paymentMethod || "",
        },
      },
      { upsert: true, setDefaultsOnInsert: true, runValidators: true }
    );
  };

  const stockLines = (purchase, sign) =>
    purchase.items.filter((i) => i.product).map((i) => ({ product: i.product, variant: i.variant, delta: sign * i.quantity }));

  router.get("/purchases", async (req, res) => {
    try {
      const filter = {};
      if (isValidObjectId(req.query.supplier)) filter.supplier = req.query.supplier;
      if (PURCHASE_STATUSES.includes(req.query.status)) filter.status = req.query.status;
      if (req.query.paid === "true") filter.paidAt = { $ne: null };
      if (req.query.paid === "false") filter.paidAt = null;
      const purchases = await Purchase.find(filter).sort({ date: -1, folio: -1 }).limit(500).select("-items").lean();
      return res.status(200).json({ purchases: purchases.map(sanitizeDoc) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar las compras.");
    }
  });

  const parsePurchaseHeader = async (p, current) => {
    const out = {};
    if (p.supplier !== undefined || !current) {
      if (!isValidObjectId(p.supplier)) return { error: "Elige el proveedor." };
      const supplier = await Supplier.findById(p.supplier).lean();
      if (!supplier) return { error: "El proveedor no existe." };
      out.supplier = supplier._id;
      out.supplierName = supplier.name;
    }
    if (p.date !== undefined || !current) {
      const date = parseDate(p.date, new Date());
      if (!date) return { error: "La fecha no es válida." };
      out.date = date;
    }
    for (const [key, max] of [["reference", 80], ["category", 80], ["notes", 1000]]) {
      if (p[key] === undefined) continue;
      out[key] = asTrimmedString(p[key]);
      if (out[key].length > max) return { error: `${key} admite hasta ${max} caracteres.` };
    }
    if (out.category === "") out.category = DEFAULT_PURCHASE_CATEGORY;
    return { value: out };
  };

  router.post("/purchases", async (req, res) => {
    try {
      const p = req.body || {};
      const header = await parsePurchaseHeader(p, null);
      if (header.error) return sendError(res, 400, "VALIDATION_ERROR", header.error);
      const lines = await buildPurchaseLines(p.items);
      if (lines.error) return sendError(res, 400, "VALIDATION_ERROR", lines.error);
      const purchase = await createWithFolio(Purchase, "folio", { ...header.value, ...lines, createdBy: req.user?.id || null });
      return res.status(201).json({ message: "Compra registrada.", purchase: sanitizeDoc(purchase) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al registrar la compra.");
    }
  });

  router.get("/purchases/:id", validateObjectIdParam("id"), loadPurchase, async (req, res) => {
    await req.purchase.populate("supplier", "name contactName email phone");
    return res.status(200).json(sanitizeDoc(req.purchase));
  });

  // Renglones solo en borrador sin pagar; lo demás (fecha, referencia,
  // categoría, notas) siempre, y el gasto ligado se actualiza solo.
  router.put("/purchases/:id", validateObjectIdParam("id"), loadPurchase, async (req, res) => {
    try {
      const p = req.body || {};
      if (req.purchase.status === "cancelled") return sendError(res, 409, "PURCHASE_CANCELLED", "La compra está cancelada.");
      const header = await parsePurchaseHeader(p, req.purchase);
      if (header.error) return sendError(res, 400, "VALIDATION_ERROR", header.error);
      if (p.items !== undefined || header.value.supplier) {
        if (req.purchase.status !== "draft" || req.purchase.paidAt) {
          return sendError(res, 409, "PURCHASE_NOT_EDITABLE", "Proveedor y renglones solo se cambian en una compra en borrador y sin pagar.");
        }
      }
      if (p.items !== undefined) {
        const lines = await buildPurchaseLines(p.items);
        if (lines.error) return sendError(res, 400, "VALIDATION_ERROR", lines.error);
        req.purchase.set(lines);
      }
      req.purchase.set(header.value);
      await req.purchase.save();
      await syncPurchaseExpense(req.purchase);
      return res.status(200).json({ message: "Compra actualizada.", purchase: sanitizeDoc(req.purchase) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al actualizar la compra.");
    }
  });

  router.delete("/purchases/:id", validateObjectIdParam("id"), loadPurchase, async (req, res) => {
    if (req.purchase.status !== "draft" || req.purchase.paidAt) {
      return sendError(res, 409, "PURCHASE_NOT_EDITABLE", "Solo se borran compras en borrador y sin pagar; las demás se cancelan.");
    }
    await req.purchase.deleteOne();
    return res.status(200).json({ message: "Compra eliminada." });
  });

  // Recibir: sube el inventario de los renglones con producto.
  router.post("/purchases/:id/receive", validateObjectIdParam("id"), loadPurchase, async (req, res) => {
    try {
      const receivedAt = parseDate(req.body?.receivedAt, new Date());
      if (!receivedAt) return sendError(res, 400, "VALIDATION_ERROR", "La fecha no es válida.");
      const purchase = await Purchase.findOneAndUpdate({ _id: req.purchase._id, status: "draft" }, { $set: { status: "received", receivedAt } }, { new: true });
      if (!purchase) return sendError(res, 409, "PURCHASE_NOT_DRAFT", "La compra ya fue recibida o cancelada.");
      await adjustStock(mongooseConnection, stockLines(purchase, 1), { reason: "purchase", refKind: "Purchase", refId: purchase._id, refLabel: `Compra #${purchase.folio}`, by: req.user?.id || null }, { createIfMissing: true });
      return res.status(200).json({ message: "Compra recibida: inventario actualizado.", purchase: sanitizeDoc(purchase) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al recibir la compra.");
    }
  });

  // Pagar (o corregir fecha/forma de pago): genera o actualiza su gasto.
  router.post("/purchases/:id/pay", validateObjectIdParam("id"), loadPurchase, async (req, res) => {
    try {
      if (req.purchase.status === "cancelled") return sendError(res, 409, "PURCHASE_CANCELLED", "La compra está cancelada.");
      const paidAt = parseDate(req.body?.paidAt, new Date());
      if (!paidAt) return sendError(res, 400, "VALIDATION_ERROR", "La fecha de pago no es válida.");
      const method = req.body?.paymentMethod;
      if (method && !PAYMENT_METHODS.includes(method)) return sendError(res, 400, "VALIDATION_ERROR", "Forma de pago no válida.");
      req.purchase.paidAt = paidAt;
      req.purchase.paymentMethod = method || "";
      await req.purchase.save();
      await syncPurchaseExpense(req.purchase);
      return res.status(200).json({ message: "Pago de la compra registrado.", purchase: sanitizeDoc(req.purchase) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al registrar el pago.");
    }
  });

  router.delete("/purchases/:id/pay", validateObjectIdParam("id"), loadPurchase, async (req, res) => {
    try {
      req.purchase.paidAt = null;
      req.purchase.paymentMethod = "";
      await req.purchase.save();
      await syncPurchaseExpense(req.purchase);
      return res.status(200).json({ message: "Pago de la compra eliminado.", purchase: sanitizeDoc(req.purchase) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al quitar el pago.");
    }
  });

  // Cancelar: si ya se recibió, saca del inventario lo que entró. Pagada no
  // (primero se quita el pago: el dinero ya salió).
  router.post("/purchases/:id/cancel", validateObjectIdParam("id"), loadPurchase, async (req, res) => {
    try {
      if (req.purchase.paidAt) return sendError(res, 409, "PURCHASE_PAID", "La compra está pagada: quita el pago antes de cancelarla.");
      const previousStatus = req.purchase.status;
      if (previousStatus === "cancelled") return sendError(res, 409, "PURCHASE_CANCELLED", "La compra ya está cancelada.");
      const purchase = await Purchase.findOneAndUpdate(
        { _id: req.purchase._id, status: previousStatus, paidAt: null },
        { $set: { status: "cancelled", cancelledAt: new Date() } },
        { new: true }
      );
      if (!purchase) return sendError(res, 409, "PURCHASE_CHANGED", "La compra cambió mientras tanto; recarga e intenta de nuevo.");
      if (previousStatus === "received") {
        await adjustStock(mongooseConnection, stockLines(purchase, -1), { reason: "purchase_cancel", refKind: "Purchase", refId: purchase._id, refLabel: `Compra #${purchase.folio}`, by: req.user?.id || null });
      }
      await syncPurchaseExpense(purchase);
      return res.status(200).json({ message: "Compra cancelada.", purchase: sanitizeDoc(purchase) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al cancelar la compra.");
    }
  });

  app.use("/api/store-accounting", router);
}

module.exports = {
  name: "storeAccounting",
  registerRoutes,
  models: { StoreTransaction: storeTransactionSchema, Supplier: supplierSchema, Purchase: purchaseSchema },
};
